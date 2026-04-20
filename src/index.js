const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const ProxyService = require('./proxy/proxy');
const loggerMiddleware = require('./middleware/logger');
const { errorHandlerMiddleware, notFoundMiddleware } = require('./middleware/errorHandler');
const logsRouter = require('./routes/logs');
const eventBus = require('./utils/events');

/**
 * 安全序列化函数，处理循环引用问题
 * @param {*} data - 要序列化的数据
 * @returns {string} JSON 字符串
 */
function safeStringify(data) {
  const seen = new WeakSet();
  return JSON.stringify(data, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
}

/**
 * 创建 Express 应用实例
 * @returns {express.Application} Express 应用
 */
function createApp() {
  const app = express();
  const proxyService = new ProxyService();

  // 安全中间件
  app.use(helmet());

  // CORS 配置
  app.use(cors());

  // 解析 JSON 请求体
  app.use(express.json({ limit: '10mb' }));

  // 解析 URL 编码的请求体
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 日志中间件（必须在所有其他中间件之后，路由之前）
  app.use(loggerMiddleware);

  // 健康检查端点
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // 日志查询路由
  app.use('/logs', logsRouter);

  // SSE 日志推送端点
  app.get('/logs/events', (req, res) => {
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // 发送初始连接成功消息
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    // 监听日志写入事件
    const onLogWritten = (logData) => {
      const event = {
        type: 'log_updated',
        requestId: logData.requestId,
        timestamp: logData.timestamp,
      };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    eventBus.on('log:written', onLogWritten);

    // 清理：客户端断开连接时移除监听器
    req.on('close', () => {
      eventBus.off('log:written', onLogWritten);
    });

    // 定期发送心跳保持连接
    const heartbeat = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
    });
  });

  // 代理路由 - 捕获所有请求
  app.all('*', async (req, res) => {
    try {
      // 转发请求到目标 API
      const proxyResponse = await proxyService.forwardRequest(req);

      // 设置响应头
      if (proxyResponse.headers) {
        Object.keys(proxyResponse.headers).forEach(key => {
          // 跳过某些不应该转发的响应头
          if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
            try {
              res.setHeader(key, proxyResponse.headers[key]);
            } catch (error) {
              // 忽略设置头部失败的情况
            }
          }
        });
      }

      // 设置状态码
      res.status(proxyResponse.statusCode);

      // 发送响应体
      if (proxyResponse.body !== null && proxyResponse.body !== undefined) {
        try {
          // 尝试序列化以检测循环引用
          safeStringify(proxyResponse.body);
          res.json(proxyResponse.body);
        } catch (error) {
          console.error('响应数据包含无法序列化的内容:', error.message);
          res.json({
            error: {
              message: '响应数据格式错误',
              code: 'INVALID_RESPONSE_DATA',
              requestId: req.requestId,
            },
          });
        }
      } else {
        res.end();
      }
    } catch (error) {
      console.error('代理请求失败:', error);
      res.status(500).json({
        error: {
          message: '代理请求失败',
          code: 'PROXY_ERROR',
          requestId: req.requestId,
        },
      });
    }
  });

  // 404 处理（必须在所有路由之后）
  app.use(notFoundMiddleware);

  // 全局错误处理（必须在最后）
  app.use(errorHandlerMiddleware);

  return app;
}

/**
 * 启动服务器
 * @param {Object} overrides - 可选的配置覆盖
 * @returns {Promise<{server: http.Server, app: express.Application}>} 服务器实例和应用
 */
function startServer(overrides = {}) {
  return new Promise((resolve, reject) => {
    // 应用配置覆盖
    if (overrides && Object.keys(overrides).length > 0) {
      config.update(overrides);
    }

    const currentConfig = config.getAll();
    const app = createApp();

    const server = app.listen(currentConfig.port, () => {
      // 打印启动横幅
      console.log('');
      console.log('=============================================================');
      console.log('              API 代理服务器');
      console.log('=============================================================');
      console.log('');
      console.log('[环境信息]');
      console.log('-------------------------------------------------------------');
      console.log(`  环境      : ${currentConfig.nodeEnv}`);
      console.log(`  端口      : ${currentConfig.port}`);
      console.log(`  进程 ID   : ${process.pid}`);
      console.log(`  Node 版本 : ${process.version}`);
      console.log(`  平台      : ${process.platform}`);
      console.log(`  架构      : ${process.arch}`);
      console.log('');
      console.log('[代理配置]');
      console.log('-------------------------------------------------------------');
      console.log(`  目标 API  : ${currentConfig.targetApiUrl}`);
      console.log(`  超时时间  : ${currentConfig.timeout}ms`);
      console.log('');
      console.log('[日志配置]');
      console.log('-------------------------------------------------------------');
      console.log(`  日志目录  : ${currentConfig.logDir}`);
      console.log(`  文件格式  : YYYYMMDD-HHMMSS-shortId.yaml`);
      console.log('');
      console.log('[服务端点]');
      console.log('-------------------------------------------------------------');
      console.log(`  健康检查  : http://localhost:${currentConfig.port}/health`);
      console.log(`  日志查询  : http://localhost:${currentConfig.port}/logs/sessions`);
      console.log(`  代理服务  : http://localhost:${currentConfig.port}/*`);
      console.log('');
      console.log('[状态] 服务器已就绪，等待请求...');
      console.log('');

      resolve({ server, app });
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`端口 ${currentConfig.port} 已被占用`);
      }
      reject(error);
    });

    // 优雅关闭
    const gracefulShutdown = (signal) => {
      console.log(`收到 ${signal} 信号，正在关闭服务器...`);
      server.close(() => {
        console.log('服务器已关闭');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  });
}

// 如果直接运行此文件（非被引入），则自动启动
if (require.main === module) {
  startServer().catch((error) => {
    console.error('启动服务器失败:', error);
    process.exit(1);
  });
}

module.exports = { createApp, startServer };
