<template>
  <div class="free-create">
    <header class="header">
      <div class="header-inner">
        <h1 class="logo" @click="router.push('/')">
          <span class="logo-main">漫剧生成</span>
          <span class="logo-sub">manju desktop</span>
        </h1>
        <span class="breadcrumb-sep">›</span>
        <span class="page-title">自由创作</span>
        <div class="header-actions">
          <el-button @click="router.push('/')">返回列表</el-button>
        </div>
      </div>
    </header>
    <main class="main">
      <div class="free-create-card">
        <h2 class="free-title">自由创作</h2>
        <p class="free-desc">输入你的创意，AI 将为你生成完整的分镜脚本</p>
        <el-input v-model="prompt" type="textarea" :rows="6" placeholder="描述你的故事创意..." />
        <div class="free-actions">
          <el-select v-model="style" placeholder="选择风格" style="width: 200px">
            <el-option-group v-for="group in styleOptions" :key="group.label" :label="group.label">
              <el-option v-for="opt in group.options" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-option-group>
          </el-select>
          <el-button type="primary" :loading="generating" @click="generate">开始生成</el-button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { styleOptions } from '@/constants/styleOptions'

const router = useRouter()
const prompt = ref('')
const style = ref('')
const generating = ref(false)

async function generate() {
  if (!prompt.value.trim()) {
    ElMessage.warning('请输入创意描述')
    return
  }
  generating.value = true
  setTimeout(() => {
    generating.value = false
    ElMessage.success('生成完成（演示模式）')
    router.push('/')
  }, 2000)
}
</script>

<style scoped>
.free-create { min-height: 100vh; background: #0f0f12; color: #e4e4e7; }
.header { background: rgba(18, 18, 22, 0.82); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(139, 92, 246, 0.18); padding: 12px 24px; }
.header-inner { max-width: min(1200px, 96vw); margin: 0 auto; display: flex; align-items: center; gap: 16px; }
.logo { margin: 0; cursor: pointer; display: flex; flex-direction: column; gap: 1px; line-height: 1; }
.logo-main { font-size: 1.1rem; font-weight: 700; background: linear-gradient(135deg, #c4b5fd 0%, #818cf8 50%, #a78bfa 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.logo-sub { font-size: 0.68rem; color: #6d6d7a; -webkit-text-fill-color: #6d6d7a; }
.breadcrumb-sep { color: #3f3f46; font-size: 1rem; font-weight: 300; }
.page-title { font-size: 0.88rem; font-weight: 500; color: #a1a1aa; }
.header-actions { margin-left: auto; }
.main { max-width: min(1200px, 96vw); margin: 0 auto; padding: 48px 16px; }
.free-create-card { background: rgba(24, 24, 27, 0.75); border: 1px solid rgba(63, 63, 70, 0.7); border-radius: 16px; padding: 32px; max-width: 600px; margin: 0 auto; }
.free-title { margin: 0 0 8px; font-size: 1.25rem; }
.free-desc { color: #71717a; margin: 0 0 20px; }
.free-actions { margin-top: 16px; display: flex; gap: 12px; }
</style>
