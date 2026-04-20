const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const Logger = require('../../src/utils/logger');

describe('Logger', () => {
  let logger;
  let testDir;

  beforeEach(() => {
    testDir = global.__TEST_TMP_DIR__;
    logger = new Logger(testDir);
  });

  describe('generateLogFileName', () => {
    it('应该生成正确格式的文件名', () => {
      const requestId = '550e8400-e29b-41d4-a716-446655440000';
      const fileName = logger.generateLogFileName(requestId);

      // 格式: YYYYMMDD-HHMMSS-shortId.yaml
      expect(fileName).toMatch(/^\d{8}-\d{6}-550e8400\.yaml$/);
    });

    it('应该使用 UUID 的第一段作为短 ID', () => {
      const requestId = 'abc12345-6789-0def-ghij-klmnopqrstuv';
      const fileName = logger.generateLogFileName(requestId);

      expect(fileName).toContain('abc12345');
    });
  });

  describe('safeSerialize', () => {
    it('应该正常序列化普通对象', () => {
      const data = { a: 1, b: 'hello', c: [1, 2, 3] };
      const result = logger.safeSerialize(data);
      expect(result).toEqual(data);
    });

    it('应该处理循环引用', () => {
      const data = { a: 1 };
      data.self = data;

      const result = logger.safeSerialize(data);
      expect(result.self).toBe('[Circular]');
    });

    it('应该过滤 TLSSocket 对象', () => {
      // 模拟 TLSSocket 对象
      function TLSSocket() {}
      const data = { socket: new TLSSocket() };

      const result = logger.safeSerialize(data);
      expect(result.socket).toBe('[TLSSocket]');
    });

    it('应该过滤 HTTPParser 对象', () => {
      function HTTPParser() {}
      const data = { parser: new HTTPParser() };

      const result = logger.safeSerialize(data);
      expect(result.parser).toBe('[HTTPParser]');
    });
  });

  describe('serializeToYaml', () => {
    it('应该将对象序列化为 YAML 格式', () => {
      const data = { requestId: '123', method: 'GET' };
      const yamlStr = logger.serializeToYaml(data);

      expect(yamlStr).toContain('requestId:');
      expect(yamlStr).toContain('123');
      expect(yamlStr).toContain('method:');
    });

    it('应该处理无法 YAML 序列化的数据', () => {
      // 创建一个会导致 YAML 序列化失败的对象
      const data = {};
      data.self = data;

      const result = logger.serializeToYaml(data);
      // YAML dump 通常可以处理循环引用，但 safeSerialize 已经处理了
      expect(result).toContain('[Circular]');
    });
  });

  describe('writeLog', () => {
    it('应该将日志写入 YAML 文件', async () => {
      const logData = {
        requestId: 'test-req-001',
        timestamp: '2024-01-15T10:00:00.000Z',
        request: {
          method: 'POST',
          path: '/v1/messages',
          headers: { 'content-type': 'application/json' },
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
      };

      await logger.writeLog(logData);

      const files = await fs.readdir(testDir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml'));
      expect(yamlFiles.length).toBe(1);

      const content = await fs.readFile(path.join(testDir, yamlFiles[0]), 'utf8');
      const parsed = yaml.load(content);

      expect(parsed.requestId).toBe('test-req-001');
      expect(parsed.request.method).toBe('POST');
      expect(parsed.response.statusCode).toBe(200);
    });

    it('不应该因为循环引用而崩溃', async () => {
      const logData = {
        requestId: 'test-req-002',
        timestamp: new Date().toISOString(),
        request: { method: 'GET', path: '/' },
        response: { statusCode: 200 },
        error: null,
      };
      // 模拟循环引用
      logData.request.self = logData.request;

      await logger.writeLog(logData);

      const files = await fs.readdir(testDir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml'));
      expect(yamlFiles.length).toBe(1);
    });
  });

  describe('cleanOldLogs', () => {
    it('应该删除超过保留期的日志文件', async () => {
      // 创建一个新文件
      const newFile = path.join(testDir, '20240115-100000-abc.yaml');
      await fs.writeFile(newFile, 'test: data', 'utf8');

      // 创建一个旧文件（模拟 10 天前）
      const oldFile = path.join(testDir, '20240105-100000-xyz.yaml');
      await fs.writeFile(oldFile, 'test: old', 'utf8');

      // 修改旧文件的 mtime 为 10 天前
      const oldTime = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      await fs.utimes(oldFile, oldTime, oldTime);

      await logger.cleanOldLogs(7);

      const files = await fs.readdir(testDir);
      expect(files).toContain('20240115-100000-abc.yaml');
      expect(files).not.toContain('20240105-100000-xyz.yaml');
    });
  });

  describe('clearAllLogs', () => {
    it('应该删除所有 YAML 日志文件', async () => {
      await fs.writeFile(path.join(testDir, 'log1.yaml'), 'test', 'utf8');
      await fs.writeFile(path.join(testDir, 'log2.yaml'), 'test', 'utf8');
      await fs.writeFile(path.join(testDir, 'readme.txt'), 'not a log', 'utf8');

      const result = await logger.clearAllLogs();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);

      const files = await fs.readdir(testDir);
      expect(files).toContain('readme.txt');
      expect(files.filter(f => f.endsWith('.yaml')).length).toBe(0);
    });

    it('空目录应该返回成功和 0 计数', async () => {
      const result = await logger.clearAllLogs();
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });
  });
});
