describe('Config', () => {
  let config;

  beforeEach(() => {
    // 清除已加载的模块缓存，确保每次测试重新加载
    jest.resetModules();
    // 清除相关环境变量
    delete process.env.PORT;
    delete process.env.TARGETAPIURL;
    delete process.env.LOGDIR;
    delete process.env.TIMEOUT;
    delete process.env.NODEENV;
    // 重新加载配置模块
    config = require('../../src/config');
  });

  afterEach(() => {
    delete process.env.PORT;
    delete process.env.TARGETAPIURL;
    delete process.env.LOGDIR;
    delete process.env.TIMEOUT;
    delete process.env.NODEENV;
  });

  describe('get', () => {
    it('环境变量应该优先级最高', () => {
      process.env.PORT = '9999';
      // 重新加载以读取环境变量
      jest.resetModules();
      config = require('../../src/config');

      expect(config.get('port')).toBe(9999);
    });

    it('应该正确解析数值类型的环境变量', () => {
      process.env.TIMEOUT = '60000';
      jest.resetModules();
      config = require('../../src/config');

      expect(config.get('timeout')).toBe(60000);
    });

    it('没有环境变量时应该返回默认值', () => {
      expect(config.get('port')).toBe(3088);
      expect(config.get('targetApiUrl')).toBe('https://open.bigmodel.cn/api/anthropic');
      expect(config.get('logDir')).toBe('./logs');
      expect(config.get('timeout')).toBe(30000);
      expect(config.get('nodeEnv')).toBe('development');
    });

    it('不存在的配置键应该返回 undefined', () => {
      expect(config.get('nonexistent')).toBeUndefined();
    });
  });

  describe('set', () => {
    it('应该设置配置值', () => {
      config.set('port', 9090);
      // 由于环境变量优先级更高，需要确保没有环境变量覆盖
      delete process.env.PORT;
      expect(config.get('port')).toBe(9090);
    });
  });

  describe('getAll', () => {
    it('应该返回完整配置对象', () => {
      const all = config.getAll();

      expect(all).toHaveProperty('port');
      expect(all).toHaveProperty('nodeEnv');
      expect(all).toHaveProperty('targetApiUrl');
      expect(all).toHaveProperty('logDir');
      expect(all).toHaveProperty('timeout');
    });
  });

  describe('update', () => {
    it('应该批量更新配置', () => {
      config.update({ port: 7070, timeout: 10000 });

      delete process.env.PORT;
      delete process.env.TIMEOUT;
      expect(config.get('port')).toBe(7070);
      expect(config.get('timeout')).toBe(10000);
    });

    it('应该忽略不存在的配置键', () => {
      const before = config.getAll();
      config.update({ port: 6060, nonexistent: 'value' });

      delete process.env.PORT;
      expect(config.get('port')).toBe(6060);
      expect(config.get('nonexistent')).toBeUndefined();
    });
  });
});
