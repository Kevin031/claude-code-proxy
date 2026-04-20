const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

describe('Logs Routes', () => {
  let app;
  let testDir;
  let createApp;

  beforeAll(() => {
    testDir = global.__TEST_TMP_DIR__;
    // 覆盖日志目录配置，必须在加载 src 模块前设置
    process.env.LOGDIR = testDir;

    // 清除 src 目录下所有模块的 require 缓存，确保重新加载时使用新的环境变量
    Object.keys(require.cache).forEach((key) => {
      if (key.includes('/src/') || key.includes('\\src\\')) {
        delete require.cache[key];
      }
    });

    createApp = require('../../src/index').createApp;
    app = createApp();
  });

  afterAll(() => {
    delete process.env.LOGDIR;
  });

  async function createLogFile(fileName, data) {
    const filePath = path.join(testDir, fileName);
    await fs.writeFile(filePath, yaml.dump(data), 'utf8');
    return filePath;
  }

  describe('GET /logs/sessions', () => {
    it('应该返回会话列表', async () => {
      await createLogFile('20240115-100000-abc.yaml', {
        requestId: 'req-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        request: {
          method: 'POST',
          path: '/v1/messages',
          headers: { 'x-claude-code-session-id': 'sess-1' },
          query: {},
          body: { model: 'glm-4' },
        },
        response: {
          timestamp: '2024-01-15T10:00:01.000Z',
          statusCode: 200,
          headers: {},
          body: { id: 'msg-1' },
          responseTime: 1000,
        },
        error: null,
      });

      await createLogFile('20240115-100005-def.yaml', {
        requestId: 'req-2',
        timestamp: '2024-01-15T10:00:05.000Z',
        request: {
          method: 'POST',
          path: '/v1/messages',
          headers: { 'x-claude-code-session-id': 'sess-1' },
          query: {},
          body: { model: 'glm-4' },
        },
        response: {
          timestamp: '2024-01-15T10:00:06.000Z',
          statusCode: 200,
          headers: {},
          body: { id: 'msg-2' },
          responseTime: 1000,
        },
        error: null,
      });

      const res = await request(app)
        .get('/logs/sessions')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('sessions');
      expect(res.body).toHaveProperty('count', 1);
      expect(res.body.sessions[0].sessionId).toBe('sess-1');
      expect(res.body.sessions[0].requestCount).toBe(2);
      expect(res.body.sessions[0].endpoints).toContain('/v1/messages');
    });

    it('空日志目录应该返回空数组', async () => {
      const res = await request(app)
        .get('/logs/sessions')
        .expect(200);

      expect(res.body.sessions).toEqual([]);
      expect(res.body.count).toBe(0);
    });
  });

  describe('GET /logs/sessions/:id', () => {
    it('应该返回指定会话详情', async () => {
      await createLogFile('20240115-100000-abc.yaml', {
        requestId: 'req-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        request: {
          method: 'POST',
          path: '/v1/messages',
          headers: { 'x-claude-code-session-id': 'sess-detail' },
          query: {},
          body: {},
        },
        response: {
          timestamp: '2024-01-15T10:00:01.000Z',
          statusCode: 200,
          headers: {},
          body: {},
          responseTime: 500,
        },
        error: null,
      });

      const res = await request(app)
        .get('/logs/sessions/sess-detail')
        .expect(200);

      expect(res.body.sessionId).toBe('sess-detail');
      expect(res.body.requests).toHaveLength(1);
      expect(res.body.requests[0]).toHaveProperty('requestId', 'req-1');
      expect(res.body.requests[0]).toHaveProperty('detailUrl');
    });

    it('不存在的会话应该返回 404', async () => {
      const res = await request(app)
        .get('/logs/sessions/nonexistent')
        .expect(404);

      expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('GET /logs/sessions/:id/requests', () => {
    it('应该返回会话的所有完整请求日志', async () => {
      await createLogFile('20240115-100000-abc.yaml', {
        requestId: 'req-full-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        request: {
          method: 'POST',
          path: '/v1/messages',
          headers: { 'x-claude-code-session-id': 'sess-full' },
          query: {},
          body: { model: 'glm-4' },
        },
        response: {
          timestamp: '2024-01-15T10:00:01.000Z',
          statusCode: 200,
          headers: {},
          body: { id: 'msg-1' },
          responseTime: 1000,
        },
        error: null,
      });

      const res = await request(app)
        .get('/logs/sessions/sess-full/requests')
        .expect(200);

      expect(res.body.sessionId).toBe('sess-full');
      expect(res.body.requests).toHaveLength(1);
      expect(res.body.requests[0].requestId).toBe('req-full-1');
      expect(res.body.requests[0].request.body).toEqual({ model: 'glm-4' });
      expect(res.body.count).toBe(1);
    });

    it('不存在的会话应该返回 404', async () => {
      const res = await request(app)
        .get('/logs/sessions/nonexistent/requests')
        .expect(404);

      expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('GET /logs/sessions/:sessionId/requests/:requestId', () => {
    it('应该返回指定请求详情', async () => {
      await createLogFile('20240115-100000-abc.yaml', {
        requestId: 'req-detail-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        request: {
          method: 'POST',
          path: '/v1/messages',
          headers: { 'x-claude-code-session-id': 'sess-req' },
          query: {},
          body: { model: 'glm-4' },
        },
        response: {
          timestamp: '2024-01-15T10:00:01.000Z',
          statusCode: 200,
          headers: {},
          body: { id: 'msg-1' },
          responseTime: 1000,
        },
        error: null,
      });

      const res = await request(app)
        .get('/logs/sessions/sess-req/requests/req-detail-1')
        .expect(200);

      expect(res.body.requestId).toBe('req-detail-1');
      expect(res.body.requestBody).toEqual({ model: 'glm-4' });
      expect(res.body.responseBody).toEqual({ id: 'msg-1' });
    });

    it('不存在的请求应该返回 404', async () => {
      const res = await request(app)
        .get('/logs/sessions/sess-req/requests/nonexistent')
        .expect(404);

      expect(res.body.error.code).toBe('REQUEST_NOT_FOUND');
    });
  });

  describe('DELETE /logs', () => {
    it('应该清空所有日志', async () => {
      await fs.writeFile(path.join(testDir, 'log1.yaml'), 'test', 'utf8');
      await fs.writeFile(path.join(testDir, 'log2.yaml'), 'test', 'utf8');

      const res = await request(app)
        .delete('/logs')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.deletedCount).toBe(2);

      const files = await fs.readdir(testDir);
      expect(files.filter(f => f.endsWith('.yaml')).length).toBe(0);
    });
  });
});
