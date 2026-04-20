const nock = require('nock');
const ProxyService = require('../../src/proxy/proxy');

describe('ProxyService', () => {
  let proxyService;

  beforeEach(() => {
    // 设置配置环境变量，确保 ProxyService 使用正确的目标 URL
    process.env.TARGETAPIURL = 'https://test-api.example.com';
    process.env.TIMEOUT = '5000';
    proxyService = new ProxyService();
    nock.cleanAll();
  });

  afterEach(() => {
    delete process.env.TARGETAPIURL;
    delete process.env.TIMEOUT;
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  describe('filterHeaders', () => {
    it('应该移除 host、connection、content-length、accept-encoding', () => {
      const headers = {
        host: 'localhost:3088',
        connection: 'keep-alive',
        'content-length': '1234',
        'accept-encoding': 'gzip, deflate',
        authorization: 'Bearer token123',
        'content-type': 'application/json',
      };

      const filtered = proxyService.filterHeaders(headers);

      expect(filtered).not.toHaveProperty('host');
      expect(filtered).not.toHaveProperty('connection');
      expect(filtered).not.toHaveProperty('content-length');
      expect(filtered).not.toHaveProperty('accept-encoding');
      expect(filtered).toHaveProperty('authorization', 'Bearer token123');
      expect(filtered).toHaveProperty('content-type', 'application/json');
    });

    it('空请求头应返回空对象', () => {
      const filtered = proxyService.filterHeaders({});
      expect(filtered).toEqual({});
    });
  });

  describe('forwardRequest', () => {
    it('应该成功转发 GET 请求', async () => {
      const scope = nock('https://test-api.example.com')
        .get('/v1/models')
        .reply(200, { data: ['model1', 'model2'] }, { 'content-type': 'application/json' });

      const req = {
        method: 'GET',
        path: '/v1/models',
        headers: { authorization: 'Bearer token' },
        query: {},
        body: {},
        requestId: 'test-req-1',
      };

      const result = await proxyService.forwardRequest(req);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.body).toEqual({ data: ['model1', 'model2'] });
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(scope.isDone()).toBe(true);
    });

    it('应该成功转发 POST 请求并携带 body', async () => {
      const requestBody = { model: 'glm-4', messages: [{ role: 'user', content: 'hello' }] };

      const scope = nock('https://test-api.example.com')
        .post('/v1/messages', requestBody)
        .reply(200, { id: 'msg-123', content: 'hi' });

      const req = {
        method: 'POST',
        path: '/v1/messages',
        headers: { 'content-type': 'application/json' },
        query: {},
        body: requestBody,
        requestId: 'test-req-2',
      };

      const result = await proxyService.forwardRequest(req);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.body).toEqual({ id: 'msg-123', content: 'hi' });
      expect(scope.isDone()).toBe(true);
    });

    it('应该转发目标服务器返回的 4xx 响应', async () => {
      const scope = nock('https://test-api.example.com')
        .post('/v1/messages')
        .reply(400, { error: { message: 'Bad Request', type: 'invalid_request_error' } });

      const req = {
        method: 'POST',
        path: '/v1/messages',
        headers: {},
        query: {},
        body: {},
        requestId: 'test-req-3',
      };

      const result = await proxyService.forwardRequest(req);

      // 由于 validateStatus: () => true，axios 对所有状态码都视为成功
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(400);
      expect(result.body).toEqual({ error: { message: 'Bad Request', type: 'invalid_request_error' } });
      expect(scope.isDone()).toBe(true);
    });

    it('应该转发目标服务器返回的 5xx 响应', async () => {
      const scope = nock('https://test-api.example.com')
        .get('/v1/models')
        .reply(503, { error: 'Service Unavailable' });

      const req = {
        method: 'GET',
        path: '/v1/models',
        headers: {},
        query: {},
        body: {},
        requestId: 'test-req-4',
      };

      const result = await proxyService.forwardRequest(req);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(503);
      expect(scope.isDone()).toBe(true);
    });

    it('应该处理目标服务器不可达的情况', async () => {
      // 直接 stub axios 实例的 request 方法，避免 nock 14 的兼容性问题
      const axiosError = new Error('Connection refused');
      axiosError.code = 'ECONNREFUSED';
      axiosError.request = {};
      const spy = jest.spyOn(proxyService.client, 'request').mockRejectedValue(axiosError);

      const req = {
        method: 'GET',
        path: '/v1/models',
        headers: {},
        query: {},
        body: {},
        requestId: 'test-req-5',
      };

      const result = await proxyService.forwardRequest(req);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.error.code).toBe('ECONNREFUSED');

      spy.mockRestore();
    });

    it('应该将查询参数传递到目标服务器', async () => {
      const scope = nock('https://test-api.example.com')
        .get('/v1/models')
        .query({ limit: '10', after: 'cursor123' })
        .reply(200, { data: [] });

      const req = {
        method: 'GET',
        path: '/v1/models',
        headers: {},
        query: { limit: '10', after: 'cursor123' },
        body: {},
        requestId: 'test-req-6',
      };

      await proxyService.forwardRequest(req);

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('buildErrorResponse', () => {
    it('应该构建标准化的错误响应对象', () => {
      const error = new Error('Something went wrong');
      error.code = 'UNKNOWN_ERROR';

      const result = proxyService.buildErrorResponse(error);

      expect(result).toMatchObject({
        success: false,
        statusCode: 500,
        statusMessage: 'Internal Server Error',
        body: {
          error: {
            message: 'Something went wrong',
            code: 'INTERNAL_ERROR',
          },
        },
        error: {
          message: 'Something went wrong',
          code: 'UNKNOWN_ERROR',
        },
      });
    });
  });
});
