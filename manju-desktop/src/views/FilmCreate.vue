<template>
  <div class="film-create">
    <header class="header">
      <div class="header-inner">
        <h1 class="logo" @click="router.push('/')">
          <span class="logo-main">漫剧生成</span>
          <span class="logo-sub">manju desktop</span>
        </h1>
        <span class="breadcrumb-sep">›</span>
        <span class="page-title">{{ drama?.title || 'AI 视频生成' }}</span>
        <el-button class="btn-back-list" @click="router.push('/drama/' + dramaId)">
          <el-icon><ArrowLeft /></el-icon>返回剧集
        </el-button>
        <div class="header-actions">
          <el-button class="btn-theme" :title="isDark ? '切换到浅色模式' : '切换到暗色模式'" @click="toggleTheme">
            <el-icon><Sunny v-if="isDark" /><Moon v-else /></el-icon>
            {{ isDark ? '浅色' : '暗色' }}
          </el-button>
          <el-button type="primary" :loading="generating" @click="generateStoryboard">
            <el-icon><VideoPlay /></el-icon>生成分镜
          </el-button>
        </div>
      </div>
    </header>

    <main class="main" v-loading="loading">
      <div class="create-layout">
        <aside class="sidebar">
          <div class="sidebar-section">
            <div class="sidebar-title">剧集信息</div>
            <div class="sidebar-info">
              <div class="sidebar-info-item">
                <span class="sidebar-info-label">标题</span>
                <span class="sidebar-info-value">{{ drama?.title || '-' }}</span>
              </div>
              <div class="sidebar-info-item">
                <span class="sidebar-info-label">风格</span>
                <span class="sidebar-info-value">{{ formatStyle(drama?.style) }}</span>
              </div>
              <div class="sidebar-info-item">
                <span class="sidebar-info-label">画面比例</span>
                <span class="sidebar-info-value">{{ drama?.metadata?.aspect_ratio || '16:9' }}</span>
              </div>
            </div>
          </div>
          <div class="sidebar-section">
            <div class="sidebar-title">分集选择</div>
            <el-select v-model="selectedEpisodeId" style="width: 100%" @change="onEpisodeChange">
              <el-option v-for="ep in episodes" :key="ep.id" :label="`第${ep.episode_number ?? '?'}集 ${ep.title || ''}`" :value="ep.id" />
            </el-select>
          </div>
          <div class="sidebar-section">
            <div class="sidebar-title">剧本内容</div>
            <el-input v-model="scriptContent" type="textarea" :rows="8" placeholder="输入剧本内容..." @blur="saveScript" />
          </div>
        </aside>

        <div class="content">
          <div class="content-header">
            <div class="content-title">分镜列表</div>
            <div class="content-actions">
              <el-button size="small" @click="addStoryboard">
                <el-icon><Plus /></el-icon>添加分镜
              </el-button>
            </div>
          </div>
          <div v-if="storyboards.length === 0" class="empty-tip">暂无分镜，点击「生成分镜」或「添加分镜」开始创作</div>
          <div v-else class="storyboard-list">
            <div v-for="(sb, index) in storyboards" :key="sb.id" class="storyboard-item">
              <div class="storyboard-number">{{ index + 1 }}</div>
              <div class="storyboard-content">
                <el-input v-model="sb.title" placeholder="分镜标题" size="small" @blur="updateStoryboard(sb)" />
                <el-input v-model="sb.description" type="textarea" :rows="2" placeholder="分镜描述" size="small" @blur="updateStoryboard(sb)" />
                <div class="storyboard-prompts">
                  <el-input v-model="sb.image_prompt" placeholder="图像提示词" size="small" @blur="updateStoryboard(sb)">
                    <template #append>
                      <el-button size="small" :loading="generatingImageId === sb.id" @click="generateImage(sb)">生成图</el-button>
                    </template>
                  </el-input>
                  <el-input v-model="sb.video_prompt" placeholder="视频提示词" size="small" @blur="updateStoryboard(sb)">
                    <template #append>
                      <el-button size="small" :loading="generatingVideoId === sb.id" @click="generateVideo(sb)">生成视频</el-button>
                    </template>
                  </el-input>
                </div>
              </div>
              <div class="storyboard-actions">
                <el-button size="small" type="danger" plain circle :icon="Delete" @click="deleteStoryboard(sb.id)" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, VideoPlay, Plus, Delete, Sunny, Moon } from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme'
