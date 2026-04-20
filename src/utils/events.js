const { EventEmitter } = require('events');

/**
 * 全局事件总线
 * 用于服务端内部事件通知，如日志写入完成后触发 SSE 推送
 */
const eventBus = new EventEmitter();

module.exports = eventBus;
