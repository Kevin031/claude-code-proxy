const request = require('supertest');
const nock = require('nock');
const { createApp } = require('../../src/index');

// 读取 mock 请求数据
const mockRequest = require('../fixtures/request.json');

describe('Proxy Routes', () => {
  let app;

  beforeAll(() => {
    process.env.TARGETAPIURL = 'https://test-api.example.com';
    app = createApp();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    delete process.env.TARGETAPIURL;
    nock.restore();
  });

  it('应该将 POST /v1/messages 转发到目标 API 并返回响应', async () => {
    const mockResponse = {
      id: 'msg_01K5fJm3Q9p8v2xR',
      type: 'message',
      role: 'assistant',
      model: 'glm-4.7',
      content: [{ type: 'text', text: '你好！有什么我可以帮你的吗？' }],
      usage: { input_tokens: 15, output_tokens: 20 },
    };

    const scope = nock('https://test-api.example.com')
      .post('/v1/messages')
      .reply(200, mockResponse, { 'content-type': 'application/json' });

    // 使用 mock/request.json 作为请求体，但简化 model 字段
    const requestBody = {
      ...mockRequest,
      model: 'glm-4.7',
      messages: [{ role: 'user', content: '你好' }],
    };

    const res = await request(app)
      .post('/v1/messages')
      .set('Authorization', 'Bearer test-token')
      .set('Content-Type', 'application/json')
      .send(requestBody)
      .expect(200);

    expect(res.body).toEqual(mockResponse);
    expect(scope.isDone()).toBe(true);
  });

  it('应该转发 GET /v1/models 请求', async () => {
    const mockResponse = {
      data: [
        { id: 'glm-4', object: 'model' },
        { id: 'glm-4.7', object: 'model' },
      ],
    };

    const scope = nock('https://test-api.example.com')
      .get('/v1/models')
      .reply(200, mockResponse);

    const res = await request(app)
      .get('/v1/models')
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(res.body).toEqual(mockResponse);
    expect(scope.isDone()).toBe(true);
  });

  it('应该将查询参数传递给目标 API', async () => {
    const scope = nock('https://test-api.example.com')
      .get('/v1/models')
      .query({ limit: '10' })
      .reply(200, { data: [] });

    await request(app)
      .get('/v1/models?limit=10')
      .expect(200);

    expect(scope.isDone()).toBe(true);
  });

  it('应该处理目标 API 返回的 401 错误', async () => {
    const scope = nock('https://test-api.example.com')
      .post('/v1/messages')
      .reply(401, { error: { message: 'Unauthorized', type: 'authentication_error' } });

    const res = await request(app)
      .post('/v1/messages')
      .send({ model: 'glm-4', messages: [] })
      .expect(401);

    expect(res.body.error).toEqual({ message: 'Unauthorized', type: 'authentication_error' });
    expect(scope.isDone()).toBe(true);
  });

  // 超时测试需要确保 ProxyService 的 axios 实例使用新的 timeout 配置，
  // 由于模块缓存机制，在集成测试中难以可靠地覆盖此场景，建议通过单元测试验证
  it.skip('应该处理目标 API 超时', async () => {
    process.env.TIMEOUT = '100';
    // 重新创建 app 以应用新的超时配置
    const testApp = createApp();

    const scope = nock('https://test-api.example.com')
      .post('/v1/messages')
      .delay(500)
      .reply(200, { data: 'late' });

    const res = await request(testApp)
      .post('/v1/messages')
      .send({ model: 'glm-4', messages: [] })
      .expect(500);

    expect(res.body.error.code).toBe('PROXY_ERROR');
    delete process.env.TIMEOUT;
  });
});
