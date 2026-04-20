<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onUnmounted } from 'vue'
import VueJsonPretty from 'vue-json-pretty'
import 'vue-json-pretty/lib/styles.css'

const props = defineProps<{
  data: any
}>()

const containerRef = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const showSearch = ref(false)
const matchCount = ref(0)
const currentMatch = ref(0)
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
const isHovered = ref(false)

let highlightSpans: HTMLElement[] = []

// 监听数据变化，重置搜索
watch(() => props.data, () => {
  searchQuery.value = ''
  showSearch.value = false
  matchCount.value = 0
  currentMatch.value = 0
  clearHighlights()
}, { deep: true })

function shouldHandleSearch(): boolean {
  if (!containerRef.value) return false
  const active = document.activeElement
  const container = containerRef.value
  // 1. 焦点在容器或其子元素内
  if (container.contains(active)) return true
  // 2. 鼠标当前在容器内
  if (isHovered.value) return true
  // 3. 页面无特定焦点且搜索框已打开（正在搜索时继续响应）
  if (active === document.body && showSearch.value) return true
  return false
}

function handleKeydown(e: KeyboardEvent) {
  const isCmdF = (isMac && e.metaKey && e.key === 'f') || (!isMac && e.ctrlKey && e.key === 'f')
  if (isCmdF) {
    if (shouldHandleSearch()) {
      e.preventDefault()
      openSearch()
    }
  }

  if (showSearch.value && shouldHandleSearch()) {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeSearch()
    }
    if (e.key === 'Enter' && matchCount.value > 0) {
      e.preventDefault()
      if (e.shiftKey) {
        prevMatch()
      } else {
        nextMatch()
      }
    }
  }
}

function openSearch() {
  showSearch.value = true
  nextTick(() => {
    const input = containerRef.value?.querySelector('.jv-search-input') as HTMLInputElement
    input?.focus()
    input?.select()
    if (searchQuery.value) {
      performSearch()
    }
  })
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

function closeSearch() {
  showSearch.value = false
  searchQuery.value = ''
  clearHighlights()
}

function clearHighlights() {
  if (!containerRef.value) return
  const marks = containerRef.value.querySelectorAll('.jv-highlight')
  marks.forEach((mark) => {
    const parent = mark.parentNode
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
      parent.normalize()
    }
  })
  highlightSpans = []
  matchCount.value = 0
  currentMatch.value = 0
}

function performSearch() {
  clearHighlights()
  if (!searchQuery.value || !containerRef.value) return

  const query = searchQuery.value.toLowerCase()
  const tree = containerRef.value.querySelector('.vjs-tree')
  if (!tree) return

  const walker = document.createTreeWalker(
    tree,
    NodeFilter.SHOW_TEXT,
    null
  )

  const textNodes: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.textContent && node.textContent.toLowerCase().includes(query)) {
      textNodes.push(node as Text)
    }
  }

  textNodes.forEach((textNode) => {
    const text = textNode.textContent || ''
    const parent = textNode.parentNode
    if (!parent) return

    const fragment = document.createDocumentFragment()
    let remaining = text
    const lowerQuery = query

    while (remaining.toLowerCase().includes(lowerQuery)) {
      const idx = remaining.toLowerCase().indexOf(lowerQuery)
      if (idx > 0) {
        fragment.appendChild(document.createTextNode(remaining.substring(0, idx)))
      }
      const span = document.createElement('span')
      span.className = 'jv-highlight'
      span.textContent = remaining.substring(idx, idx + query.length)
      fragment.appendChild(span)
      remaining = remaining.substring(idx + query.length)
    }
    if (remaining) {
      fragment.appendChild(document.createTextNode(remaining))
    }

    parent.replaceChild(fragment, textNode)
  })

  highlightSpans = Array.from(containerRef.value.querySelectorAll('.jv-highlight')) as HTMLElement[]
  matchCount.value = highlightSpans.length
  currentMatch.value = matchCount.value > 0 ? 1 : 0

  if (matchCount.value > 0) {
    scrollToMatch(0)
  }
}

function scrollToMatch(index: number) {
  if (highlightSpans.length === 0) return
  highlightSpans.forEach((span) => {
    span.classList.remove('jv-highlight-active')
  })
  const span = highlightSpans[index]
  span.classList.add('jv-highlight-active')
  span.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function nextMatch() {
  if (matchCount.value === 0) return
  currentMatch.value = currentMatch.value >= matchCount.value ? 1 : currentMatch.value + 1
  scrollToMatch(currentMatch.value - 1)
}

function prevMatch() {
  if (matchCount.value === 0) return
  currentMatch.value = currentMatch.value <= 1 ? matchCount.value : currentMatch.value - 1
  scrollToMatch(currentMatch.value - 1)
}

function onSearchInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeSearch()
  } else if (e.key === 'Enter' && matchCount.value > 0) {
    e.preventDefault()
    if (e.shiftKey) {
      prevMatch()
    } else {
      nextMatch()
    }
  }
}

