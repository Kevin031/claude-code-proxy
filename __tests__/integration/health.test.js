const request = require('supertest');
const { createApp } = require('../../src/index');

describe('Health Endpoint', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  it('GET /health 应该返回服务状态', async () => {
    const res = await request(app)
      .get('/health')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(new Date(res.body.timestamp)).toBeInstanceOf(Date);
    expect(res.body).toHaveProperty('uptime');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });
});
