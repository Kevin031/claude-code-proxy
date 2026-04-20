const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

/**
 * 检查端口是否被占用
 * @param {number} port - 端口号
 * @returns {Promise<boolean>}
 */
function checkPortInUse(port) {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(`http://localhost:${port}/health`, { timeout: 1000 }, () => {
      req.destroy();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * 获取当前进程相关的进程 ID 列表
 * 在 Windows 上需要排除主进程及其子进程，避免杀掉自己
 * @returns {Promise<Set<number>>}
 */
async function getCurrentAppPids() {
  const pids = new Set([process.pid]);

  if (process.platform === 'win32') {
    try {
      // 使用 wmic 获取父进程 ID
      const { stdout } = await execPromise(`wmic process where "ProcessId=${process.pid}" get ParentProcessId /value`);
      const match = stdout.match(/ParentProcessId=(\d+)/);
      if (match) {
        pids.add(parseInt(match[1], 10));
      }
    } catch (error) {
      console.warn('无法获取父进程 ID:', error.message);
    }
  }

  return pids;
}

/**
 * 根据端口杀掉占用进程（排除当前应用进程）
 * @param {number} port - 端口号
 * @returns {Promise<{ success: boolean; message: string }>}
 */
async function killProcessByPort(port) {
  try {
    // 获取当前应用相关的 PID，避免杀掉自己
    const appPids = await getCurrentAppPids();

    if (process.platform === 'win32') {
      // Windows: 先查找 PID，再 taskkill
      const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');
      const foundPids = [...new Set(
        lines
          .map((line) => {
            const parts = line.trim().split(/\s+/);
            return parts[parts.length - 1];
          })
          .filter((pid) => pid && /^\d+$/.test(pid))
          .map((pid) => parseInt(pid, 10))
      )];

      // 过滤掉当前应用的进程
      const pids = foundPids.filter((pid) => !appPids.has(pid));

      if (pids.length === 0) {
        if (foundPids.length > 0) {
          return { success: false, message: `端口 ${port} 仅被当前应用占用，无需杀进程` };
        }
        return { success: false, message: `未找到占用端口 ${port} 的进程` };
      }

      for (const pid of pids) {
        await execPromise(`taskkill /F /PID ${pid}`);
      }
      return { success: true, message: `已终止进程 (PID: ${pids.join(', ')})` };
    } else {
      // macOS / Linux
      const { stdout } = await execPromise(`lsof -ti:${port}`);
      const pids = stdout.trim().split('\n').filter(Boolean).map((pid) => parseInt(pid, 10));

      // 过滤掉当前应用的进程
      const filteredPids = pids.filter((pid) => !appPids.has(pid));

      if (filteredPids.length === 0) {
        if (pids.length > 0) {
          return { success: false, message: `端口 ${port} 仅被当前应用占用，无需杀进程` };
        }
        return { success: false, message: `未找到占用端口 ${port} 的进程` };
      }

      for (const pid of filteredPids) {
        await execPromise(`kill -9 ${pid}`);
      }
      return { success: true, message: `已终止进程 (PID: ${filteredPids.join(', ')})` };
    }
  } catch (error) {
    return { success: false, message: error.message || String(error) };
  }
}

/**
 * 等待端口释放
 * @param {number} port - 端口号
 * @param {number} maxWaitMs - 最大等待时间（毫秒）
 * @param {number} intervalMs - 检查间隔（毫秒）
 * @returns {Promise<boolean>} 是否成功释放
 */
async function waitForPortRelease(port, maxWaitMs = 5000, intervalMs = 500) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const inUse = await checkPortInUse(port);
    if (!inUse) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * 清理端口占用（检查并杀掉占用进程）
 * @param {number} port - 端口号
 * @returns {Promise<{ success: boolean; message: string }>}
 */
async function cleanPort(port) {
  const inUse = await checkPortInUse(port);
  if (!inUse) {
    return { success: true, message: `端口 ${port} 未被占用` };
  }

  console.log(`端口 ${port} 被占用，尝试清理占用进程...`);
  const killResult = await killProcessByPort(port);

  if (killResult.success) {
    console.log(`已清理占用进程: ${killResult.message}`);
    // 等待端口释放
    const released = await waitForPortRelease(port, 8000, 500);
    if (!released) {
      return { success: false, message: `端口 ${port} 释放超时` };
    }
    console.log(`端口 ${port} 已释放`);
    return { success: true, message: `端口 ${port} 已清理` };
  }

  return { success: false, message: `清理进程失败: ${killResult.message}` };
}

module.exports = {
  checkPortInUse,
  getCurrentAppPids,
  killProcessByPort,
  waitForPortRelease,
  cleanPort,
};