function downloadJson() {
  const jsonStr = JSON.stringify(props.data, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'data.json'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div
    ref="containerRef"
    class="json-viewer-wrapper"
    tabindex="0"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @mousedown="containerRef?.focus()"
  >
    <VueJsonPretty
      :data="data"
      :deep="5"
      :show-double-quotes="true"
      :show-line="true"
      :show-length="true"
      :collapsed-on-click-brackets="true"
      :virtual="false"
      theme="light"
      class="custom-json-tree"
    />

    <!-- 下载按钮 -->
    <div class="jv-download-box" @mousedown.stop>
      <button class="jv-download-btn" title="下载 JSON" @click="downloadJson">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
    </div>

    <!-- 搜索框 -->
    <div v-if="showSearch" class="jv-search-box" @mousedown.stop>
      <input
        v-model="searchQuery"
        type="text"
        class="jv-search-input"
        placeholder="搜索..."
        @input="performSearch"
        @keydown="onSearchInputKeydown"
      />
      <span v-if="matchCount > 0" class="jv-search-count">
        {{ currentMatch }} / {{ matchCount }}
      </span>
      <span v-else-if="searchQuery" class="jv-search-count jv-no-match">
        无匹配
      </span>
      <button class="jv-search-btn" title="上一个 (Shift+Enter)" @click="prevMatch">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </button>
      <button class="jv-search-btn" title="下一个 (Enter)" @click="nextMatch">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <button class="jv-search-btn jv-close-btn" title="关闭 (Esc)" @click="closeSearch">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style>
/* 下载按钮 */
.jv-download-box {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
}

.jv-download-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.jv-download-btn:hover {
  background: var(--bg-hover);
  color: var(--accent-blue);
  border-color: var(--accent-blue);
}

/* 搜索框样式 */
.json-viewer-wrapper {
  position: relative;
  outline: none;
}

.json-viewer-wrapper:focus {
  outline: none;
}

.jv-search-box {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 8px;
  padding: 4px 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

.jv-search-input {
  width: 160px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  font-family: var(--font-mono);
  outline: none;
  padding: 2px 4px;
}

.jv-search-input::placeholder {
  color: var(--text-tertiary);
}

.jv-search-count {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  padding: 0 4px;
  font-family: var(--font-mono);
}

.jv-search-count.jv-no-match {
  color: var(--text-error);
}

.jv-search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
}

.jv-search-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.jv-search-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.jv-close-btn:hover {
  color: var(--text-error);
}

/* 搜索高亮 */
.jv-highlight {
  background-color: rgba(251, 191, 36, 0.4);
  border-radius: 2px;
  padding: 0 1px;
}

.jv-highlight-active {
  background-color: rgba(251, 191, 36, 0.85);
  outline: 1px solid rgba(251, 191, 36, 1);
}

/* 覆盖 vue-json-pretty 默认样式 */
.custom-json-tree {
  font-family: var(--font-mono) !important;
  font-size: 12px !important;
  line-height: 1.6 !important;
}

.custom-json-tree .vjs-tree {
  font-family: var(--font-mono) !important;
  font-size: 12px !important;
}

.custom-json-tree .vjs-tree-node {
  line-height: 1.7 !important;
}

.custom-json-tree .vjs-tree-node:hover {
  background-color: var(--bg-hover) !important;
  border-radius: 3px !important;
}

.custom-json-tree .vjs-indent-unit.has-line {
  border-left: 1px dashed var(--border-primary) !important;
}

/* 键名 */
.custom-json-tree .vjs-key {
  color: var(--json-key) !important;
  white-space: nowrap;
}

/* 字符串 */
.custom-json-tree .vjs-value-string {
  color: var(--json-string) !important;
}

/* 数字 */
.custom-json-tree .vjs-value-number,
.custom-json-tree .vjs-value-boolean {
  color: var(--json-number) !important;
}

/* null / undefined */
.custom-json-tree .vjs-value-null,
.custom-json-tree .vjs-value-undefined {
  color: var(--json-null) !important;
}

/* 括号 */
.custom-json-tree .vjs-tree-brackets {
  color: var(--json-bracket) !important;
}

.custom-json-tree .vjs-tree-brackets:hover {
  color: var(--accent-blue) !important;
}

/* 冒号 */
.custom-json-tree .vjs-colon {
  color: var(--json-colon) !important;
}

/* 折叠图标 */
.custom-json-tree .vjs-carets {
  color: var(--text-tertiary) !important;
}

.custom-json-tree .vjs-carets:hover {
  color: var(--accent-blue) !important;
}

/* 折叠提示 */
.custom-json-tree .vjs-comment {
  color: var(--text-tertiary) !important;
}

/* 行号（如果启用） */
.custom-json-tree .vjs-node-index {
  color: var(--text-tertiary) !important;
}

/* 值 */
.custom-json-tree .vjs-value {
  word-break: break-all;
}

/* 移除选中高亮的蓝色 */
.custom-json-tree .vjs-tree-node.is-highlight {
  background-color: var(--bg-active) !important;
}
</style>
