const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const ProxyService = require('./proxy/proxy');
const loggerMiddleware = require('./middleware/logger');
const { errorHandlerMiddleware, notFoundMiddleware } = require('./middleware/errorHandler');

// 创建 Express 应用
const app = express();

// 创建代理服务实例
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
      res.json(proxyResponse.body);
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

// 启动服务器
const server = app.listen(config.port, () => {
  // 打印启动横幅
  console.log('');
  console.log('=============================================================');
  console.log('              API 代理服务器');
  console.log('=============================================================');
  console.log('');
  console.log('[环境信息]');
  console.log('-------------------------------------------------------------');
  console.log(`  环境      : ${config.nodeEnv}`);
  console.log(`  端口      : ${config.port}`);
  console.log(`  进程 ID   : ${process.pid}`);
  console.log(`  Node 版本 : ${process.version}`);
  console.log(`  平台      : ${process.platform}`);
  console.log(`  架构      : ${process.arch}`);
  console.log('');
  console.log('[代理配置]');
  console.log('-------------------------------------------------------------');
  console.log(`  目标 API  : ${config.targetApiUrl}`);
  console.log(`  超时时间  : ${config.timeout}ms`);
  console.log('');
  console.log('[日志配置]');
  console.log('-------------------------------------------------------------');
  console.log(`  日志目录  : ${config.logDir}`);
  console.log(`  文件格式  : YYYYMMDD-HHMMSS-shortId.yaml`);
  console.log('');
  console.log('[服务端点]');
  console.log('-------------------------------------------------------------');
  console.log(`  健康检查  : http://localhost:${config.port}/health`);
  console.log(`  代理服务  : http://localhost:${config.port}/*`);
  console.log('');
  console.log('[状态] 服务器已就绪，等待请求...');
  console.log('');
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n收到 SIGINT 信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

module.exports = app;
