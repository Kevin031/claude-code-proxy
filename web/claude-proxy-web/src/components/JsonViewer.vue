<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onUnmounted, computed } from 'vue'
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
const format = ref<'json' | 'yaml'>('json')

// 将 JSON 转换为 YAML
const rawYaml = computed(() => {
  if (format.value === 'json') return ''
  return jsonToYaml(props.data)
})

let highlightSpans: HTMLElement[] = []

// JSON 转 YAML 简单实现
function jsonToYaml(obj: any, indent = 0): string {
  if (obj === null || obj === undefined) return 'null'
  if (typeof obj === 'boolean') return obj ? 'true' : 'false'
  if (typeof obj === 'number') return String(obj)
  if (typeof obj === 'string') return JSON.stringify(obj)

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]'
    return obj.map(item => {
      const str = jsonToYaml(item, indent + 2)
      if (str.includes('\n')) {
        return ' '.repeat(indent) + '-\n' + str
      }
      return ' '.repeat(indent) + '- ' + str
    }).join('\n')
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj)
    if (keys.length === 0) return '{}'
    return keys.map(key => {
      const value = obj[key]
      const yamlValue = jsonToYaml(value, indent + 2)
      if (yamlValue.includes('\n')) {
        return ' '.repeat(indent) + key + ':\n' + yamlValue
      }
      return ' '.repeat(indent) + key + ': ' + yamlValue
    }).join('\n')
  }

  return String(obj)
}

// 监听数据变化，重置搜索
watch(() => props.data, () => {
  searchQuery.value = ''
  showSearch.value = false
  matchCount.value = 0
  currentMatch.value = 0
  clearHighlights()
}, { deep: true })

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function highlightYaml(yamlStr: string): string {
  return yamlStr.split('\n').map(line => {
    // 空行
    if (!line.trim()) return ''

    // 注释
    if (line.trim().startsWith('#')) {
      return `<span class="yaml-comment">${escapeHtml(line)}</span>`
    }

    // 匹配 key: value 结构
    const match = line.match(/^(\s*)([^\s:]+)(:\s*)(.*)$/)
    if (match) {
      const [, indent, key, colon, value] = match
      const highlightedValue = highlightYamlValue(value)
      return `${indent}<span class="yaml-key">${escapeHtml(key)}</span><span class="yaml-colon">${colon}</span>${highlightedValue}`
    }

    // 列表项 - 开头是 -
    const listMatch = line.match(/^(\s*-\s*)(.*)$/)
    if (listMatch) {
      const [, prefix, value] = listMatch
      return `${prefix}${highlightYamlValue(value)}`
    }

    return escapeHtml(line)
  }).join('\n')
}

function highlightYamlValue(value: string): string {
  if (!value.trim()) return ''

  const trimmed = value.trim()

  // null
  if (trimmed === 'null' || trimmed === '~') {
    return value.replace(trimmed, `<span class="yaml-null">${trimmed}</span>`)
  }

  // boolean
  if (trimmed === 'true' || trimmed === 'false') {
    return value.replace(trimmed, `<span class="yaml-boolean">${trimmed}</span>`)
  }

  // number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return value.replace(trimmed, `<span class="yaml-number">${trimmed}</span>`)
  }

  // 字符串引号包裹
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return `<span class="yaml-string">${escapeHtml(value)}</span>`
  }

  // 普通字符串值
  return `<span class="yaml-string">${escapeHtml(value)}</span>`
}

function shouldHandleSearch(): boolean {
  if (!containerRef.value) return false
  const active = document.activeElement
  const container = containerRef.value
  if (container.contains(active)) return true
  if (isHovered.value) return true
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
  const tree = containerRef.value.querySelector('.vjs-tree, .yaml-viewer')
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

function downloadData() {
  let content: string
  let mimeType: string
  let fileName: string

  if (format.value === 'yaml') {
    content = rawYaml.value
    mimeType = 'text/yaml'
    fileName = 'data.yaml'
  } else {
    content = JSON.stringify(props.data, null, 2)
    mimeType = 'application/json'
    fileName = 'data.json'
  }

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
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
    <!-- JSON 模式 -->
    <VueJsonPretty
      v-if="format === 'json'"
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

    <!-- YAML 模式 -->
    <pre
      v-if="format === 'yaml'"
      class="yaml-viewer"
      v-html="highlightYaml(rawYaml)"
    />

    <!-- 格式切换 + 下载按钮 -->
    <div class="jv-toolbar" @mousedown.stop>
      <div class="format-toggle">
        <button
          class="format-btn"
          :class="{ active: format === 'json' }"
          @click="format = 'json'"
        >
          JSON
        </button>
        <button
          class="format-btn"
          :class="{ active: format === 'yaml' }"
          @click="format = 'yaml'"
        >
          YAML
        </button>
      </div>
      <button class="jv-download-btn" title="下载" @click="downloadData">
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
/* 工具栏 */
.jv-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 10;
}

.format-toggle {
  display: flex;
  background: var(--bg-secondary);
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  overflow: hidden;
}

.format-btn {
  padding: 4px 10px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all 0.15s;
}

.format-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.format-btn.active {
  color: var(--accent-blue);
  background: var(--bg-active);
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
  top: 44px;
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

/* YAML 查看器 */
.yaml-viewer {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.9;
  margin: 0;
  padding: 12px;
  background: var(--bg-code);
  border-radius: 8px;
  border: 1px solid var(--border-tertiary);
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-word;
  color: var(--text-primary);
}

.yaml-key {
  color: var(--json-key);
  font-weight: 500;
}

.yaml-colon {
  color: var(--json-colon);
}

.yaml-string {
  color: var(--json-string);
}

.yaml-number {
  color: var(--json-number);
}

.yaml-boolean {
  color: var(--json-number);
  font-weight: 600;
}

.yaml-null {
  color: var(--json-null);
  font-style: italic;
}

.yaml-comment {
  color: var(--text-tertiary);
  font-style: italic;
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
