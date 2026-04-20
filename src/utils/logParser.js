const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const config = require('../config');

/**
 * 日志解析工具类
 * 负责解析、扫描和分组日志文件
 */
class LogParser {
  constructor(logDir) {
    this.logDir = logDir || config.get('logDir');
  }

  /**
   * 解析单个 YAML 日志文件
   * @param {string} filePath - 日志文件路径
   * @returns {Promise<Object|null>} 解析后的日志对象，失败返回 null
   */
  async parseLogFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return yaml.load(content);
    } catch (error) {
      console.error(`解析日志文件失败: ${filePath}`, error.message);
      return null;
    }
  }

  /**
   * 从日志中提取会话 ID
   * @param {Object} log - 日志对象
   * @returns {string|null} 会话 ID，不存在返回 null
   */
  extractSessionId(log) {
    try {
      const sessionId = log?.request?.headers?.['x-claude-code-session-id'];
      if (sessionId) return sessionId;
      // 没有 session ID 的请求，用 method-path 作为标识
      const method = log?.request?.method || 'UNK';
      const pathStr = log?.request?.path || '/';
      // 根路径显示为 root，其他路径替换 / 为 -
      const safePath = pathStr === '/' ? 'root' : pathStr.replace(/\//g, '-');
      return `${method}-${safePath}`;
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * 扫描日志目录，获取所有日志文件
   * @returns {Promise<string[]>} 日志文件路径数组
   */
  async scanLogFiles() {
    try {
      const files = await fs.readdir(this.logDir);
      return files
        .filter(file => file.endsWith('.yaml'))
        .map(file => path.join(this.logDir, file));
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 目录不存在是正常情况，静默返回空数组
        return [];
      }
      throw error;
    }
  }

  /**
   * 解析所有日志文件
   * @returns {Promise<Object[]>} 解析后的日志数组
   */
  async parseAllLogs() {
    const logFiles = await this.scanLogFiles();
    const logs = [];

    for (const filePath of logFiles) {
      const log = await this.parseLogFile(filePath);
      if (log) {
        logs.push(log);
      }
    }

    return logs;
  }

  /**
   * 按会话 ID 分组日志
   * @param {Object[]} logs - 日志数组
   * @returns {Map<string, Object[]>} 会话 ID 到日志数组的映射
   */
  groupLogsBySession(logs) {
    const sessions = new Map();

    for (const log of logs) {
      const sessionId = this.extractSessionId(log);

      // 处理没有会话 ID 的请求
      const key = sessionId || 'no-session';

      if (!sessions.has(key)) {
        sessions.set(key, []);
      }

      sessions.get(key).push(log);
    }

    return sessions;
  }

  /**
   * 构建会话摘要信息
   * @param {string} sessionId - 会话 ID
   * @param {Object[]} logs - 该会话的所有日志
   * @param {string} baseUrl - 基础 URL，用于构建详情链接
   * @returns {Object} 会话摘要
   */
  buildSessionSummary(sessionId, logs, baseUrl = '') {
    if (logs.length === 0) {
      return null;
    }

    // 按时间排序
    const sortedLogs = logs.sort((a, b) =>
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    const firstLog = sortedLogs[0];
    const lastLog = sortedLogs[sortedLogs.length - 1];

    const startTime = new Date(firstLog.timestamp).getTime();
    const endTime = new Date(lastLog.timestamp).getTime();

    // 收集所有端点
    const endpoints = new Set();
    for (const log of logs) {
      if (log.request?.path) {
        endpoints.add(log.request.path);
      }
    }

    return {
      sessionId,
      requestCount: logs.length,
      timeSpan: {
        start: firstLog.timestamp,
        end: lastLog.timestamp,
        duration: endTime - startTime,
      },
      endpoints: Array.from(endpoints),
      detailUrl: `${baseUrl}/logs/sessions/${encodeURIComponent(sessionId)}`,
    };
  }

  /**
   * 获取所有会话
   * @param {string} baseUrl - 基础 URL，用于构建详情链接
   * @returns {Promise<Object[]>} 会话摘要数组
   */
  async getSessions(baseUrl = '') {
    const logs = await this.parseAllLogs();
    const sessionsMap = this.groupLogsBySession(logs);

    const sessions = [];

    for (const [sessionId, sessionLogs] of sessionsMap.entries()) {
      const summary = this.buildSessionSummary(sessionId, sessionLogs, baseUrl);
      if (summary) {
        sessions.push(summary);
      }
    }

    // 按开始时间排序
    return sessions.sort((a, b) =>
      new Date(a.timeSpan.start) - new Date(b.timeSpan.start)
    );
  }

  /**
   * 获取指定会话的详情
   * @param {string} sessionId - 会话 ID
   * @param {string} baseUrl - 基础 URL，用于构建详情链接
   * @returns {Promise<Object|null>} 会话详情
   */
  async getSessionById(sessionId, baseUrl = '') {
    const logs = await this.parseAllLogs();

    const sessionLogs = logs.filter(log => {
      const logSessionId = this.extractSessionId(log);
      return logSessionId === sessionId;
    });

    if (sessionLogs.length === 0) {
      return null;
    }

    const summary = this.buildSessionSummary(sessionId, sessionLogs, baseUrl);

    // 构建请求摘要列表
    const requests = sessionLogs.map(log => ({
      requestId: log.requestId,
      timestamp: log.timestamp,
      method: log.request?.method,
      path: log.request?.path,
      statusCode: log.response?.statusCode,
      responseTime: log.response?.responseTime,
      detailUrl: `${baseUrl}/logs/sessions/${sessionId}/requests/${log.requestId}`,
    }));

    // 按时间排序
    requests.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return {
      ...summary,
      requests,
    };
  }

  /**
   * 获取指定请求的完整详情
   * @param {string} sessionId - 会话 ID
   * @param {string} requestId - 请求 ID
   * @returns {Promise<Object|null>} 请求详情
   */
  async getRequestById(sessionId, requestId) {
    const logs = await this.parseAllLogs();

    const log = logs.find(l => {
      const logSessionId = this.extractSessionId(l);
      return logSessionId === sessionId && l.requestId === requestId;
    });

    if (!log) {
      return null;
    }

    return {
      sessionId,
      requestId: log.requestId,
      timestamp: log.timestamp,
      requestBody: log.request?.body,
      responseBody: log.response?.body,
    };
  }

  /**
   * 获取指定会话的所有完整请求日志
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<Object[]|null>} 完整日志数组
   */
  async getSessionRequests(sessionId) {
    const logs = await this.parseAllLogs();

    const sessionLogs = logs.filter(log => {
      const logSessionId = this.extractSessionId(log);
      return logSessionId === sessionId;
    });

    if (sessionLogs.length === 0) {
      return null;
    }

    // 按时间排序
    return sessionLogs.sort((a, b) =>
      new Date(a.timestamp) - new Date(b.timestamp)
    );
  }

  /**
   * 获取指定请求的原始 YAML 日志内容
   * @param {string} requestId - 请求 ID
   * @returns {Promise<string|null>} 原始 YAML 内容，找不到返回 null
   */
  async getRawLogByRequestId(requestId) {
    try {
      const files = await fs.readdir(this.logDir);
      const shortId = requestId.split('-')[0];

      // 通过 shortId 匹配文件名
      const targetFile = files.find(file =>
        file.endsWith('.yaml') && file.includes(`-${shortId}.`)
      );

      if (!targetFile) {
        return null;
      }

      const filePath = path.join(this.logDir, targetFile);
      const content = await fs.readFile(filePath, 'utf8');
      return content;
    } catch (error) {
      console.error('读取原始日志失败:', error.message);
      return null;
    }
  }

  /**
   * 清空所有日志
   * @returns {Promise<{ success: boolean; deletedCount?: number; error?: string }>}
   */
  async clearAllLogs() {
    try {
      const files = await fs.readdir(this.logDir);
      let deletedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.yaml')) continue;

        const filePath = path.join(this.logDir, file);
        await fs.unlink(filePath);
        deletedCount++;
      }

      return { success: true, deletedCount };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = LogParser;
