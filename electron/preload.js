const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给前端
contextBridge.exposeInMainWorld('electronAPI', {
  // 配置管理
  config: {
    get: (key) => ipcRenderer.invoke('config:get', key),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
    update: (config) => ipcRenderer.invoke('config:update', config),
  },

  // 应用路径
  getPath: (name) => ipcRenderer.invoke('app:getPath', name),

  // 服务器控制
  server: {
    start: () => ipcRenderer.invoke('server:start'),
    stop: () => ipcRenderer.invoke('server:stop'),
    status: () => ipcRenderer.invoke('server:status'),
    logs: () => ipcRenderer.invoke('server:logs'),
    restart: () => ipcRenderer.invoke('server:restart'),
    clearLogs: () => ipcRenderer.invoke('server:clear-logs'),
    killProcess: (port) => ipcRenderer.invoke('server:kill-process', port),
  },

  // 监听服务器日志推送
  onServerLog: (callback) => {
    const handler = (event, logEntry) => callback(logEntry);
    ipcRenderer.on('server:log', handler);
    // 返回取消订阅函数
    return () => ipcRenderer.removeListener('server:log', handler);
  },

  // 监听服务器状态变化
  onServerStatusChange: (callback) => {
    const handler = (event, statusInfo) => callback(statusInfo);
    ipcRenderer.on('server:status-change', handler);
    // 返回取消订阅函数
    return () => ipcRenderer.removeListener('server:status-change', handler);
  },

  // 打开文件管理器
  openPath: (targetPath) => ipcRenderer.invoke('shell:open-path', targetPath),

  // 平台信息
  platform: process.platform,
});
