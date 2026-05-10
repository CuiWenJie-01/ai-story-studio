<template>
  <div class="drama-detail">
    <header class="header">
      <div class="header-inner">
        <h1 class="logo" @click="router.push('/')">
          <span class="logo-main">漫剧生成</span>
          <span class="logo-sub">manju desktop</span>
        </h1>
        <span class="breadcrumb-sep">›</span>
        <span class="page-title">{{ drama?.title || '剧集管理' }}</span>
        <el-button class="btn-back-list" @click="router.push('/')">
          <el-icon><ArrowLeft /></el-icon>返回列表
        </el-button>
        <div class="header-actions">
          <el-button class="btn-theme" :title="isDark ? '切换到浅色模式' : '切换到暗色模式'" @click="toggleTheme">
            <el-icon><Sunny v-if="isDark" /><Moon v-else /></el-icon>
            {{ isDark ? '浅色' : '暗色' }}
          </el-button>
          <el-button type="primary" @click="goCreate">
            <el-icon><VideoPlay /></el-icon>进入制作
          </el-button>
        </div>
      </div>
    </header>

    <main class="main" v-loading="loading">
      <section class="section card">
        <div class="section-title">剧集信息</div>
        <el-form :model="infoForm" label-width="110px" label-position="left" class="info-form">
          <el-row :gutter="24">
            <el-col :span="12">
              <el-form-item label="标题">
                <el-input v-model="infoForm.title" placeholder="剧集标题" @blur="saveInfo" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="图片/视频风格">
                <el-select v-model="infoForm.style" placeholder="选择全剧统一风格" clearable style="width: 100%" @change="saveInfo">
                  <el-option-group v-for="group in styleOptions" :key="group.label" :label="group.label">
                    <el-option v-for="opt in group.options" :key="opt.value" :label="opt.label" :value="opt.value" />
                  </el-option-group>
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="画面比例">
                <el-select v-model="infoForm.aspect_ratio" style="width: 100%" @change="saveInfo">
                  <el-option label="16:9 横屏（默认）" value="16:9" />
                  <el-option label="9:16 竖屏（短视频）" value="9:16" />
                  <el-option label="3:4 竖版" value="3:4" />
                  <el-option label="1:1 方形" value="1:1" />
                  <el-option label="4:3 传统横屏" value="4:3" />
                  <el-option label="21:9 宽银幕" value="21:9" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item label="故事梗概">
                <el-input v-model="infoForm.description" type="textarea" :rows="3" placeholder="一句话描述故事梗概" @blur="saveInfo" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </section>

      <section class="section card">
        <div class="section-header">
          <div class="section-title">分集列表</div>
          <span class="section-count">共 {{ episodes.length }} 集</span>
          <el-button size="small" type="primary" :loading="addingEpisode" @click="onAddEpisode" style="margin-left: auto">
            <el-icon><Plus /></el-icon>新增一集
          </el-button>
        </div>
        <div v-if="episodes.length === 0" class="empty-tip">暂无分集，点击「新增一集」开始创作</div>
        <div v-else class="episode-grid">
          <div v-for="ep in episodes" :key="ep.id" class="episode-card" title="点击进入制作页" @click="goEpisode(ep.id)">
            <div class="episode-card-header">
              <span class="episode-num">第 {{ ep.episode_number ?? ep.number ?? '?' }} 集</span>
              <el-button size="small" type="danger" plain circle :icon="Delete" :loading="deletingEpisodeId === ep.id" @click.stop="onDeleteEpisode(ep)" />
            </div>
            <div class="episode-title">{{ ep.title || '未命名' }}</div>
            <div class="episode-preview">{{ (ep.script_content || '').slice(0, 20) || '暂无剧本' }}</div>
            <div class="episode-stats">
              <span class="ep-stat">
                <span class="ep-stat-num">{{ ep.storyboards?.length ?? 0 }}</span> 分镜
              </span>
              <span v-if="ep.status" class="ep-stat ep-stat--status" :class="'ep-status--' + ep.status">{{ epStatusLabel(ep.status) }}</span>
            </div>
            <div class="episode-enter">
              <el-icon class="episode-enter-icon"><VideoPlay /></el-icon>
              进入制作
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, VideoPlay, Plus, Delete, Sunny, Moon } from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme'
import { dramaAPI } from '@/api/drama'
import { styleOptions, stylePromptMetadataForSave } from '@/constants/styleOptions'

