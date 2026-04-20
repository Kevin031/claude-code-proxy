const express = require('express');
const router = express.Router();
const {
  listSessions,
  getSessionDetails,
  getSessionRequests,
  getRequestDetails,
  clearAllLogs,
} = require('../controllers/logController');

/**
 * 日志查询路由
 * 提供按会话分组的日志查询功能
 */

// 列出所有会话
// GET /logs/sessions?date=YYYY-MM-DD
router.get('/sessions', listSessions);

// 获取指定会话详情
// GET /logs/sessions/:id?date=YYYY-MM-DD
router.get('/sessions/:id', getSessionDetails);

// 获取指定会话的所有完整请求日志
// GET /logs/sessions/:id/requests?date=YYYY-MM-DD
router.get('/sessions/:id/requests', getSessionRequests);

// 获取指定请求的完整详情
// GET /logs/sessions/:sessionId/requests/:requestId?date=YYYY-MM-DD
router.get('/sessions/:sessionId/requests/:requestId', getRequestDetails);

// 清空所有日志
// DELETE /logs
router.delete('/', clearAllLogs);

module.exports = router;
