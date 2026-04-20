<script setup lang="ts">
import { ref, watch } from 'vue'
import { getSessionRequests, formatDate, type FullLogEntry } from '../api'
import JsonViewer from './JsonViewer.vue'

const props = defineProps<{
  sessionId: string
  date: string
}>()

const requests = ref<FullLogEntry[]>([])
const selectedRequest = ref<FullLogEntry | null>(null)
const loading = ref(false)
const error = ref('')
const activeTab = ref<'request' | 'response'>('request')
const requestListWidth = ref(360)
const isDraggingRequestList = ref(false)

function startDragRequestList(e: MouseEvent) {
  isDraggingRequestList.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  const startX = e.clientX
  const startWidth = requestListWidth.value

  function onMove(ev: MouseEvent) {
    const delta = ev.clientX - startX
    requestListWidth.value = Math.max(260, Math.min(550, startWidth + delta))
  }

  function onUp() {
    isDraggingRequestList.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

async function loadRequests() {
  loading.value = true
  error.value = ''
  selectedRequest.value = null
  try {
    const res = await getSessionRequests(props.sessionId, props.date || undefined)
    requests.value = res.requests
    if (res.requests.length > 0) {
      selectedRequest.value = res.requests[0]
    }
  } catch (err: any) {
    error.value = err.message || '加载失败'
    requests.value = []
  } finally {
    loading.value = false
  }
}

function getMethodClass(method: string): string {
  const m = method.toUpperCase()
  return `method-${m}`
}

function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return 'status-2xx'
  if (status >= 300 && status < 400) return 'status-3xx'
  if (status >= 400 && status < 500) return 'status-4xx'
  return 'status-5xx'
}

watch(() => props.sessionId, loadRequests, { immediate: true })
</script>

<template>
  <div class="request-panel">
    <!-- 请求列表 -->
    <div class="request-list" :style="{ width: requestListWidth + 'px', minWidth: requestListWidth + 'px' }">
      <div class="panel-header">
        <h3>请求列表</h3>
        <span class="count">{{ requests.length }} 个请求</span>
      </div>

      <div v-if="loading" class="panel-loading">加载中...</div>
      <div v-else-if="error" class="panel-error">{{ error }}</div>
      <div v-else-if="requests.length === 0" class="panel-empty">暂无请求</div>
      <div v-else class="request-items">
        <div
          v-for="req in requests"
          :key="req.requestId"
          class="request-item"
          :class="{ active: selectedRequest?.requestId === req.requestId }"
          @click="selectedRequest = req"
        >
          <div class="req-line1">
            <span class="method-badge" :class="getMethodClass(req.request.method)">
              {{ req.request.method }}
            </span>
            <span class="req-path">{{ req.request.path }}</span>
          </div>
          <div class="req-line2">
            <span class="status-badge" :class="getStatusClass(req.response.statusCode)">
              {{ req.response.statusCode }}
            </span>
            <span class="req-time">{{ formatDate(req.timestamp) }}</span>
            <span class="req-duration">{{ req.response.responseTime }}ms</span>
          </div>
        </div>
      </div>
    </div>
    <div
      class="resizer"
      :class="{ dragging: isDraggingRequestList }"
      @mousedown="startDragRequestList"
    />

    <!-- 请求详情 -->
    <div v-if="selectedRequest" class="request-detail">
      <div class="detail-header">
        <div class="detail-title">
          <span class="method-badge" :class="getMethodClass(selectedRequest.request.method)">
            {{ selectedRequest.request.method }}
          </span>
          <span class="detail-path">{{ selectedRequest.request.path }}</span>
        </div>
        <div class="detail-meta">
          <span class="status-badge" :class="getStatusClass(selectedRequest.response.statusCode)">
            {{ selectedRequest.response.statusCode }}
          </span>
          <span class="meta-text">{{ selectedRequest.response.responseTime }}ms</span>
          <span class="meta-text">{{ formatDate(selectedRequest.timestamp) }}</span>
        </div>
      </div>

      <!-- 标签页 -->
      <div class="detail-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'request' }"
          @click="activeTab = 'request'"
        >
          请求
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'response' }"
          @click="activeTab = 'response'"
        >
          响应
        </button>
      </div>

      <!-- 请求内容 -->
      <div v-show="activeTab === 'request'" class="detail-content">
        <!-- Headers -->
        <div class="section">
          <div class="section-title">Headers</div>
          <div class="headers-table">
            <div v-for="(value, key) in selectedRequest.request.headers" :key="key" class="header-row">
              <span class="header-key">{{ key }}</span>
              <span class="header-value">{{ value }}</span>
            </div>
          </div>
        </div>

        <!-- Query -->
        <div v-if="Object.keys(selectedRequest.request.query).length > 0" class="section">
          <div class="section-title">Query Parameters</div>
          <JsonViewer :data="selectedRequest.request.query" />
        </div>

        <!-- Body -->
        <div v-if="selectedRequest.request.body && Object.keys(selectedRequest.request.body).length > 0" class="section">
          <div class="section-title">Body</div>
          <JsonViewer :data="selectedRequest.request.body" />
        </div>
      </div>

      <!-- 响应内容 -->
      <div v-show="activeTab === 'response'" class="detail-content">
        <!-- Headers -->
        <div class="section">
          <div class="section-title">Headers</div>
          <div class="headers-table">
            <div v-for="(value, key) in selectedRequest.response.headers" :key="key" class="header-row">
              <span class="header-key">{{ key }}</span>
              <span class="header-value">{{ value }}</span>
            </div>
          </div>
        </div>

        <!-- Body -->
        <div v-if="selectedRequest.response.body" class="section">
          <div class="section-title">Body</div>
          <JsonViewer :data="selectedRequest.response.body" />
        </div>
      </div>
    </div>

    <div v-else-if="!loading && requests.length > 0" class="request-detail empty">
      选择一个请求查看详情
    </div>
  </div>