const route = useRoute()
const router = useRouter()
const { isDark, toggle: toggleTheme } = useTheme()
const dramaId = Number(route.params.id)

const loading = ref(false)
const drama = ref(null)
const episodes = ref([])
const infoForm = reactive({ title: '', description: '', genre: '', style: '', aspect_ratio: '16:9' })
const addingEpisode = ref(false)
const deletingEpisodeId = ref(null)

async function loadDrama() {
  loading.value = true
  try {
    const d = await dramaAPI.get(dramaId)
    drama.value = d
    episodes.value = d.episodes || []
    infoForm.title = d.title || ''
    infoForm.description = d.description || ''
    infoForm.genre = d.genre || ''
    infoForm.style = d.style || ''
    infoForm.aspect_ratio = d.metadata?.aspect_ratio || '16:9'
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

let infoSaveTimer = null
function saveInfo() {
  if (infoSaveTimer) clearTimeout(infoSaveTimer)
  infoSaveTimer = setTimeout(async () => {
    try {
      await dramaAPI.update(dramaId, { title: infoForm.title, description: infoForm.description })
      await dramaAPI.saveOutline(dramaId, {
        genre: infoForm.genre || undefined,
        style: infoForm.style || undefined,
        metadata: {
          ...stylePromptMetadataForSave(infoForm.style),
          aspect_ratio: infoForm.aspect_ratio || '16:9',
        },
      })
    } catch (e) {
      console.error('saveInfo failed', e)
    }
  }, 600)
}

function goCreate() { router.push(`/film/${dramaId}`) }
function goEpisode(epId) { router.push(`/film/${dramaId}?episode=${epId}`) }

function epStatusLabel(status) {
  const map = { draft: '草稿', processing: '生成中', completed: '已完成', failed: '失败' }
  return map[status] || status
}

async function onDeleteEpisode(ep) {
  const label = `第 ${ep.episode_number ?? '?'} 集「${ep.title || '未命名'}」`
  try {
    await ElMessageBox.confirm(`确定删除 ${label}？此操作不可恢复。`, '删除确认', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消'
    })
  } catch { return }
  deletingEpisodeId.value = ep.id
  try {
    const remaining = episodes.value
      .filter((e) => e.id !== ep.id)
      .map((e, i) => ({
        episode_number: e.episode_number ?? i + 1,
        title: e.title || '第' + (e.episode_number ?? i + 1) + '集',
        script_content: e.script_content || '',
        description: e.description ?? null,
        duration: e.duration ?? 0,
      }))
    await dramaAPI.saveEpisodes(dramaId, remaining)
    ElMessage.success(`${label} 已删除`)
    await loadDrama()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  } finally {
    deletingEpisodeId.value = null
  }
}

async function onAddEpisode() {
  addingEpisode.value = true
  try {
    const list = episodes.value
    const nextNum = list.length > 0 ? Math.max(...list.map((e) => Number(e.episode_number) || 0), 0) + 1 : 1
    const updated = list.map((ep, i) => ({
      episode_number: ep.episode_number ?? i + 1,
      title: ep.title || '第' + (ep.episode_number ?? i + 1) + '集',
      script_content: ep.script_content || '',
      description: ep.description ?? null,
      duration: ep.duration ?? 0
    }))
    updated.push({ episode_number: nextNum, title: '第' + nextNum + '集', script_content: '', description: null, duration: 0 })
    await dramaAPI.saveEpisodes(dramaId, updated)
    ElMessage.success('已添加第' + nextNum + '集')
    await loadDrama()
  } catch (e) {
    ElMessage.error(e.message || '添加失败')
  } finally {
    addingEpisode.value = false
  }
}

onMounted(() => { loadDrama() })
</script>

<style scoped>
.drama-detail {
  min-height: 100vh;
  background: #0f0f12;
  background-image:
    radial-gradient(ellipse 80% 50% at 20% -20%, rgba(120, 60, 220, 0.18) 0%, transparent 60%),
    radial-gradient(ellipse 60% 40% at 80% 110%, rgba(60, 100, 220, 0.12) 0%, transparent 60%);
  color: #e4e4e7;
}
.header {
  background: rgba(18, 18, 22, 0.82);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(139, 92, 246, 0.18);
  padding: 12px 24px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.4);
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
  font-weight: 400;
  letter-spacing: 0.02em;
  color: #6d6d7a;
  -webkit-text-fill-color: #6d6d7a;
}
.header-inner { max-width: min(1200px, 96vw); margin: 0 auto; display: flex; align-items: center; gap: 16px; }
.breadcrumb-sep { color: #3f3f46; font-size: 1rem; font-weight: 300; flex-shrink: 0; user-select: none; }
.page-title {
  font-size: 0.88rem;
  font-weight: 500;
  color: #a1a1aa;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 3px 10px;
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.btn-back-list { flex-shrink: 0; }
.header-actions { margin-left: auto; display: flex; gap: 8px; flex-shrink: 0; }
.main { max-width: min(1200px, 96vw); margin: 0 auto; padding: 24px 16px 48px; display: flex; flex-direction: column; gap: 20px; }
.section.card {
  background: rgba(24, 24, 27, 0.75);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(63, 63, 70, 0.7);
  border-radius: 16px;
  padding: 20px 24px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
}
.section-title { font-size: 1rem; font-weight: 600; color: #fafafa; margin-bottom: 16px; }
.section-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.section-header .section-title { margin-bottom: 0; }
.section-count { color: #71717a; font-size: 0.85rem; }
.empty-tip { color: #71717a; text-align: center; padding: 32px; }

.episode-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.episode-card {
  background: rgba(28, 28, 30, 0.8);
  border: 1px solid rgba(63, 63, 70, 0.6);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.25s, transform 0.2s, box-shadow 0.25s, background 0.2s;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.episode-card:hover {
  border-color: rgba(139, 92, 246, 0.5);
  background: rgba(35, 35, 38, 0.9);
  transform: translateY(-3px);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.15);
}
.episode-enter {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #27272a;
  font-size: 0.78rem;
  color: #52525b;
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0.7;
  transition: color 0.2s, opacity 0.2s;
}
.episode-card:hover .episode-enter { color: var(--el-color-primary); opacity: 1; }
.episode-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.episode-num { font-size: 0.8rem; color: #71717a; }
.episode-title { font-weight: 500; color: #fafafa; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.episode-preview { font-size: 0.78rem; color: #71717a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px; }
.episode-stats { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ep-stat { font-size: 0.72rem; color: #71717a; }
.ep-stat-num { color: #38bdf8; font-weight: 600; }
.ep-stat--status { padding: 1px 7px; border-radius: 99px; font-size: 0.7rem; }
.ep-status--draft { background: rgba(113,113,122,0.15); color: #a1a1aa; }
.ep-status--processing { background: rgba(234,179,8,0.12); color: #fcd34d; }
.ep-status--completed { background: rgba(34,197,94,0.12); color: #4ade80; }

.btn-theme {
  --el-button-bg-color: rgba(148, 163, 184, 0.1);
  --el-button-border-color: rgba(148, 163, 184, 0.3);
  --el-button-text-color: #94a3b8;
  --el-button-hover-bg-color: rgba(148, 163, 184, 0.2);
  --el-button-hover-border-color: rgba(148, 163, 184, 0.5);
  --el-button-hover-text-color: #cbd5e1;
}

html.light .drama-detail {
  background: #f5f3ff;
  background-image:
    radial-gradient(ellipse 80% 50% at 20% -20%, rgba(139, 92, 246, 0.12) 0%, transparent 60%),
    radial-gradient(ellipse 60% 40% at 80% 110%, rgba(99, 102, 241, 0.08) 0%, transparent 60%);
}
html.light .header { background: rgba(255, 255, 255, 0.85) !important; border-bottom-color: rgba(139, 92, 246, 0.2) !important; }
html.light .section.card { background: rgba(255, 255, 255, 0.88); border-color: rgba(139, 92, 246, 0.15); }
html.light .episode-card { background: rgba(255, 255, 255, 0.85); border-color: rgba(139, 92, 246, 0.12); }
html.light .episode-title { color: #18181b; }
</style>
