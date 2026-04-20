const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

// 单实例锁 - 防止多个 Electron 实例竞争同一个端口
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.error('另一个应用实例已在运行，退出当前实例...');
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// 设置 userData 路径为项目名，确保日志存放目录一致
const defaultUserData = app.getPath('userData');
const userDataPath = path.join(path.dirname(defaultUserData), 'claude-code-proxy');
app.setPath('userData', userDataPath);

// 必须先加载配置并设置日志路径，再加载其他依赖模块
const config = require('../src/config');
config.setUserDataPath(userDataPath);

const { startServer } = require('../src/index');
const { killProcessByPort, waitForPortRelease, checkPortInUse } = require('../src/utils/portCleaner');

// 保持全局引用，防止垃圾回收
let mainWindow = null;
let serverInstance = null;

// 服务器状态管理
let serverStatus = 'stopped'; // 'stopped' | 'starting' | 'running' | 'error'
let serverError = null;
let serverLogs = [];
const MAX_LOGS = 500;

/**
 * 添加日志到缓冲区并推送给前端
 * @param {string} level - 日志级别: log, error, warn, info
 * @param {string} message - 日志内容
 */
function addServerLog(level, message) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: String(message),
  };
  serverLogs.push(logEntry);
  if (serverLogs.length > MAX_LOGS) {
    serverLogs.shift();
  }
  // 推送给前端
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('server:log', logEntry);
  }
}

/**
 * 设置服务器状态并推送给前端
 * @param {string} status - 新状态
 * @param {string|null} error - 错误信息
 */
function setServerStatus(status, error = null) {
  serverStatus = status;
  serverError = error;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('server:status-change', {
      status,
      port: config.get('port'),
      error,
    });
  }
}

/**
 * 拦截 console 输出，收集服务端日志
 */
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

console.log = function (...args) {
  const message = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  addServerLog('log', message);
  originalConsoleLog.apply(console, args);
};

console.error = function (...args) {
  const message = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  addServerLog('error', message);
  originalConsoleError.apply(console, args);
};

console.warn = function (...args) {
  const message = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  addServerLog('warn', message);
  originalConsoleWarn.apply(console, args);
};

console.info = function (...args) {
  const message = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  addServerLog('info', message);
  originalConsoleInfo.apply(console, args);
};

/**
 * 创建主窗口
 */