import { useFilmStore } from '@/stores/film'
import { dramaAPI } from '@/api/drama'
import { storyboardAPI } from '@/api/storyboards'

const route = useRoute()
const router = useRouter()
const { isDark, toggle: toggleTheme } = useTheme()
const filmStore = useFilmStore()
const dramaId = Number(route.params.id)

const loading = ref(false)
const drama = ref(null)
const episodes = ref([])
const selectedEpisodeId = ref(null)
const scriptContent = ref('')
const storyboards = ref([])
const generating = ref(false)
const generatingImageId = ref(null)
const generatingVideoId = ref(null)

function formatStyle(style) {
  const map = {
    realistic: '写实', cinematic: '电影感', documentary: '纪录片', noir: '黑色电影',
    'retro film': '复古胶片', horror: '恐怖', 'anime style': '日本动漫', anime: '日本动漫',
    'comic style': '欧美漫画', cartoon: '卡通', 'ink wash': '国画水墨',
    'chinese style': '中国风', historical: '古装', wuxia: '武侠',
    watercolor: '水彩', 'oil painting': '油画', sketch: '素描',
    'woodblock print': '版画', impressionist: '印象派', fantasy: '奇幻',
    'dark fantasy': '暗黑奇幻', 'sci-fi': '科幻', sci_fi: '科幻',
    cyberpunk: '赛博朋克', steampunk: '蒸汽朋克', 'post-apocalyptic': '末世废土',
    '3d render': '3D渲染', 'pixel art': '像素风', 'low poly': '低多边形',
    minimalist: '极简', dreamy: '唯美梦幻'
  }
  return map[style] || style || '-'
}

