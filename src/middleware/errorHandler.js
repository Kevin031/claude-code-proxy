/**
 * 错误处理中间件
 * 捕获和处理应用中的错误
 */
const errorHandlerMiddleware = (err, req, res, next) => {
  console.error('错误发生:', err);

  // 构建错误响应
  const errorResponse = {
    error: {
      message: err.message || '服务器内部错误',
      code: err.code || 'INTERNAL_ERROR',
      requestId: req.requestId || null,
    },
  };

  // 在开发环境下包含堆栈信息
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
  }

  // 根据错误类型确定状态码
  let statusCode = 500;
  if (err.statusCode) {
    statusCode = err.statusCode;
  } else if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
  } else if (err.code === 'ETIMEDOUT') {
    statusCode = 504;
  }

  // 发送错误响应
  res.status(statusCode).json(errorResponse);
};

/**
 * 404 处理中间件
 * 处理未找到的路由
 */
const notFoundMiddleware = (req, res) => {
  res.status(404).json({
    error: {
      message: `路由未找到: ${req.method} ${req.path}`,
      code: 'NOT_FOUND',
      requestId: req.requestId || null,
    },
  });
};

module.exports = {
  errorHandlerMiddleware,
  notFoundMiddleware,
};
