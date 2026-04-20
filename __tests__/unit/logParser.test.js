const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const LogParser = require('../../src/utils/logParser');

describe('LogParser', () => {
  let parser;
  let testDir;

  beforeEach(() => {
    testDir = global.__TEST_TMP_DIR__;
    parser = new LogParser(testDir);
  });

  async function createLogFile(fileName, data) {
    const filePath = path.join(testDir, fileName);
    await fs.writeFile(filePath, yaml.dump(data), 'utf8');
    return filePath;
  }

  describe('parseLogFile', () => {
    it('应该成功解析有效的 YAML 日志文件', async () => {
      const data = { requestId: '123', request: { method: 'GET' } };
      const filePath = await createLogFile('test1.yaml', data);

      const result = await parser.parseLogFile(filePath);
      expect(result).toEqual(data);
    });

    it('解析无效 YAML 应该返回 null', async () => {
      const filePath = path.join(testDir, 'invalid.yaml');
      await fs.writeFile(filePath, 'not: valid: yaml: [', 'utf8');

      const result = await parser.parseLogFile(filePath);
      expect(result).toBeNull();
    });

    it('不存在的文件应该返回 null', async () => {
      const result = await parser.parseLogFile(path.join(testDir, 'nonexistent.yaml'));
      expect(result).toBeNull();
    });
  });

  describe('extractSessionId', () => {
    it('应该从请求头中提取 x-claude-code-session-id', () => {
      const log = {
        request: {
          headers: {
            'x-claude-code-session-id': 'session-abc-123',
          },
        },
      };

      expect(parser.extractSessionId(log)).toBe('session-abc-123');
    });

    it('没有 session ID 时应该返回 method-path 格式', () => {
      const log = {
        request: {
          method: 'POST',
          path: '/v1/messages',
          headers: {},
        },
      };

      expect(parser.extractSessionId(log)).toBe('POST--v1-messages');
    });

    it('根路径应该显示为 root', () => {
      const log = {
        request: {
          method: 'GET',
          path: '/',
          headers: {},
        },
      };

      expect(parser.extractSessionId(log)).toBe('GET-root');
    });

    it('缺少 request 字段应该返回 UNK-root', () => {
      expect(parser.extractSessionId({})).toBe('UNK-root');
      expect(parser.extractSessionId(null)).toBe('UNK-root');
    });
  });

  describe('scanLogFiles', () => {
    it('应该只返回 yaml 文件', async () => {
      await fs.writeFile(path.join(testDir, 'log1.yaml'), 'test', 'utf8');
      await fs.writeFile(path.join(testDir, 'log2.yaml'), 'test', 'utf8');
      await fs.writeFile(path.join(testDir, 'readme.txt'), 'test', 'utf8');

      const files = await parser.scanLogFiles();
      expect(files.length).toBe(2);
      expect(files.every(f => f.endsWith('.yaml'))).toBe(true);
    });

    it('目录不存在时应该返回空数组', async () => {
      const emptyParser = new LogParser(path.join(testDir, 'nonexistent'));
      const files = await emptyParser.scanLogFiles();
      expect(files).toEqual([]);
    });
  });

  describe('groupLogsBySession', () => {
    it('应该按 session ID 分组日志', () => {
      const logs = [
        { request: { headers: { 'x-claude-code-session-id': 'sess-1' } } },
        { request: { headers: { 'x-claude-code-session-id': 'sess-1' } } },
        { request: { headers: { 'x-claude-code-session-id': 'sess-2' } } },
        { request: { method: 'GET', path: '/', headers: {} } },
      ];

      const groups = parser.groupLogsBySession(logs);

      expect(groups.get('sess-1').length).toBe(2);
      expect(groups.get('sess-2').length).toBe(1);
      expect(groups.get('GET-root').length).toBe(1);
    });
  });

  describe('buildSessionSummary', () => {
    it('应该构建正确的会话摘要', () => {
      const logs = [
        {
          requestId: 'req-1',
          timestamp: '2024-01-15T10:00:00.000Z',
          request: { method: 'POST', path: '/v1/messages' },
          response: { statusCode: 200 },
        },
        {
          requestId: 'req-2',
          timestamp: '2024-01-15T10:00:05.000Z',
          request: { method: 'GET', path: '/v1/models' },
          response: { statusCode: 200 },
        },
      ];

      const summary = parser.buildSessionSummary('sess-1', logs, 'http://localhost:3088');

      expect(summary.sessionId).toBe('sess-1');
      expect(summary.requestCount).toBe(2);
      expect(summary.timeSpan.start).toBe('2024-01-15T10:00:00.000Z');
      expect(summary.timeSpan.end).toBe('2024-01-15T10:00:05.000Z');
      expect(summary.timeSpan.duration).toBe(5000);
      expect(summary.endpoints).toContain('/v1/messages');
      expect(summary.endpoints).toContain('/v1/models');
      expect(summary.detailUrl).toBe('http://localhost:3088/logs/sessions/sess-1');
    });

    it('空日志数组应该返回 null', () => {
      const summary = parser.buildSessionSummary('sess-1', []);
      expect(summary).toBeNull();
    });
  });

  describe('getSessions', () => {
    it('应该返回所有会话摘要并按时间排序', async () => {
      await createLogFile('log1.yaml', {
        requestId: 'req-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        request: {
          method: 'POST',
          path: '/v1/messages',
          headers: { 'x-claude-code-session-id': 'sess-a' },
        },
        response: { statusCode: 200 },
      });

      await createLogFile('log2.yaml', {
        requestId: 'req-2',
        timestamp: '2024-01-15T09:00:00.000Z',
        request: {
          method: 'POST',
          path: '/v1/messages',
          headers: { 'x-claude-code-session-id': 'sess-b' },
        },
        response: { statusCode: 200 },
      });

      const sessions = await parser.getSessions('http://localhost:3088');

      expect(sessions.length).toBe(2);
      // 按开始时间排序，sess-b 在前
      expect(sessions[0].sessionId).toBe('sess-b');
      expect(sessions[1].sessionId).toBe('sess-a');
    });
  });

  describe('getSessionById', () => {
    it('应该返回指定会话详情', async () => {
      await createLogFile('log1.yaml', {
        requestId: 'req-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        request: {
          method: 'POST',
          path: '/v1/messages',
          headers: { 'x-claude-code-session-id': 'sess-1' },
        },
        response: { statusCode: 200, responseTime: 100 },
      });

      const session = await parser.getSessionById('sess-1', 'http://localhost:3088');

      expect(session).not.toBeNull();
      expect(session.sessionId).toBe('sess-1');
      expect(session.requests.length).toBe(1);
      expect(session.requests[0].requestId).toBe('req-1');
    });

    it('不存在的会话应该返回 null', async () => {
      const session = await parser.getSessionById('nonexistent');
      expect(session).toBeNull();
    });
  });

  describe('getRequestById', () => {
    it('应该返回指定请求详情', async () => {
      await createLogFile('log1.yaml', {
        requestId: 'req-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        request: {
          method: 'POST',
          path: '/v1/messages',
          headers: { 'x-claude-code-session-id': 'sess-1' },
          body: { model: 'glm-4' },
        },
        response: {
          statusCode: 200,
          body: { id: 'msg-1' },
        },
      });

      const request = await parser.getRequestById('sess-1', 'req-1');

      expect(request).not.toBeNull();
      expect(request.requestId).toBe('req-1');
      expect(request.requestBody).toEqual({ model: 'glm-4' });
      expect(request.responseBody).toEqual({ id: 'msg-1' });
    });

    it('不存在的请求应该返回 null', async () => {
      const request = await parser.getRequestById('sess-1', 'nonexistent');
      expect(request).toBeNull();
    });
  });

  describe('getSessionRequests', () => {
    it('应该返回会话的所有完整请求日志', async () => {
      await createLogFile('log1.yaml', {
        requestId: 'req-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        request: {
          method: 'POST',
          path: '/v1/messages',
          headers: { 'x-claude-code-session-id': 'sess-1' },
        },
        response: { statusCode: 200 },
      });

      const requests = await parser.getSessionRequests('sess-1');

      expect(requests).not.toBeNull();
      expect(requests.length).toBe(1);
      expect(requests[0].requestId).toBe('req-1');
    });

    it('不存在的会话应该返回 null', async () => {
      const requests = await parser.getSessionRequests('nonexistent');
      expect(requests).toBeNull();
    });
  });

  describe('clearAllLogs', () => {
    it('应该删除所有 YAML 日志文件', async () => {
      await fs.writeFile(path.join(testDir, 'log1.yaml'), 'test', 'utf8');
      await fs.writeFile(path.join(testDir, 'log2.yaml'), 'test', 'utf8');

      const result = await parser.clearAllLogs();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
    });
  });
});
