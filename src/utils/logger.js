const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

/**
 * 日志工具类
 * 负责将请求-响应对以 YAML 格式写入日志文件
 */
class Logger {
  constructor(logDir) {
    this.logDir = logDir;
  }

  /**
   * 确保日志目录存在
   */
  async ensureLogDir() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * 生成日志文件名
   * 格式: YYYYMMDD-HHMMSS-shortId.yaml
   * @param {string} requestId - 请求唯一标识符
   * @returns {string} 日志文件名
   */
  generateLogFileName(requestId) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const dateTimeStr = `${year}${month}${day}-${hours}${minutes}${seconds}`;
    const shortId = requestId.split('-')[0]; // 取 UUID 第一段
    return `${dateTimeStr}-${shortId}.yaml`;
  }

  /**
   * 安全序列化，处理循环引用
   * @param {*} data - 要序列化的数据
   * @returns {*} 安全的数据对象
   */
  safeSerialize(data) {
    const seen = new WeakSet();
    return JSON.parse(JSON.stringify(data, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      // 过滤掉特殊类型
      if (value && typeof value === 'object') {
        // 过滤掉可能的内部对象
        if (value.constructor && value.constructor.name === 'TLSSocket') {
          return '[TLSSocket]';
        }
        if (value.constructor && value.constructor.name === 'HTTPParser') {
          return '[HTTPParser]';
        }
      }
      return value;
    }));
  }

  /**
   * 将对象序列化为 YAML 格式
   * @param {Object} data - 要序列化的数据
   * @returns {string} YAML 字符串
   */
  serializeToYaml(data) {
    try {
      // 先进行安全序列化，处理循环引用
      const safeData = this.safeSerialize(data);
      return yaml.dump(safeData, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        sortKeys: false,
      });
    } catch (error) {
      // 如果 YAML 序列化失败，回退到 JSON
      console.error('YAML 序列化失败，使用 JSON 格式:', error.message);
      try {
        const safeData = this.safeSerialize(data);
        return JSON.stringify(safeData, null, 2);
      } catch (jsonError) {
        console.error('JSON 序列化也失败:', jsonError.message);
        return JSON.stringify({ error: '无法序列化日志数据' }, null, 2);
      }
    }
  }

  /**
   * 写入日志文件
   * @param {Object} logData - 日志数据
   * @param {string} logData.requestId - 请求唯一标识符
   * @param {string} logData.timestamp - 请求时间戳
   * @param {Object} logData.request - 请求数据
   * @param {Object} logData.response - 响应数据
   * @param {Object|null} logData.error - 错误信息
   */
  async writeLog(logData) {
    try {
      // 确保日志目录存在
      await this.ensureLogDir();

      // 生成日志文件名
      const fileName = this.generateLogFileName(logData.requestId);
      const filePath = path.join(this.logDir, fileName);

      // 序列化为 YAML
      const yamlContent = this.serializeToYaml(logData);

      // 写入文件
      await fs.writeFile(filePath, yamlContent, 'utf8');

      // 简洁的日志写入提示
      const fileNameOnly = path.basename(filePath);
      console.log(`✓ 日志已保存: ${fileNameOnly}`);
    } catch (error) {
      console.error('✗ 写入日志失败:', error.message);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 清理过期日志
   * @param {number} retentionDays - 保留天数
   */
  async cleanOldLogs(retentionDays = 7) {
    try {
      const now = Date.now();
      const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

      const files = await fs.readdir(this.logDir);

      for (const file of files) {
        if (!file.endsWith('.yaml')) continue;

        const filePath = path.join(this.logDir, file);
        const stat = await fs.stat(filePath);

        if (now - stat.mtime.getTime() > retentionMs) {
          await fs.unlink(filePath);
          console.log(`已删除过期日志: ${file}`);
        }
      }
    } catch (error) {
      console.error('清理日志失败:', error);
    }
  }

  /**
   * 清空所有日志
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

      console.log(`已清空日志，删除 ${deletedCount} 个文件`);
      return { success: true, deletedCount };
    } catch (error) {
      console.error('清空日志失败:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = Logger;
