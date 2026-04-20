<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import SessionList from './components/SessionList.vue'
import RequestPanel from './components/RequestPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { getServerStatus, startServer, stopServer, getServerLogs, clearServerLogs, killProcessByPort, onServerLog, onServerStatusChange } from './api'
import type { ServerStatusInfo, ServerLogEntry } from './api'

const selectedSessionId = ref<string | null>(null)
const currentDate = ref<string>('')
const showSettings = ref(false)

const sidebarWidth = ref(320)
const isDraggingSidebar = ref(false)

const logPanelLeft = computed(() => `${sidebarWidth.value + 5}px`)

function handleSelectSession(sessionId: string) {
  selectedSessionId.value = sessionId
}

function handleDateChange(date: string) {
  currentDate.value = date
  selectedSessionId.value = null
}

function startDragSidebar(e: MouseEvent) {
  isDraggingSidebar.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  const startX = e.clientX
  const startWidth = sidebarWidth.value

  function onMove(ev: MouseEvent) {
    const delta = ev.clientX - startX
    sidebarWidth.value = Math.max(220, Math.min(500, startWidth + delta))
  }

  function onUp() {
    isDraggingSidebar.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// 服务状态
const serverStatus = ref<ServerStatusInfo>({ status: 'stopped', port: 3088, error: null })
const isToggling = ref(false)
const isKilling = ref(false)

async function handleKillProcess() {
  if (isKilling.value) return
  isKilling.value = true
  try {
    const port = serverStatus.value.port
    const result = await killProcessByPort(port)
    if (!result.success) {
      console.error(result.message)
    }
    // 主进程端杀掉进程后会自动等待端口释放并启动服务
  } finally {
    isKilling.value = false
  }
}

const statusText = {
  running: '运行中',
  stopped: '已停止',
  starting: '启动中',
  error: '启动失败',
}

const statusColor = {
  running: '#10b981',
  stopped: '#9ca3af',
  starting: '#f59e0b',
  error: '#ef4444',
}

async function toggleServer() {
  if (isToggling.value) return
  isToggling.value = true
  try {
    if (serverStatus.value.status === 'running') {
      await stopServer()
    } else {
      await startServer()
    }
  } finally {
    isToggling.value = false
  }
}

// 日志面板
const showLogs = ref(false)
const serverLogs = ref<ServerLogEntry[]>([])
const logsContainer = ref<HTMLDivElement | null>(null)
const logPanelHeight = ref(200)
const isDraggingLogPanel = ref(false)

function toggleLogs() {
  showLogs.value = !showLogs.value
}

function startDragLogPanel(e: MouseEvent) {
  isDraggingLogPanel.value = true
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'

  const startY = e.clientY
  const startHeight = logPanelHeight.value

  function onMove(ev: MouseEvent) {
    const delta = startY - ev.clientY
    logPanelHeight.value = Math.max(120, Math.min(500, startHeight + delta))
  }

  function onUp() {
    isDraggingLogPanel.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

async function handleClearLogs() {
  await clearServerLogs()
  serverLogs.value = []
}

function formatLogTime(timestamp: string): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function getLogLevelColor(level: string): string {
  switch (level) {
    case 'error': return '#ef4444'
    case 'warn': return '#f59e0b'
    case 'info': return '#3b82f6'
    default: return '#9ca3af'
  }
}

let unsubscribeLog: (() => void) | null = null
let unsubscribeStatus: (() => void) | null = null

onMounted(async () => {
  // 获取初始状态
  const status = await getServerStatus()
  serverStatus.value = status

  // 获取已有日志
  const logs = await getServerLogs()
  serverLogs.value = logs

  // 订阅日志推送
  unsubscribeLog = onServerLog((logEntry) => {
    serverLogs.value.push(logEntry)
    if (serverLogs.value.length > 500) {
      serverLogs.value.shift()
    }
    // 自动滚动到底部
    if (logsContainer.value) {
      setTimeout(() => {
        if (logsContainer.value) {
          logsContainer.value.scrollTop = logsContainer.value.scrollHeight
        }
      }, 0)
    }
  })

  // 订阅状态变化
  unsubscribeStatus = onServerStatusChange((statusInfo) => {
    serverStatus.value = statusInfo
  })
})

onUnmounted(() => {
  if (unsubscribeLog) unsubscribeLog()
  if (unsubscribeStatus) unsubscribeStatus()
})
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar" :style="{ width: sidebarWidth + 'px', minWidth: sidebarWidth + 'px' }">
      <div class="sidebar-header">
        <h1 class="logo">
          <span class="logo-icon">&#9670;</span>
          Log Viewer
        </h1>
        <div class="header-actions">
          <!-- 服务状态 -->
          <div class="server-status" :title="serverStatus.error || ''">
            <span class="status-dot" :style="{ backgroundColor: statusColor[serverStatus.status] }"></span>
            <span class="status-text">{{ statusText[serverStatus.status] }}</span>
            <span v-if="serverStatus.status === 'running'" class="status-port">:{{ serverStatus.port }}</span>
          </div>
          <!-- 启停按钮 -->
          <button
            class="action-btn toggle-btn"
            :class="{ 'stop': serverStatus.status === 'running', 'start': serverStatus.status !== 'running' }"
            :disabled="isToggling || serverStatus.status === 'starting'"
            :title="serverStatus.status === 'running' ? '停止服务' : '启动服务'"
            @click="toggleServer"
          >
            <svg v-if="serverStatus.status === 'running'" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <!-- 日志按钮 -->
          <button
            class="action-btn log-btn"
            :class="{ active: showLogs }"
            title="服务端日志"
            @click="toggleLogs"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </button>
          <!-- 设置按钮 -->
          <button class="action-btn settings-btn" title="设置" @click="showSettings = true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>
      <!-- 错误提示 -->
      <div v-if="serverStatus.error && serverStatus.status === 'error'" class="error-banner">
        <span class="error-icon">!</span>
        <span class="error-message">{{ serverStatus.error }}</span>
        <button
          v-if="serverStatus.error?.includes('端口')"
          class="kill-btn"
          :disabled="isKilling"
          @click="handleKillProcess"
        >
          {{ isKilling ? '终止中...' : '一键杀进程' }}
        </button>
      </div>
      <SessionList
        :current-date="currentDate"
        :selected-session-id="selectedSessionId"
        @select="handleSelectSession"
        @date-change="handleDateChange"
      />
    </aside>
    <div
      class="resizer"
      :class="{ dragging: isDraggingSidebar }"
      @mousedown="startDragSidebar"
    />
    <main
      class="main-content"
      :style="showLogs ? { height: `calc(100vh - ${logPanelHeight}px)` } : {}"
    >
      <RequestPanel
        v-if="selectedSessionId"
        :session-id="selectedSessionId"
        :date="currentDate"
      />
      <div v-else class="empty-state">
        <div class="empty-icon">&#8592;</div>
        <p>从左侧选择一个会话查看详情</p>
      </div>
    </main>

    <!-- 日志面板 -->
    <div v-if="showLogs" class="log-panel" :style="{ left: logPanelLeft, height: logPanelHeight + 'px' }">
      <div
        class="log-panel-resizer"
        :class="{ dragging: isDraggingLogPanel }"
        @mousedown="startDragLogPanel"
      />
      <div class="log-panel-header">
        <span class="log-panel-title">服务端日志</span>
        <div class="log-panel-actions">
          <span class="log-count">{{ serverLogs.length }} 条</span>
          <button class="log-action-btn" title="清空日志" @click="handleClearLogs">清空</button>
          <button class="log-action-btn" title="关闭" @click="toggleLogs">关闭</button>
        </div>
      </div>
      <div ref="logsContainer" class="log-panel-body">
        <div v-if="serverLogs.length === 0" class="log-empty">暂无日志</div>
        <div
          v-for="(log, index) in serverLogs"
          :key="index"
          class="log-line"
        >
          <span class="log-time">{{ formatLogTime(log.timestamp) }}</span>
          <span class="log-level" :style="{ color: getLogLevelColor(log.level) }">{{ log.level.toUpperCase() }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
      </div>
    </div>

    <SettingsPanel
      :visible="showSettings"
      @close="showSettings = false"
    />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-secondary);
  background: var(--bg-secondary);
}

.resizer {
  width: 5px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  flex-shrink: 0;
}

.resizer:hover,
.resizer.dragging {
  background: var(--accent-blue);
}

.sidebar-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-secondary);
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.logo {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-sans);
  letter-spacing: -0.3px;
  flex-shrink: 0;
}

.logo-icon {
  color: var(--accent-blue);
  font-size: 14px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.server-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-right: 4px;
  white-space: nowrap;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-text {
  font-size: 11px;
}

.status-port {
  font-size: 11px;
  opacity: 0.7;
}

.action-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 5px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toggle-btn.start {
  color: #10b981;
}

.toggle-btn.stop {
  color: #ef4444;
}

.toggle-btn:hover {
  background: var(--bg-hover);
}

.log-btn.active {
  background: var(--bg-hover);
  color: var(--accent-blue);
}

.error-banner {
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border-bottom: 1px solid rgba(239, 68, 68, 0.2);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #ef4444;
}

.error-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ef4444;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
  flex-shrink: 0;
}

.error-message {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kill-btn {
  margin-left: auto;
  background: #ef4444;
  color: white;
  border: none;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.kill-btn:hover {
  background: #dc2626;
}

.kill-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  gap: 12px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.3;
}

.empty-state p {
  font-size: 14px;
}

/* 日志面板 */
.log-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-secondary);
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.log-panel-resizer {
  height: 5px;
  cursor: row-resize;
  background: transparent;
  transition: background 0.15s;
  flex-shrink: 0;
}

.log-panel-resizer:hover,
.log-panel-resizer.dragging {
  background: var(--accent-blue);
}

.log-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-secondary);
  background: var(--bg-primary);
  flex-shrink: 0;
}

.log-panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.log-panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-count {
  font-size: 11px;
  color: var(--text-tertiary);
}

.log-action-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  transition: all 0.15s;
}

.log-action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.log-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 1.6;
}

.log-empty {
  color: var(--text-tertiary);
  text-align: center;
  padding: 20px;
  font-size: 12px;
}

.log-line {
  display: flex;
  gap: 8px;
  padding: 1px 0;
  word-break: break-all;
}

.log-time {
  color: var(--text-tertiary);
  flex-shrink: 0;
  min-width: 56px;
}

.log-level {
  flex-shrink: 0;
  min-width: 38px;
  font-weight: 600;
  font-size: 10px;
}

.log-message {
  color: var(--text-secondary);
  flex: 1;
}
</style>
