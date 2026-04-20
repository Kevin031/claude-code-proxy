const { exec } = require('child_process');
const path = require('path');
const LogParser = require('../utils/logParser');
const config = require('../config');

// 创建日志解析器实例
const logParser = new LogParser(config.get('logDir'));

/**
 * 列出所有会话
 * @route GET /logs/sessions
 */
async function listSessions(req, res) {
  try {
    // 构建基础 URL
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    // 获取会话列表
    const sessions = await logParser.getSessions(baseUrl);

    res.json({
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
 */
async function getSessionDetails(req, res) {
  try {
    const { id } = req.params;

    // 构建基础 URL
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    // 获取会话详情
    const session = await logParser.getSessionById(id, baseUrl);

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
 */
async function getRequestDetails(req, res) {
  try {
    const { sessionId, requestId } = req.params;

    // 获取请求详情
    const request = await logParser.getRequestById(sessionId, requestId);

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
 */
async function getSessionRequests(req, res) {
  try {
    const { id } = req.params;

    // 获取完整请求日志
    const requests = await logParser.getSessionRequests(id);

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
 * 获取指定请求的原始 YAML 日志内容
 * @route GET /logs/requests/:requestId/raw
 * @param {string} requestId - 请求 ID
 */
async function getRawLog(req, res) {
  try {
    const { requestId } = req.params;

    const content = await logParser.getRawLogByRequestId(requestId);

    if (!content) {
      return res.status(404).json({
        error: {
          message: '日志不存在',
          code: 'LOG_NOT_FOUND',
          requestId,
        },
      });
    }

    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.send(content);
  } catch (error) {
    console.error('获取原始日志失败:', error);
    res.status(500).json({
      error: {
        message: '获取原始日志失败',
        code: 'RAW_LOG_FETCH_ERROR',
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
        message: `已清空日志，删除 ${result.deletedCount} 个文件`,
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

/**
 * 在文件管理器中打开日志目录
 * @route POST /logs/open-dir
 */
async function openLogDir(req, res) {
  const logDir = config.get('logDir');
  const platform = process.platform;

  let command;
  if (platform === 'darwin') {
    command = `open "${logDir}"`;
  } else if (platform === 'win32') {
    command = `explorer "${path.resolve(logDir)}"`;
  } else {
    command = `xdg-open "${logDir}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.error('打开日志目录失败:', error);
      return res.status(500).json({
        error: {
          message: '打开日志目录失败',
          code: 'OPEN_DIR_ERROR',
          details: error.message,
        },
      });
    }
    res.json({ success: true, path: logDir });
  });
}

module.exports = {
  listSessions,
  getSessionDetails,
  getSessionRequests,
  getRequestDetails,
  getRawLog,
  clearAllLogs,
  openLogDir,
};
