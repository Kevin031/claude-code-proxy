const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined;

// Electron 环境下使用 localhost 直接访问，开发环境使用相对路径
const API_BASE = isElectron ? 'http://localhost:3088' : '';

export interface Session {
  sessionId: string;
  requestCount: number;
  timeSpan: {
    start: string;
    end: string;
    duration: number;
  };
  endpoints: string[];
  detailUrl: string;
}

export interface SessionListResponse {
  date: string;
  sessions: Session[];
  count: number;
}

export interface SessionDetail extends Session {
  requests: RequestSummary[];
}

export interface RequestSummary {
  requestId: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  detailUrl: string;
}

export interface RequestDetail {
  sessionId: string;
  requestId: string;
  timestamp: string;
  requestBody: any;
  responseBody: any;
}

export interface FullLogEntry {
  requestId: string;
  timestamp: string;
  request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    query: Record<string, any>;
    body: any;
  };
  response: {
    timestamp: string;
    statusCode: number;
    headers: Record<string, string>;
    body: any;
    responseTime: number;
  };
  error: any;
}

export interface SessionRequestsResponse {
  sessionId: string;
  date: string;
  requests: FullLogEntry[];
  count: number;
}

export interface ServerLogEntry {
  timestamp: string;
  level: 'log' | 'error' | 'warn' | 'info';
  message: string;
}

export interface ServerStatusInfo {
  status: 'stopped' | 'starting' | 'running' | 'error';
  port: number;
  error: string | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export function listSessions(date?: string): Promise<SessionListResponse> {
  const url = date
    ? `${API_BASE}/logs/sessions?date=${date}`
    : `${API_BASE}/logs/sessions`;
  return fetchJson<SessionListResponse>(url);
}

export function getSessionDetail(id: string, date?: string): Promise<SessionDetail> {
  const url = date
    ? `${API_BASE}/logs/sessions/${id}?date=${date}`
    : `${API_BASE}/logs/sessions/${id}`;
  return fetchJson<SessionDetail>(url);
}

export function getSessionRequests(id: string, date?: string): Promise<SessionRequestsResponse> {
  const url = date
    ? `${API_BASE}/logs/sessions/${id}/requests?date=${date}`
    : `${API_BASE}/logs/sessions/${id}/requests`;
  return fetchJson<SessionRequestsResponse>(url);
}

export function getRequestDetail(
  sessionId: string,
  requestId: string,
  date?: string
): Promise<RequestDetail> {
  const url = date
    ? `${API_BASE}/logs/sessions/${sessionId}/requests/${requestId}?date=${date}`
    : `${API_BASE}/logs/sessions/${sessionId}/requests/${requestId}`;
  return fetchJson<RequestDetail>(url);
}

export async function clearAllLogs(): Promise<{ success: boolean; message: string; deletedCount: number }> {
  const res = await fetch(`${API_BASE}/logs`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// 配置管理 API（Electron 环境下可用）
export async function getConfig() {
  if (isElectron) {
    return (window as any).electronAPI.config.get();
  }
  return null;
}

export async function setConfig(key: string, value: any) {
  if (isElectron) {
    return (window as any).electronAPI.config.set(key, value);
  }
  return null;
}

export async function updateConfig(config: Record<string, any>) {
  if (isElectron) {
    return (window as any).electronAPI.config.update(config);
  }
  return null;
}

export async function restartServer() {
  if (isElectron) {
    return (window as any).electronAPI.server.restart();
  }
  return null;
}

// 服务控制 API（Electron 环境下可用）
export async function startServer(): Promise<{ success: boolean; error?: string }> {
  if (isElectron) {
    return (window as any).electronAPI.server.start();
  }
  return { success: false, error: '仅在 Electron 环境下可用' };
}

export async function stopServer(): Promise<{ success: boolean }> {
  if (isElectron) {
    return (window as any).electronAPI.server.stop();
  }
  return { success: false };
}

export async function getServerStatus(): Promise<ServerStatusInfo> {
  if (isElectron) {
    return (window as any).electronAPI.server.status();
  }
  return { status: 'stopped', port: 3088, error: null };
}

export async function getServerLogs(): Promise<ServerLogEntry[]> {
  if (isElectron) {
    return (window as any).electronAPI.server.logs();
  }
  return [];
}

export async function clearServerLogs(): Promise<boolean> {
  if (isElectron) {
    return (window as any).electronAPI.server.clearLogs();
  }
  return false;
}

export async function killProcessByPort(port: number): Promise<{ success: boolean; message: string }> {
  if (isElectron) {
    return (window as any).electronAPI.server.killProcess(port);
  }
  return { success: false, message: '仅在 Electron 环境下可用' };
}

// 监听服务器日志推送（Electron 环境下可用）
export function onServerLog(callback: (logEntry: ServerLogEntry) => void): (() => void) | null {
  if (isElectron) {
    return (window as any).electronAPI.onServerLog(callback);
  }
  return null;
}

// 监听服务器状态变化（Electron 环境下可用）
export function onServerStatusChange(callback: (statusInfo: ServerStatusInfo) => void): (() => void) | null {
  if (isElectron) {
    return (window as any).electronAPI.onServerStatusChange(callback);
  }
  return null;
}

export interface LogEvent {
  type: 'connected' | 'log_updated';
  requestId?: string;
  timestamp?: string;
}

/**
 * 订阅 SSE 日志推送事件
 * @param onEvent 事件回调
 * @returns 取消订阅函数
 */
export function subscribeLogEvents(onEvent: (event: LogEvent) => void): (() => void) {
  const url = `${API_BASE}/logs/events`;
  const eventSource = new EventSource(url);

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onEvent(data);
    } catch {
      // 忽略无法解析的消息（如心跳注释）
    }
  };

  eventSource.onerror = () => {
    // 连接出错时会自动重连，无需额外处理
  };

  return () => {
    eventSource.close();
  };
}
