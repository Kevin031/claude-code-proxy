<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface AppConfig {
  port: number
  targetApiUrl: string
  timeout: number
  logDir: string
}

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const config = ref<AppConfig>({
  port: 3088,
  targetApiUrl: 'https://open.bigmodel.cn/api/anthropic',
  timeout: 30000,
  logDir: '',
})

const isElectron = ref(false)
const saving = ref(false)
const saved = ref(false)
const error = ref('')

onMounted(async () => {
  isElectron.value = typeof window !== 'undefined' && (window as any).electronAPI !== undefined
  if (isElectron.value) {
    try {
      const api = (window as any).electronAPI
      const data = await api.config.get()
      if (data) {
        config.value = { ...config.value, ...data }
      }
    } catch (e) {
      console.error('加载配置失败:', e)
    }
  }
})

async function handleSave() {
  if (!isElectron.value) return

  saving.value = true
  error.value = ''

  try {
    const api = (window as any).electronAPI
    await api.config.update({
      port: config.value.port,
      targetApiUrl: config.value.targetApiUrl,
      timeout: config.value.timeout,
    })

    saved.value = true
    setTimeout(() => {
      saved.value = false
    }, 2000)

    emit('saved')
  } catch (e: any) {
    error.value = e.message || '保存失败'
  } finally {
    saving.value = false
  }
}

async function handleRestart() {
  if (!isElectron.value) return
  try {
    const api = (window as any).electronAPI
    await api.restartServer()
    emit('saved')
  } catch (e: any) {
    error.value = e.message || '重启失败'
  }
}
</script>

<template>
  <div v-if="visible" class="settings-overlay" @click="emit('close')">
    <div class="settings-panel" @click.stop>
      <div class="settings-header">
        <h2>设置</h2>
        <button class="close-btn" @click="emit('close')">&times;</button>
      </div>

      <div class="settings-body">
        <div v-if="!isElectron" class="notice">
          配置管理仅在 Electron 桌面应用中可用
        </div>

        <div v-if="error" class="error-msg">{{ error }}</div>

        <div class="field">
          <label>代理端口</label>
          <input
            v-model.number="config.port"
            type="number"
            min="1024"
            max="65535"
            :disabled="!isElectron"
          />
          <span class="hint">本地代理服务器监听端口 (1024-65535)</span>
        </div>

        <div class="field">
          <label>目标 API 地址</label>
          <input
            v-model="config.targetApiUrl"
            type="url"
            :disabled="!isElectron"
          />
          <span class="hint">请求将被转发到此地址</span>
        </div>

        <div class="field">
          <label>超时时间 (毫秒)</label>
          <input
            v-model.number="config.timeout"
            type="number"
            min="1000"
            max="300000"
            :disabled="!isElectron"
          />
          <span class="hint">请求超时时间 (1000-300000ms)</span>
        </div>

        <div class="field">
          <label>日志目录</label>
          <input :value="config.logDir" type="text" disabled />
          <span class="hint">日志存储路径（自动设置）</span>
        </div>
      </div>

      <div class="settings-footer">
        <button
          v-if="isElectron"
          class="btn btn-secondary"
          :disabled="saving"
          @click="handleRestart"
        >
          重启服务
        </button>
        <button
          v-if="isElectron"
          class="btn btn-primary"
          :disabled="saving"
          @click="handleSave"
        >
          {{ saving ? '保存中...' : saved ? '已保存' : '保存配置' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-panel {
  background: var(--bg-primary);
  border-radius: 12px;
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-secondary);
}

.settings-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s;
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.settings-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.field {
  margin-bottom: 20px;
}

.field label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.field input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-secondary);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
  font-family: var(--font-mono);
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.field input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.field input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint {
  display: block;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
}

.settings-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-secondary);
}

.btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  border: none;
}

.btn-primary {
  background: var(--accent-blue);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-blue-hover, #3b82f6);
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-secondary);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.notice {
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.error-msg {
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
  font-size: 13px;
  color: #ef4444;
  margin-bottom: 16px;
}
</style>
