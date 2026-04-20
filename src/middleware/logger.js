const { v4: uuidv4 } = require('uuid');
const Logger = require('../utils/logger');
const config = require('../config');
const eventBus = require('../utils/events');

// 创建日志工具实例
const logger = new Logger(config.get('logDir'));

/**
 * 日志中间件
 * 拦截请求和响应，记录完整的请求-响应对到 YAML 文件
 */
const loggerMiddleware = async (req, res, next) => {
  // 跳过内部查询路由和健康检查，只记录代理请求
  if (req.path.startsWith('/logs') || req.path === '/health') {
    req.requestId = uuidv4();
    return next();
  }

  // 生成唯一的请求 ID
  const requestId = uuidv4();
  const requestTimestamp = new Date().toISOString();

  // 将 requestId 挂载到 req 对象上，供后续中间件使用
  req.requestId = requestId;

  // 打印请求接收信息
  const now = new Date();
  const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });
  console.log('');
  console.log('🔔 [新请求]');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  时间      : ${requestTimestamp}`);
  console.log(`  时钟      : ${timeStr}`);
  console.log(`  方法      : ${req.method}`);
  console.log(`  路径      : ${req.path}`);
  console.log(`  请求 ID   : ${requestId}`);
  console.log(`  客户端 IP : ${req.ip || req.connection.remoteAddress}`);
  console.log(`  User-Agent: ${req.headers['user-agent'] || 'N/A'}`);
  console.log('─────────────────────────────────────────────────────────────');

  // 提取请求数据
  const requestData = {
    method: req.method,
    path: req.path,
    headers: req.headers,
    query: req.query,
    body: req.body,
  };

  // 保存原始的 res.json 和 res.send 方法
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  // 拦截响应数据
  let responseData = null;
  let responseStatusCode = null;
  let responseHeaders = null;

  // 重写 res.json
  res.json = function(data) {
    responseData = data;
    return originalJson(data);
  };

  // 重写 res.send
  res.send = function(data) {
    if (!responseData) {
      responseData = data;
    }
    return originalSend(data);
  };

  // 监听响应完成事件
  res.on('finish', async () => {
    const responseTimestamp = new Date().toISOString();
    responseStatusCode = res.statusCode;
    responseHeaders = res.getHeaders();

    // 计算响应时间（近似值）
    const requestTime = new Date(requestTimestamp).getTime();
    const responseTime = new Date(responseTimestamp).getTime();
    const responseDuration = responseTime - requestTime;

    // 构建日志数据
    const logData = {
      requestId,
      timestamp: requestTimestamp,
      request: requestData,
      response: {
        timestamp: responseTimestamp,
        statusCode: responseStatusCode,
        headers: responseHeaders,
        body: responseData,
        responseTime: responseDuration,
      },
      error: null,
    };

    // 异步写入日志，不阻塞响应
    setImmediate(async () => {
      try {
        await logger.writeLog(logData);
        // 触发日志写入完成事件，通知 SSE 客户端
        eventBus.emit('log:written', logData);
      } catch (error) {
        console.error('写入日志失败:', error);
      }
    });
  });

  next();
};

module.exports = loggerMiddleware;
