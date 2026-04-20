const axios = require('axios');
const config = require('../config');

/**
 * 代理转发服务
 * 负责将请求转发至目标 API
 */
class ProxyService {
  constructor() {
    // 创建 axios 实例
    this.client = axios.create({
      baseURL: config.get('targetApiUrl'),
      timeout: config.get('timeout'),
      // 不自动跟随重定向
      maxRedirects: 0,
      // 验证 SSL
      validateStatus: () => true, // 接受所有状态码
    });
  }

  /**
   * 转发请求到目标 API
   * @param {Object} req - Express 请求对象
   * @returns {Promise<Object>} 包含响应数据、状态码、头部等信息的对象
   */
  async forwardRequest(req) {
    const startTime = Date.now();

    try {
      // 构建目标路径：拼接目标 API 基础 URL 和原始请求路径
      // 确保基础 URL 末尾和路径开头不会重复 /
      const baseUrl = config.get('targetApiUrl').replace(/\/$/, '');
      const requestPath = req.path.startsWith('/') ? req.path : `/${req.path}`;
      const targetUrl = `${baseUrl}${requestPath}`;

      // 打印请求信息
      console.log('');
      console.log('[请求转发]');
      console.log('-------------------------------------------------------------');
      console.log(`  方法      : ${req.method}`);
      console.log(`  请求路径  : ${req.path}`);
      console.log(`  目标 URL  : ${targetUrl}`);
      console.log(`  请求 ID   : ${req.requestId || 'N/A'}`);
      if (Object.keys(req.query).length > 0) {
        console.log(`  查询参数  : ${JSON.stringify(req.query)}`);
      }
      console.log('-------------------------------------------------------------');

      // 构建请求配置
      const requestConfig = {
        method: req.method,
        url: requestPath,
        headers: this.filterHeaders(req.headers),
        params: req.query,
        // 对有 body 的请求方法设置 data（包括 POST、PUT、PATCH、DELETE 等）
        data: req.body,
        // 支持流式响应透传
        responseType: req.body?.stream ? 'stream' : 'json',
      };

      // 发送请求
      const response = await this.client.request(requestConfig);

      const responseTime = Date.now() - startTime;

      // 打印响应信息
      console.log('');
      console.log('[响应接收]');
      console.log('-------------------------------------------------------------');
      console.log(`  状态码    : ${response.status}`);
      console.log(`  状态信息  : ${response.statusText}`);
      console.log(`  响应时间  : ${responseTime}ms`);
      console.log(`  请求 ID   : ${req.requestId || 'N/A'}`);
      console.log('-------------------------------------------------------------');

      // 流式响应直接透传，不做深拷贝（流对象含循环引用，序列化会崩溃）
      if (req.body?.stream) {
        return {
          success: true,
          isStream: true,
          statusCode: response.status,
          statusMessage: response.statusText,
          headers: response.headers,
          stream: response.data,
          responseTime,
        };
      }

      // 安全提取响应体数据
      let responseBody = response.data;
      // 如果响应体是对象，进行深拷贝以避免潜在的循环引用
      if (responseBody && typeof responseBody === 'object' && !Buffer.isBuffer(responseBody)) {
        try {
          responseBody = JSON.parse(JSON.stringify(responseBody));
        } catch (error) {
          console.warn('响应体数据深拷贝失败，使用原始数据:', error.message);
        }
      }

      // 返回标准化响应对象
      return {
        success: true,
        statusCode: response.status,
        statusMessage: response.statusText,
        headers: response.headers,
        body: responseBody,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      // 处理错误
      if (error.response) {
        // 服务器响应了错误状态码
        console.log('');
        console.log('[响应错误]');
        console.log('-------------------------------------------------------------');
        console.log(`  状态码    : ${error.response.status}`);
        console.log(`  状态信息  : ${error.response.statusText}`);
        console.log(`  错误信息  : ${error.message}`);
        console.log(`  响应时间  : ${responseTime}ms`);
        console.log(`  请求 ID   : ${req.requestId || 'N/A'}`);
        console.log('-------------------------------------------------------------');

        // 安全提取错误响应体数据
        let errorResponseBody = error.response.data;
        if (errorResponseBody && typeof errorResponseBody === 'object' && !Buffer.isBuffer(errorResponseBody)) {
          try {
            errorResponseBody = JSON.parse(JSON.stringify(errorResponseBody));
          } catch (stringifyError) {
            console.warn('错误响应体数据深拷贝失败:', stringifyError.message);
            errorResponseBody = null;
          }
        }

        return {
          success: false,
          statusCode: error.response.status,
          statusMessage: error.response.statusText,
          headers: error.response.headers,
          body: errorResponseBody,
          responseTime,
          error: {
            message: error.message,
            code: error.code,
          },
        };
      } else if (error.request) {
        // 请求已发送但没有收到响应
        console.log('');
        console.log('[网络错误]');
        console.log('-------------------------------------------------------------');
        console.log(`  错误类型  : 无法连接到目标服务器`);
        console.log(`  错误信息  : ${error.message}`);
        console.log(`  响应时间  : ${responseTime}ms`);
        console.log(`  请求 ID   : ${req.requestId || 'N/A'}`);
        console.log('-------------------------------------------------------------');

        return {
          success: false,
          statusCode: 503,
          statusMessage: 'Service Unavailable',
          headers: {},
          body: null,
          responseTime,
          error: {
            message: '无法连接到目标服务器',
            code: 'ECONNREFUSED',
            details: error.message,
          },
        };
      } else {
        // 其他错误（如请求配置错误）
        console.log('');
        console.log('[内部错误]');
        console.log('-------------------------------------------------------------');
        console.log(`  错误信息  : ${error.message}`);
        console.log(`  错误代码  : ${error.code || 'UNKNOWN'}`);
        console.log(`  请求 ID   : ${req.requestId || 'N/A'}`);
        console.log('-------------------------------------------------------------');

        return {
          success: false,
          statusCode: 500,
          statusMessage: 'Internal Server Error',
          headers: {},
          body: null,
          responseTime,
          error: {
            message: error.message,
            code: error.code,
          },
        };
      }
    }
  }

  /**
   * 过滤请求头，移除不需要转发的头部
   * @param {Object} headers - 原始请求头
   * @returns {Object} 过滤后的请求头
   */
  filterHeaders(headers) {
    // 需要移除的头部
    const headersToRemove = [
      'host',
      'connection',
      'content-length',
      'accept-encoding',
    ];

    const filteredHeaders = { ...headers };

    headersToRemove.forEach(key => {
      delete filteredHeaders[key];
    });

    return filteredHeaders;
  }

  /**
   * 构建错误响应
   * @param {Error} error - 错误对象
   * @returns {Object} 标准化错误响应
   */
  buildErrorResponse(error) {
    return {
      success: false,
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      headers: {},
      body: {
        error: {
          message: error.message,
          code: 'INTERNAL_ERROR',
        },
      },
      responseTime: 0,
      error: {
        message: error.message,
        code: error.code,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
    };
  }
}

module.exports = ProxyService;
