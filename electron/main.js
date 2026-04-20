const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const util = require('util');
const isDev = require('electron-is-dev');

const execPromise = util.promisify(exec);

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

// 必须先加载配置并设置日志路径，再加载其他依赖模块
const config = require('../src/config');
const userDataPath = app.getPath('userData');
config.setUserDataPath(userDataPath);

const { startServer } = require('../src/index');

// 保持全局引用，防止垃圾回收
let mainWindow = null;
let serverInstance = null;

// 服务器状态管理
let serverStatus = 'stopped'; // 'stopped' | 'starting' | 'running' | 'error'
let serverError = null;
let serverLogs = [];
const MAX_LOGS = 500;

/**
 * 检查端口是否被占用
 * @param {number} port - 端口号
 * @returns {Promise<boolean>}
 */
function checkPortInUse(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/health`, { timeout: 1000 }, () => {
      req.destroy();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * 等待端口释放（用于旧实例关闭后端口回收的等待）
 * @param {number} port - 端口号
 * @param {number} maxWaitMs - 最大等待时间（毫秒）
 * @param {number} intervalMs - 检查间隔（毫秒）
 * @returns {Promise<boolean>} 是否成功释放
 */
async function waitForPortRelease(port, maxWaitMs = 5000, intervalMs = 500) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const inUse = await checkPortInUse(port);
    if (!inUse) return true;
    console.log(`端口 ${port} 仍被占用，等待释放...`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

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
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'default',
    show: false,
  });

  // 加载前端页面
  if (isDev) {
    // 开发模式：加载 Vite 开发服务器
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // 生产模式：加载打包后的静态文件
    mainWindow.loadFile(path.join(__dirname, '../web/claude-proxy-web/dist/index.html'));
  }

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
  const userDataPath = app.getPath('userData');
  config.setUserDataPath(userDataPath);

  const port = config.get('port');

  // 检查端口是否被占用（可能是上次关闭未干净的旧实例）
  const inUse = await checkPortInUse(port);
  if (inUse) {
    console.log(`端口 ${port} 被占用，等待旧实例释放...`);
    const released = await waitForPortRelease(port);
    if (!released) {
      const error = `端口 ${port} 被其他程序占用，请关闭占用该端口的程序后重试。\n可尝试运行: lsof -ti:${port} | xargs kill -9`;
      console.error(error);
      setServerStatus('error', error);
      return { success: false, error };
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

/**
 * 根据端口杀掉占用进程
 * @param {number} port - 端口号
 * @returns {Promise<{ success: boolean; message: string }>}
 */
async function killProcessByPort(port) {
  try {
    if (process.platform === 'win32') {
      // Windows: 先查找 PID，再 taskkill
      const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');
      const pids = [...new Set(
        lines
          .map((line) => {
            const parts = line.trim().split(/\s+/);
            return parts[parts.length - 1];
          })
          .filter((pid) => pid && /^\d+$/.test(pid))
      )];
      if (pids.length === 0) {
        return { success: false, message: `未找到占用端口 ${port} 的进程` };
      }
      for (const pid of pids) {
        await execPromise(`taskkill /F /PID ${pid}`);
      }
      return { success: true, message: `已终止进程 (PID: ${pids.join(', ')})` };
    } else {
      // macOS / Linux
      const { stdout } = await execPromise(`lsof -ti:${port}`);
      const pids = stdout.trim().split('\n').filter(Boolean);
      if (pids.length === 0) {
        return { success: false, message: `未找到占用端口 ${port} 的进程` };
      }
      for (const pid of pids) {
        await execPromise(`kill -9 ${pid}`);
      }
      return { success: true, message: `已终止进程 (PID: ${pids.join(', ')})` };
    }
  } catch (error) {
    return { success: false, message: error.message || String(error) };
  }
}

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
