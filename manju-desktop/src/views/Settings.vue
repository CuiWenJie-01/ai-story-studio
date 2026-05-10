<template>
  <div class="settings-page">
    <header class="header">
      <div class="header-inner">
        <h1 class="logo" @click="router.push('/')">
          <span class="logo-main">漫剧生成</span>
          <span class="logo-sub">manju desktop</span>
        </h1>
        <span class="breadcrumb-sep">›</span>
        <span class="page-title">设置</span>
        <div class="header-actions">
          <el-button @click="router.push('/')">返回列表</el-button>
        </div>
      </div>
    </header>
    <main class="main">
      <div class="settings-card">
        <h2 class="settings-title">数据目录设置</h2>
        <p class="settings-desc">
          数据目录用于存放数据库文件（manju.db）和上传的文件。修改后需要重启应用才能生效。
        </p>
        
        <div class="current-path">
          <div class="path-label">当前数据目录：</div>
          <div class="path-value">{{ currentDataDir || '使用默认路径' }}</div>
          <div class="path-detail" v-if="settings.db_path">
            <div>数据库：{{ settings.db_path }}</div>
            <div>上传目录：{{ settings.upload_dir }}</div>
          </div>
        </div>

        <div class="path-input-row">
          <el-input
            v-model="newDataDir"
            placeholder="选择或输入新的数据目录路径"
            readonly
            class="path-input"
          >
            <template #append>
              <el-button @click="selectDirectory">浏览...</el-button>
            </template>
          </el-input>
        </div>

        <div class="actions">
          <el-button
            type="primary"
            :loading="saving"
            :disabled="!newDataDir || newDataDir === currentDataDir"
            @click="saveDataDir"
          >
            保存并重启
          </el-button>
          <el-button @click="resetToDefault" :disabled="!currentDataDir">
            恢复默认
          </el-button>
        </div>

        <el-alert
          v-if="saveMessage"
          :type="saveSuccess ? 'success' : 'error'"
          :title="saveMessage"
          show-icon
          :closable="false"
          style="margin-top: 16px"
        />
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request'

const router = useRouter()
const settings = ref({})
const currentDataDir = ref('')
const newDataDir = ref('')
const saving = ref(false)
const saveMessage = ref('')
const saveSuccess = ref(false)

async function loadSettings() {
  try {
    const res = await request.get('/settings')
    settings.value = res || {}
    currentDataDir.value = res?.data_dir || ''
    newDataDir.value = currentDataDir.value
  } catch (e) {
    ElMessage.error('加载设置失败')
  }
}

async function selectDirectory() {
  // 桌面环境使用原生的目录选择对话框
  // 由于浏览器安全限制，我们使用一个 input 来让用户选择文件夹
  // 在实际 Tauri 环境中，可以通过 Tauri API 调用系统文件选择器
  
  // 创建一个临时的 input 元素来选择目录
  const input = document.createElement('input')
  input.type = 'file'
  input.webkitdirectory = true
  input.directory = true
  input.style.display = 'none'
  
  input.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      // 获取选择的目录路径
      const file = e.target.files[0]
      const path = file.path || file.webkitRelativePath.split('/')[0]
      if (path) {
        newDataDir.value = path
      }
    }
    document.body.removeChild(input)
  })
  
  document.body.appendChild(input)
  input.click()
}

async function saveDataDir() {
  if (!newDataDir.value) {
    ElMessage.warning('请选择数据目录')
    return
  }
  
  saving.value = true
  saveMessage.value = ''
  
  try {
    const res = await request.post('/settings/data-dir', {
      data_dir: newDataDir.value
    })
    
    saveSuccess.value = true
    saveMessage.value = '数据目录已设置，应用将在 3 秒后重启...'
    
    // 3秒后重启应用
    setTimeout(() => {
      window.location.reload()
    }, 3000)
  } catch (e) {
    saveSuccess.value = false
    saveMessage.value = e?.message || '保存失败'
  } finally {
    saving.value = false
  }
}

async function resetToDefault() {
  try {
    await ElMessageBox.confirm(
      '确定要恢复默认数据目录吗？当前数据不会自动迁移。',
      '确认恢复默认',
      { type: 'warning' }
    )
    
    // 清空设置会恢复默认路径
    newDataDir.value = ''
    await saveDataDir()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('操作失败')
    }
  }
}

onMounted(() => {
  loadSettings()
})
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: #0f0f12;
  color: #e4e4e7;
}

.header {
  background: rgba(18, 18, 22, 0.82);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(139, 92, 246, 0.18);
  padding: 12px 24px;
}

.header-inner {
  max-width: min(1200px, 96vw);
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo {
  margin: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1;
}

.logo-main {
  font-size: 1.1rem;
  font-weight: 700;
  background: linear-gradient(135deg, #c4b5fd 0%, #818cf8 50%, #a78bfa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.logo-sub {
  font-size: 0.68rem;
  color: #6d6d7a;
  -webkit-text-fill-color: #6d6d7a;
}

.breadcrumb-sep {
  color: #3f3f46;
  font-size: 1rem;
  font-weight: 300;
}

.page-title {
  font-size: 0.88rem;
  font-weight: 500;
  color: #a1a1aa;
}

.header-actions {
  margin-left: auto;
}

.main {
  max-width: min(1200px, 96vw);
  margin: 0 auto;
  padding: 24px 16px 48px;
}

.settings-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(139, 92, 246, 0.15);
  border-radius: 12px;
  padding: 24px;
  max-width: 600px;
}

.settings-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 8px;
  color: #e4e4e7;
}

.settings-desc {
  font-size: 0.85rem;
  color: #a1a1aa;
  margin: 0 0 20px;
  line-height: 1.5;
}

.current-path {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.path-label {
  font-size: 0.8rem;
  color: #a1a1aa;
  margin-bottom: 4px;
}

.path-value {
  font-size: 0.95rem;
  color: #e4e4e7;
  font-family: 'Consolas', monospace;
  word-break: break-all;
}

.path-detail {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.8rem;
  color: #71717a;
  font-family: 'Consolas', monospace;
  line-height: 1.8;
}

.path-input-row {
  margin-bottom: 16px;
}

.path-input :deep(.el-input__wrapper) {
  background: rgba(0, 0, 0, 0.2);
}

.actions {
  display: flex;
  gap: 12px;
}
</style>
