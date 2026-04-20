<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { listSessions, formatDate, formatDuration, clearAllLogs, openLogDir, subscribeLogEvents, type Session } from '../api'

const props = defineProps<{
  selectedSessionId: string | null
}>()

const emit = defineEmits<{
  select: [sessionId: string]
  cleared: []
}>()

const sessions = ref<Session[]>([])
const loading = ref(false)
const error = ref('')

let isRequesting = false
let unsubscribeEvents: (() => void) | null = null

async function loadSessions(isAuto = false) {
  // 避免并发请求
  if (isRequesting) return
  isRequesting = true

  if (!isAuto) {
    loading.value = true
  }
  error.value = ''

  try {
    const res = await listSessions()
    // 按时间降序排列，最新的在最前面
    sessions.value = res.sessions.sort((a, b) => {
      const tA = new Date(a.timeSpan.start).getTime()
      const tB = new Date(b.timeSpan.start).getTime()
      return tB - tA
    })
  } catch (err: any) {
    error.value = err.message || '加载失败'
    if (!isAuto) {
      sessions.value = []
    }
  } finally {
    isRequesting = false
    if (!isAuto) {
      loading.value = false
    }
  }
}

async function handleClearLogs() {
  if (!confirm('确定要清空所有日志吗？此操作不可恢复。')) return
  try {
    const result = await clearAllLogs()
    sessions.value = []
    emit('cleared')
    alert(`已清空日志，删除 ${result.deletedCount} 个文件`)
  } catch (err: any) {
    alert('清空日志失败: ' + (err.message || '未知错误'))
  }
}

async function handleOpenDir() {
  try {
    await openLogDir()
  } catch (err: any) {
    alert('打开目录失败: ' + (err.message || '未知错误'))
  }
}

function startEventSubscription() {
  if (unsubscribeEvents) return
  unsubscribeEvents = subscribeLogEvents((event) => {
    if (event.type === 'log_updated') {
      loadSessions(true)
    }
  })
}

function stopEventSubscription() {
  if (unsubscribeEvents) {
    unsubscribeEvents()
    unsubscribeEvents = null
  }
}

onMounted(() => {
  loadSessions(false)
  startEventSubscription()
})

onUnmounted(() => {
  stopEventSubscription()
})
</script>

<template>
  <div class="session-list">
    <div class="toolbar">
      <span class="session-count">{{ sessions.length }} 个会话</span>
      <button class="refresh-btn" @click="loadSessions(false)" :disabled="loading" title="刷新">
        <span :class="{ spinning: loading }">&#x21bb;</span>
      </button>
      <button class="open-dir-btn" @click="handleOpenDir" title="在文件管理器中打开日志目录">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
      <button class="clear-btn" @click="handleClearLogs" title="清空日志">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>

    <div v-if="loading" class="loading">
      <span class="spinner"></span>
      加载中...
    </div>

    <div v-else-if="error && sessions.length === 0" class="error">
      {{ error }}
    </div>

    <div v-else-if="sessions.length === 0" class="empty">
      暂无会话记录
    </div>

    <div v-else class="list">
      <div
        v-for="session in sessions"
        :key="session.sessionId"
        class="session-item"
        :class="{ active: selectedSessionId === session.sessionId }"
        @click="$emit('select', session.sessionId)"
      >
        <div class="session-header">
          <span class="session-id">{{ session.sessionId.slice(0, 8) }}</span>
          <span class="request-count">{{ session.requestCount }} 请求</span>
        </div>
        <div class="session-meta">
          <span class="meta-item">{{ formatDate(session.timeSpan.start) }}</span>
          <span class="meta-separator">&#xb7;</span>
          <span class="meta-item">{{ formatDuration(session.timeSpan.duration) }}</span>
        </div>
        <div class="endpoints">
          <span v-for="ep in session.endpoints" :key="ep" class="endpoint-tag">{{ ep }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-secondary);
  background: var(--bg-primary);
}

.session-count {
  flex: 1;
  font-size: 12px;
  color: var(--text-secondary);
}

.refresh-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-primary);
  cursor: pointer;
  font-size: 16px;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.refresh-btn:hover {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.open-dir-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-primary);
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.open-dir-btn:hover {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}

.clear-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-primary);
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.clear-btn:hover {
  border-color: #ef4444;
  color: #ef4444;
}

.loading,
.error,
.empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

.error {
  color: var(--text-error);
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-item {
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 4px;
}

.session-item:hover {
  background: var(--bg-hover);
}

.session-item.active {
  background: var(--bg-active);
  box-shadow: inset 0 0 0 1px var(--accent-blue-light);
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.session-id {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.request-count {
  font-size: 12px;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 10px;
}

.session-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.meta-item {
  font-size: 12px;
  color: var(--text-secondary);
}

.meta-separator {
  color: var(--text-tertiary);
  font-size: 12px;
}

.endpoints {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.endpoint-tag {
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 4px;
  font-family: var(--font-mono);
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-secondary);
  border-top-color: var(--accent-blue);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 8px;
  vertical-align: middle;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.spinning {
  display: inline-block;
  animation: spin 0.8s linear infinite;
}
</style>