function createWindow() {
  // 根据平台选择图标文件
  let iconFile = 'icon.icns';
  if (process.platform === 'win32') {
    iconFile = 'icon.ico';
  } else if (process.platform === 'linux') {
    iconFile = 'icon_512x512.png';
  }

  const windowIcon = path.join(__dirname, '../icons', iconFile);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    icon: windowIcon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
    titleBarStyle: 'default',
    show: false,
  });

  // 加载前端页面
  const isDevelopment = !app.isPackaged;
  console.log('[Electron] isDevelopment:', isDevelopment, 'isPackaged:', app.isPackaged);

  if (isDevelopment) {
    // 开发模式：加载 Vite 开发服务器
    console.log('[Electron] 开发模式：加载 http://localhost:5173');
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // 生产模式：加载打包后的静态文件
    const filePath = path.join(__dirname, '../web/claude-proxy-web/dist/index.html');
    console.log('[Electron] 生产模式：加载文件', filePath);
    mainWindow.loadFile(filePath);
  }

  // 监听加载失败事件
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[Electron] 页面加载失败:', errorCode, errorDescription, validatedURL);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // 窗口就绪后推送当前状态
    mainWindow.webContents.send('server:status-change', {
      status: serverStatus,
      port: config.get('port'),
      error: serverError,
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * 启动后端服务
 */
async function startBackend() {
  if (serverStatus === 'running' || serverStatus === 'starting') {
    console.log('服务已在运行或正在启动中');
    return { success: true };
  }

  setServerStatus('starting');

  // 设置日志目录为 Electron userData
  config.setUserDataPath(userDataPath);

  const port = config.get('port');

  // 检查端口是否被占用（可能是上次关闭未干净的旧实例）
  const inUse = await checkPortInUse(port);
  if (inUse) {
    console.log(`端口 ${port} 被占用，尝试清理占用进程...`);
    const killResult = await killProcessByPort(port);
    if (killResult.success) {
      console.log(`已清理占用进程: ${killResult.message}`);
      // 等待端口释放
      const released = await waitForPortRelease(port, 8000, 500);
      if (!released) {
        const error = `端口 ${port} 释放超时，请手动检查后重试`;
        console.error(error);
        setServerStatus('error', error);
        return { success: false, error };
      }
      console.log(`端口 ${port} 已释放`);
    } else {
      console.warn(`清理进程失败: ${killResult.message}，继续尝试启动...`);
    }
  }

  try {
    const result = await startServer();
    serverInstance = result.server;
    console.log(`后端服务已启动，端口: ${port}`);
    setServerStatus('running');
    return { success: true };
  } catch (error) {
    console.error('后端服务启动失败:', error.message || error);
    setServerStatus('error', error.message || String(error));
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * 停止后端服务
 */
async function stopBackend() {
  if (!serverInstance) {
    setServerStatus('stopped');
    return { success: true };
  }

  return new Promise((resolve) => {
    console.log('正在停止后端服务...');
    serverInstance.close(() => {
      console.log('后端服务已停止');
      serverInstance = null;
      setServerStatus('stopped');
      resolve({ success: true });
    });

    // 超时处理
    setTimeout(() => {
      if (serverInstance) {
        console.warn('服务停止超时，强制终止');
        serverInstance = null;
        setServerStatus('stopped');
        resolve({ success: true });
      }
    }, 5000);
  });
}

// IPC 通信：获取配置
ipcMain.handle('config:get', async (event, key) => {
  if (key) {
    return config.get(key);
  }
  return config.getAll();
});

// IPC 通信：设置配置
ipcMain.handle('config:set', async (event, key, value) => {
  config.set(key, value);
  return true;
});

// IPC 通信：批量更新配置
ipcMain.handle('config:update', async (event, newConfig) => {
  config.update(newConfig);
  return config.getAll();
});

// IPC 通信：获取应用路径
ipcMain.handle('app:getPath', async (event, name) => {
  return app.getPath(name || 'userData');
});

// IPC 通信：启动服务器
ipcMain.handle('server:start', async () => {
  return startBackend();
});

// IPC 通信：停止服务器
ipcMain.handle('server:stop', async () => {
  return stopBackend();
});

// IPC 通信：获取服务器状态
ipcMain.handle('server:status', async () => {
  return {
    status: serverStatus,
    port: config.get('port'),
    error: serverError,
  };
});

// IPC 通信：获取服务器日志
ipcMain.handle('server:logs', async () => {
  return serverLogs;
});

// IPC 通信：重启服务器（配置变更后）
ipcMain.handle('server:restart', async () => {
  await stopBackend();
  return startBackend();
});

// IPC 通信：清空日志
ipcMain.handle('server:clear-logs', async () => {
  serverLogs = [];
  return true;
});

// IPC 通信：在文件管理器中打开路径
ipcMain.handle('shell:open-path', async (event, targetPath) => {
  const resolvedPath = targetPath || config.get('logDir');
  const result = await shell.openPath(resolvedPath);
  return { success: result === '', error: result || null };
});

// IPC 通信：根据端口杀进程
ipcMain.handle('server:kill-process', async (event, port) => {
  const result = await killProcessByPort(port);
  console.log(result.message);

  if (result.success) {
    // 杀掉进程后等待端口释放，然后自动启动服务
    console.log('等待端口释放...');
    const released = await waitForPortRelease(port, 8000, 500);
    if (released) {
      console.log('端口已释放，正在自动启动服务...');
      await startBackend();
    } else {
      console.warn('端口释放超时，请手动启动服务');
    }
  }

  return result;
});

// 应用生命周期
app.whenReady().then(async () => {
  // 设置 macOS Dock 图标 - 使用标准 128x128 尺寸
  if (process.platform === 'darwin') {
    const iconPath = path.join(__dirname, '../icons/icon_128x128.png');
    app.dock.setIcon(iconPath);
  }

  // 先创建窗口，再尝试启动服务
  // 这样即使服务启动失败，用户也能看到界面和错误信息
  createWindow();

  // 启动后端服务
  const result = await startBackend();
  if (!result.success) {
    console.error('服务自动启动失败，请手动尝试启动');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (serverInstance) {
    serverInstance.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverInstance) {
    serverInstance.close();
  }
});