</template>

<style scoped>
.request-panel {
  display: flex;
  flex: 1;
  height: 100%;
  overflow: hidden;
}

.request-list {
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

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-secondary);
  background: var(--bg-primary);
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.count {
  font-size: 12px;
  color: var(--text-tertiary);
}

.panel-loading,
.panel-error,
.panel-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

.panel-error {
  color: var(--text-error);
}

.request-items {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.request-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 4px;
}

.request-item:hover {
  background: var(--bg-hover);
}

.request-item.active {
  background: var(--bg-active);
  box-shadow: inset 0 0 0 1px var(--accent-blue-light);
}

.req-line1 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.req-line2 {
  display: flex;
  align-items: center;
  gap: 10px;
}

.method-badge {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}

.method-GET {
  background: var(--method-get-bg);
  color: var(--method-get);
}

.method-POST {
  background: var(--method-post-bg);
  color: var(--method-post);
}

.method-PUT {
  background: var(--method-put-bg);
  color: var(--method-put);
}

.method-DELETE {
  background: var(--method-delete-bg);
  color: var(--method-delete);
}

.method-PATCH {
  background: var(--method-patch-bg);
  color: var(--method-patch);
}

.req-path {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-badge {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}

.status-2xx {
  background: var(--status-2xx-bg);
  color: var(--status-2xx);
}

.status-3xx {
  background: var(--status-3xx-bg);
  color: var(--status-3xx);
}

.status-4xx {
  background: var(--status-4xx-bg);
  color: var(--status-4xx);
}

.status-5xx {
  background: var(--status-5xx-bg);
  color: var(--status-5xx);
}

.req-time,
.req-duration {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 详情区域 */
.request-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
}

.request-detail.empty {
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}

.detail-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-secondary);
}

.detail-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.detail-path {
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--text-primary);
  font-weight: 500;
}

.detail-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.meta-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.detail-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 20px 0;
  border-bottom: 1px solid var(--border-secondary);
  background: var(--bg-primary);
}

.tab-btn {
  padding: 8px 16px;
  border: none;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.15s;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  color: var(--accent-blue);
  border-bottom-color: var(--accent-blue);
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin-bottom: 10px;
  letter-spacing: 0.5px;
}

.headers-table {
  background: var(--bg-code);
  border-radius: 8px;
  border: 1px solid var(--border-tertiary);
  overflow: hidden;
}

.header-row {
  display: flex;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border-tertiary);
  font-size: 13px;
}

.header-row:last-child {
  border-bottom: none;
}

.header-key {
  width: 200px;
  min-width: 200px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  font-weight: 500;
}

.header-value {
  color: var(--text-secondary);
  word-break: break-all;
  font-family: var(--font-mono);
  font-size: 12px;
}
</style>