async function loadDrama() {
  loading.value = true
  try {
    const d = await dramaAPI.get(dramaId)
    drama.value = d
    episodes.value = d.episodes || []
    filmStore.setDrama(d)
    if (episodes.value.length > 0) {
      const epId = route.query.episode ? Number(route.query.episode) : episodes.value[0].id
      selectedEpisodeId.value = epId
      await loadEpisode(epId)
    }
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function loadEpisode(epId) {
  const ep = episodes.value.find(e => e.id === epId)
  if (ep) {
    filmStore.setCurrentEpisode(ep)
    scriptContent.value = ep.script_content || ''
    await loadStoryboards(epId)
  }
}

async function loadStoryboards(epId) {
  try {
    const list = await dramaAPI.getStoryboards(epId)
    storyboards.value = list || []
  } catch (e) {
    storyboards.value = []
  }
}

function onEpisodeChange(epId) {
  loadEpisode(epId)
}

async function saveScript() {
  if (!selectedEpisodeId.value) return
  try {
    const updated = episodes.value.map(ep => ({
      episode_number: ep.episode_number ?? 0,
      title: ep.title || '',
      script_content: ep.id === selectedEpisodeId.value ? scriptContent.value : (ep.script_content || ''),
      description: ep.description ?? null,
      duration: ep.duration ?? 0
    }))
    await dramaAPI.saveEpisodes(dramaId, updated)
  } catch (e) {
    console.error('save script failed', e)
  }
}

async function generateStoryboard() {
  if (!selectedEpisodeId.value) {
    ElMessage.warning('请先选择分集')
    return
  }
  generating.value = true
  try {
    await dramaAPI.generateStoryboard(selectedEpisodeId.value, {
      model: drama.value?.metadata?.llm_model || 'gpt-4o',
      style: drama.value?.style || 'realistic',
      prompt: scriptContent.value
    })
    ElMessage.success('分镜生成任务已提交')
    await loadStoryboards(selectedEpisodeId.value)
  } catch (e) {
    ElMessage.error(e.message || '生成失败')
  } finally {
    generating.value = false
  }
}

async function addStoryboard() {
  if (!selectedEpisodeId.value) {
    ElMessage.warning('请先选择分集')
    return
  }
  try {
    await storyboardAPI.create(selectedEpisodeId.value, {
      title: '新分镜',
      description: '',
      image_prompt: '',
      video_prompt: ''
    })
    await loadStoryboards(selectedEpisodeId.value)
    ElMessage.success('分镜已添加')
  } catch (e) {
    ElMessage.error(e.message || '添加失败')
  }
}

async function updateStoryboard(sb) {
  try {
    await storyboardAPI.update(sb.id, {
      title: sb.title,
      description: sb.description,
      image_prompt: sb.image_prompt,
      video_prompt: sb.video_prompt
    })
  } catch (e) {
    console.error('update storyboard failed', e)
  }
}

async function deleteStoryboard(id) {
  try {
    await storyboardAPI.delete(id)
    await loadStoryboards(selectedEpisodeId.value)
    ElMessage.success('分镜已删除')
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

async function generateImage(sb) {
  generatingImageId.value = sb.id
  try {
    await storyboardAPI.generateImage(sb.id, { prompt: sb.image_prompt })
    ElMessage.success('图片生成任务已提交')
  } catch (e) {
    ElMessage.error(e.message || '生成失败')
  } finally {
    generatingImageId.value = null
  }
}

async function generateVideo(sb) {
  generatingVideoId.value = sb.id
  try {
    await storyboardAPI.generateVideo(sb.id, { prompt: sb.video_prompt })
    ElMessage.success('视频生成任务已提交')
  } catch (e) {
    ElMessage.error(e.message || '生成失败')
  } finally {
    generatingVideoId.value = null
  }
}

onMounted(() => { loadDrama() })
</script>

<style scoped>
.film-create { min-height: 100vh; background: #0f0f12; color: #e4e4e7; }
.header { background: rgba(18, 18, 22, 0.82); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(139, 92, 246, 0.18); padding: 12px 24px; position: sticky; top: 0; z-index: 100; }
.header-inner { max-width: min(1400px, 96vw); margin: 0 auto; display: flex; align-items: center; gap: 16px; }
.logo { margin: 0; cursor: pointer; display: flex; flex-direction: column; gap: 1px; line-height: 1; }
.logo-main { font-size: 1.1rem; font-weight: 700; background: linear-gradient(135deg, #c4b5fd 0%, #818cf8 50%, #a78bfa 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.logo-sub { font-size: 0.68rem; color: #6d6d7a; -webkit-text-fill-color: #6d6d7a; }
.breadcrumb-sep { color: #3f3f46; font-size: 1rem; font-weight: 300; }
.page-title { font-size: 0.88rem; font-weight: 500; color: #a1a1aa; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 3px 10px; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.btn-back-list { flex-shrink: 0; }
.header-actions { margin-left: auto; display: flex; gap: 8px; }
.main { max-width: min(1400px, 96vw); margin: 0 auto; padding: 24px 16px 48px; }
.create-layout { display: flex; gap: 20px; }
.sidebar { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px; }
.sidebar-section { background: rgba(24, 24, 27, 0.75); border: 1px solid rgba(63, 63, 70, 0.7); border-radius: 12px; padding: 16px; }
.sidebar-title { font-size: 0.9rem; font-weight: 600; color: #fafafa; margin-bottom: 12px; }
.sidebar-info { display: flex; flex-direction: column; gap: 8px; }
.sidebar-info-item { display: flex; justify-content: space-between; font-size: 0.85rem; }
.sidebar-info-label { color: #71717a; }
.sidebar-info-value { color: #e4e4e7; }
.content { flex: 1; background: rgba(24, 24, 27, 0.75); border: 1px solid rgba(63, 63, 70, 0.7); border-radius: 12px; padding: 20px; }
.content-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.content-title { font-size: 1rem; font-weight: 600; color: #fafafa; }
.empty-tip { color: #71717a; text-align: center; padding: 32px; }
.storyboard-list { display: flex; flex-direction: column; gap: 12px; }
.storyboard-item { display: flex; gap: 12px; background: rgba(28, 28, 30, 0.8); border: 1px solid rgba(63, 63, 70, 0.6); border-radius: 10px; padding: 12px; }
.storyboard-number { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: rgba(99, 102, 241, 0.2); border-radius: 6px; font-size: 0.8rem; font-weight: 600; color: #a5b4fc; flex-shrink: 0; }
.storyboard-content { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.storyboard-prompts { display: flex; flex-direction: column; gap: 6px; }
.storyboard-actions { display: flex; align-items: flex-start; }
.btn-theme { --el-button-bg-color: rgba(148,163,184,0.1); --el-button-border-color: rgba(148,163,184,0.3); --el-button-text-color: #94a3b8; --el-button-hover-bg-color: rgba(148,163,184,0.2); --el-button-hover-border-color: rgba(148,163,184,0.5); --el-button-hover-text-color: #cbd5e1; }
</style>
