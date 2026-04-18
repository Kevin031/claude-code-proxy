require('dotenv').config();

const config = {
  // 服务器配置
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // 目标 API 配置
  targetApiUrl: process.env.TARGET_API_URL || 'https://open.bigmodel.cn/api/anthropic',

  // 日志配置
  logDir: process.env.LOG_DIR || './logs',

  // 超时配置（毫秒）
  timeout: parseInt(process.env.TIMEOUT, 10) || 30000,
};

module.exports = config;
