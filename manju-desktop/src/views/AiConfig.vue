<template>
  <div class="ai-config-page">
    <header class="header">
      <div class="header-inner">
        <h1 class="logo" @click="router.push('/')">
          <span class="logo-main">漫剧生成</span>
          <span class="logo-sub">manju desktop</span>
        </h1>
        <span class="breadcrumb-sep">›</span>
        <span class="page-title">AI 配置</span>
        <div class="header-actions">
          <el-button @click="router.push('/')">返回列表</el-button>
        </div>
      </div>
    </header>
    <main class="main">
      <AIConfigContent />
    </main>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import AIConfigContent from '@/components/AIConfigContent.vue'
const router = useRouter()
</script>

<style scoped>
.ai-config-page { min-height: 100vh; background: #0f0f12; color: #e4e4e7; }
.header { background: rgba(18, 18, 22, 0.82); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(139, 92, 246, 0.18); padding: 12px 24px; }
.header-inner { max-width: min(1200px, 96vw); margin: 0 auto; display: flex; align-items: center; gap: 16px; }
.logo { margin: 0; cursor: pointer; display: flex; flex-direction: column; gap: 1px; line-height: 1; }
.logo-main { font-size: 1.1rem; font-weight: 700; background: linear-gradient(135deg, #c4b5fd 0%, #818cf8 50%, #a78bfa 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.logo-sub { font-size: 0.68rem; color: #6d6d7a; -webkit-text-fill-color: #6d6d7a; }
.breadcrumb-sep { color: #3f3f46; font-size: 1rem; font-weight: 300; }
.page-title { font-size: 0.88rem; font-weight: 500; color: #a1a1aa; }
.header-actions { margin-left: auto; }
.main { max-width: min(1200px, 96vw); margin: 0 auto; padding: 24px 16px 48px; }
</style>
