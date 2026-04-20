const path = require('path');
const fs = require('fs');
const os = require('os');

// 创建全局临时目录用于测试
const testTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-proxy-test-'));

global.__TEST_TMP_DIR__ = testTmpDir;

// 清理临时目录中的 YAML 文件
afterEach(async () => {
  try {
    const files = fs.readdirSync(testTmpDir);
    for (const file of files) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        fs.unlinkSync(path.join(testTmpDir, file));
      }
    }
  } catch {
    // 忽略清理错误
  }
  // 等待 setImmediate 中的异步日志写入完成，避免 "Cannot log after tests are done" 警告
  await new Promise(resolve => setTimeout(resolve, 50));
});

// 测试套件结束后清理临时目录
afterAll(() => {
  try {
    const files = fs.readdirSync(testTmpDir);
    for (const file of files) {
      fs.unlinkSync(path.join(testTmpDir, file));
    }
    fs.rmdirSync(testTmpDir);
  } catch {
    // 忽略清理错误
  }
});
