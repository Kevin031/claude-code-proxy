const path = require('path');
const fs = require('fs');

// 检测是否在 Electron 主进程中
const isElectron = process.versions && process.versions.electron && process.type === 'browser';

// 硬编码默认值
const defaultConfig = {
  port: 3088,
  nodeEnv: 'development',
  targetApiUrl: 'https://open.bigmodel.cn/api/anthropic',
  logDir: './logs',
  timeout: 30000,
};

let store = null;
let userConfig = {};

// Electron 环境下使用 electron-store 持久化配置
if (isElectron) {
  try {
    const StoreModule = require('electron-store');
    const Store = StoreModule.default || StoreModule;
    store = new Store({
      name: 'app-config',
      schema: {
        port: {
          type: 'number',
          minimum: 1024,
          maximum: 65535,
          default: defaultConfig.port,
        },
        targetApiUrl: {
          type: 'string',
          format: 'uri',
          default: defaultConfig.targetApiUrl,
        },
        timeout: {
          type: 'number',
          minimum: 1000,
          maximum: 300000,
          default: defaultConfig.timeout,
        },
        logDir: {
          type: 'string',
          default: defaultConfig.logDir,
        },
      },
    });
  } catch (error) {
    console.warn('electron-store 加载失败，使用内存配置:', error.message);
  }
}

/**
 * 获取配置值（三层优先级：环境变量 > 用户配置 > 默认值）
 * @param {string} key - 配置键名
 * @returns {*} 配置值
 */
function get(key) {
  // 第一层：环境变量（优先级最高）
  const envKey = key.toUpperCase();
  if (process.env[envKey] !== undefined) {
    if (key === 'port' || key === 'timeout') {
      return parseInt(process.env[envKey], 10);
    }
    return process.env[envKey];
  }

  // 第二层：用户配置（electron-store 或内存）
  if (store && store.has(key)) {
    return store.get(key);
  }
  if (userConfig[key] !== undefined) {
    return userConfig[key];
  }

  // 第三层：默认值
  return defaultConfig[key];
}

/**
 * 设置配置值
 * @param {string} key - 配置键名
 * @param {*} value - 配置值
 */
function set(key, value) {
  if (store) {
    store.set(key, value);
  } else {
    userConfig[key] = value;
  }
}

/**
 * 获取所有配置
 * @returns {Object} 完整配置对象
 */
function getAll() {
  return {
    port: get('port'),
    nodeEnv: get('nodeEnv'),
    targetApiUrl: get('targetApiUrl'),
    logDir: get('logDir'),
    timeout: get('timeout'),
  };
}

/**
 * 设置 Electron userData 路径（用于日志目录）
 * @param {string} userDataPath - Electron app.getPath('userData')
 */
function setUserDataPath(userDataPath) {
  const logsPath = path.join(userDataPath, 'logs');
  if (store) {
    // Electron 环境下始终使用 userData 作为日志目录
    store.set('logDir', logsPath);
  } else {
    userConfig.logDir = logsPath;
  }

  // macOS 下在项目根目录创建软链接，方便在 VS Code 中查看日志
  if (process.platform === 'darwin') {
    try {
      const projectRoot = path.join(__dirname, '../..');
      const symlinkPath = path.join(projectRoot, 'logs');
      // 如果已存在且不是软链接，先删除
      if (fs.existsSync(symlinkPath) && !fs.lstatSync(symlinkPath).isSymbolicLink()) {
        fs.rmSync(symlinkPath, { recursive: true, force: true });
      }
      // 确保目标日志目录存在
      if (!fs.existsSync(logsPath)) {
        fs.mkdirSync(logsPath, { recursive: true });
      }
      // 创建软链接
      if (!fs.existsSync(symlinkPath)) {
        fs.symlinkSync(logsPath, symlinkPath, 'dir');
        console.log('[Config] 日志软链接已创建:', symlinkPath, '->', logsPath);
      }
    } catch (error) {
      console.warn('[Config] 创建日志软链接失败:', error.message);
    }
  }
}

/**
 * 批量更新配置
 * @param {Object} config - 配置对象
 */
function update(config) {
  Object.keys(config).forEach((key) => {
    if (defaultConfig[key] !== undefined) {
      set(key, config[key]);
    }
  });
}

module.exports = {
  get,
  set,
  getAll,
  update,
  setUserDataPath,
  defaultConfig,
};
