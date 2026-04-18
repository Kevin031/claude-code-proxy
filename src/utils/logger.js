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
   * 获取当前日期的日志目录
   * @returns {string} 日期目录路径
   */
  getDateDir() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, dateStr);
  }

  /**
   * 确保日期日志目录存在
   */
  async ensureDateDir() {
    const dateDir = this.getDateDir();
    try {
      await fs.mkdir(dateDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
    return dateDir;
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
   * 将对象序列化为 YAML 格式
   * @param {Object} data - 要序列化的数据
   * @returns {string} YAML 字符串
   */
  serializeToYaml(data) {
    try {
      return yaml.dump(data, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        sortKeys: false,
      });
    } catch (error) {
      // 如果 YAML 序列化失败，回退到 JSON
      console.error('YAML 序列化失败，使用 JSON 格式:', error.message);
      return JSON.stringify(data, null, 2);
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
      // 确保日期目录存在
      const dateDir = await this.ensureDateDir();

      // 生成日志文件名
      const fileName = this.generateLogFileName(logData.requestId);
      const filePath = path.join(dateDir, fileName);

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

      // 读取日志目录下的所有子目录
      const dirs = await fs.readdir(this.logDir, { withFileTypes: true });

      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;

        const dirPath = path.join(this.logDir, dir.name);

        // 检查目录名称是否为日期格式
        const dateMatch = dir.name.match(/^(\d{4}-\d{2}-\d{2})$/);
        if (!dateMatch) continue;

        // 计算目录日期与当前时间的差值
        const dirDate = new Date(dir.name);
        const dirTime = dirDate.getTime();

        if (now - dirTime > retentionMs) {
          // 删除过期目录
          await fs.rm(dirPath, { recursive: true, force: true });
          console.log(`已删除过期日志目录: ${dirPath}`);
        }
      }
    } catch (error) {
      console.error('清理日志失败:', error);
    }
  }
}

module.exports = Logger;
