const LogParser = require('../utils/logParser');
const config = require('../config');

// 创建日志解析器实例
const logParser = new LogParser(config.get('logDir'));

/**
 * 列出所有会话
 * @route GET /logs/sessions
 * @query {string} date - 可选，日期 YYYY-MM-DD
 */
async function listSessions(req, res) {
  try {
    const { date } = req.query;

    // 验证日期格式
    let targetDate = date;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: {
          message: '无效的日期格式，请使用 YYYY-MM-DD 格式',
          code: 'INVALID_DATE_FORMAT',
        },
      });
    }

    // 构建基础 URL
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    // 获取会话列表
    const sessions = await logParser.getSessionsByDate(targetDate, baseUrl);

    res.json({
      date: targetDate || new Date().toISOString().split('T')[0],
      sessions,
      count: sessions.length,
    });
  } catch (error) {
    console.error('获取会话列表失败:', error);
    res.status(500).json({
      error: {
        message: '获取会话列表失败',
        code: 'SESSIONS_FETCH_ERROR',
        details: error.message,
      },
    });
  }
}

/**
 * 获取指定会话详情
 * @route GET /logs/sessions/:id
 * @param {string} id - 会话 ID
 * @query {string} date - 可选，日期 YYYY-MM-DD
 */
async function getSessionDetails(req, res) {
  try {
    const { id } = req.params;
    const { date } = req.query;

    // 验证日期格式
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: {
          message: '无效的日期格式，请使用 YYYY-MM-DD 格式',
          code: 'INVALID_DATE_FORMAT',
        },
      });
    }

    // 构建基础 URL
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    // 获取会话详情
    const session = await logParser.getSessionById(id, date, baseUrl);

    if (!session) {
      return res.status(404).json({
        error: {
          message: '会话不存在',
          code: 'SESSION_NOT_FOUND',
          sessionId: id,
        },
      });
    }

    res.json(session);
  } catch (error) {
    console.error('获取会话详情失败:', error);
    res.status(500).json({
      error: {
        message: '获取会话详情失败',
        code: 'SESSION_FETCH_ERROR',
        details: error.message,
      },
    });
  }
}

/**
 * 获取指定请求的完整详情
 * @route GET /logs/sessions/:sessionId/requests/:requestId
 * @param {string} sessionId - 会话 ID
 * @param {string} requestId - 请求 ID
 * @query {string} date - 可选，日期 YYYY-MM-DD
 */
async function getRequestDetails(req, res) {
  try {
    const { sessionId, requestId } = req.params;
    const { date } = req.query;

    // 验证日期格式
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: {
          message: '无效的日期格式，请使用 YYYY-MM-DD 格式',
          code: 'INVALID_DATE_FORMAT',
        },
      });
    }

    // 获取请求详情
    const request = await logParser.getRequestById(sessionId, requestId, date);

    if (!request) {
      return res.status(404).json({
        error: {
          message: '请求不存在',
          code: 'REQUEST_NOT_FOUND',
          sessionId,
          requestId,
        },
      });
    }

    res.json(request);
  } catch (error) {
    console.error('获取请求详情失败:', error);
    res.status(500).json({
      error: {
        message: '获取请求详情失败',
        code: 'REQUEST_FETCH_ERROR',
        details: error.message,
      },
    });
  }
}

/**
 * 获取指定会话的所有完整请求日志
 * @route GET /logs/sessions/:id/requests
 * @param {string} id - 会话 ID
 * @query {string} date - 可选，日期 YYYY-MM-DD
 */
async function getSessionRequests(req, res) {
  try {
    const { id } = req.params;
    const { date } = req.query;

    // 验证日期格式
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: {
          message: '无效的日期格式，请使用 YYYY-MM-DD 格式',
          code: 'INVALID_DATE_FORMAT',
        },
      });
    }

    // 获取完整请求日志
    const requests = await logParser.getSessionRequests(id, date);

    if (!requests) {
      return res.status(404).json({
        error: {
          message: '会话不存在',
          code: 'SESSION_NOT_FOUND',
          sessionId: id,
        },
      });
    }

    res.json({
      sessionId: id,
      date: date || new Date().toISOString().split('T')[0],
      requests,
      count: requests.length,
    });
  } catch (error) {
    console.error('获取会话请求失败:', error);
    res.status(500).json({
      error: {
        message: '获取会话请求失败',
        code: 'SESSION_REQUESTS_FETCH_ERROR',
        details: error.message,
      },
    });
  }
}

/**
 * 清空所有日志
 * @route DELETE /logs
 */
async function clearAllLogs(req, res) {
  try {
    const result = await logParser.clearAllLogs();
    if (result.success) {
      res.json({
        success: true,
        message: `已清空日志，删除 ${result.deletedCount} 个日期目录`,
        deletedCount: result.deletedCount,
      });
    } else {
      res.status(500).json({
        error: {
          message: result.error,
          code: 'CLEAR_LOGS_ERROR',
        },
      });
    }
  } catch (error) {
    console.error('清空日志失败:', error);
    res.status(500).json({
      error: {
        message: '清空日志失败',
        code: 'CLEAR_LOGS_ERROR',
        details: error.message,
      },
    });
  }
}

module.exports = {
  listSessions,
  getSessionDetails,
  getSessionRequests,
  getRequestDetails,
  clearAllLogs,
};
