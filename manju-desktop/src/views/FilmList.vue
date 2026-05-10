<template>
  <div class="film-list">
    <header class="header">
      <div class="header-inner">
        <h1 class="logo">
          <span class="logo-main">漫剧生成</span>
          <span class="logo-sub">manju desktop</span>
        </h1>
        <div class="header-library">
          <el-button class="btn-library" @click="showCharLibrary = true">
            <el-icon><User /></el-icon>素材角色
          </el-button>
          <el-button class="btn-library" @click="showSceneLibrary = true">
            <el-icon><PictureFilled /></el-icon>素材场景
          </el-button>
          <el-button class="btn-library" @click="showPropLibrary = true">
            <el-icon><Box /></el-icon>素材道具
          </el-button>
        </div>
        <div class="header-actions">
          <el-button class="btn-theme" :title="isDark ? '切换到浅色模式' : '切换到暗色模式'" @click="toggleTheme">
            <el-icon><Sunny v-if="isDark" /><Moon v-else /></el-icon>
            {{ isDark ? '浅色' : '暗色' }}
          </el-button>
          <el-button class="btn-settings" @click="showAiConfigDialog = true">
            <el-icon><Setting /></el-icon>AI配置
          </el-button>
          <el-button class="btn-settings" @click="router.push('/settings')">
            <el-icon><Setting /></el-icon>设置
          </el-button>
          <el-button class="btn-import" :loading="importing" @click="triggerImport">
            <el-icon><Upload /></el-icon>导入项目
          </el-button>
          <input ref="importFileInput" type="file" accept=".zip" style="display:none" @change="onImportFile" />
          <el-button type="primary" class="btn-new" @click="goNewProject">
            <el-icon><Plus /></el-icon>新建项目
          </el-button>
        </div>
      </div>
    </header>

    <main class="main">
      <div v-loading="loading" class="projects-wrap">
        <div class="project-grid">
          <div class="project-card action-card">
            <div class="action-card-inner">
              <h3 class="action-card-title">快速开始</h3>
              <div class="action-card-buttons">
                <el-button type="primary" size="large" class="action-btn action-btn-new" @click="goNewProject">
                  <el-icon><Plus /></el-icon>新建短剧项目
                </el-button>
                <el-button size="large" class="action-btn action-btn-import" :loading="importing" @click="triggerImport">
                  <el-icon><Upload /></el-icon>导入短剧项目
                </el-button>
              </div>
            </div>
          </div>
          <div
            v-for="d in dramas"
            :key="d.id"
            class="project-card"
            @click="openProject(d.id)"
          >
            <div class="project-card-actions" @click.stop>
              <el-button size="small" circle :icon="Download" title="导出项目" :loading="exportingId === d.id" @click="onExport(d)" />
              <el-button size="small" circle :icon="Edit" title="编辑" @click="openEditDialog(d)" />
              <el-button size="small" type="danger" plain circle :icon="Delete" title="删除" @click="onDelete(d)" />
            </div>
            <div class="project-card-body">
              <h3 class="project-title">{{ d.title || '未命名项目' }}</h3>
              <p class="project-desc">{{ d.description || '暂无描述' }}</p>
              <div class="project-badges">
                <span class="badge badge-status" :class="'badge-status--' + (d.status || 'draft')">{{ formatStatus(d.status) }}</span>
                <span v-if="d.episodes?.length" class="badge badge-episodes">{{ d.episodes.length }} 集</span>
                <span v-if="totalStoryboards(d) > 0" class="badge badge-storyboards">{{ totalStoryboards(d) }} 分镜</span>
                <span v-if="d.metadata?.aspect_ratio" class="badge badge-ratio">{{ d.metadata.aspect_ratio }}</span>
                <span v-if="d.style" class="badge badge-style">{{ formatStyle(d.style) }}</span>
                <span v-if="d.genre" class="badge badge-genre">{{ formatGenre(d.genre) }}</span>
              </div>
              <p class="project-meta">{{ formatDate(d.updated_at) }}</p>
            </div>
          </div>
        </div>
      </div>
    </main>

    <el-dialog v-model="showNewDialog" title="新建项目" width="480px" :close-on-click-modal="false" @closed="resetNewForm">
      <el-form :model="newForm" label-width="80px" label-position="top">
        <el-form-item label="标题" required>
          <el-input v-model="newForm.title" placeholder="输入项目标题" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="newForm.description" type="textarea" :rows="3" placeholder="输入项目描述（选填）" />
        </el-form-item>
        <el-form-item label="画面比例">
          <el-select v-model="newForm.aspect_ratio" style="width: 100%">
            <el-option label="16:9 横屏（默认）" value="16:9" />
            <el-option label="9:16 竖屏（短视频）" value="9:16" />
            <el-option label="3:4 竖版" value="3:4" />
            <el-option label="1:1 方形" value="1:1" />
            <el-option label="4:3 传统横屏" value="4:3" />
            <el-option label="21:9 宽银幕" value="21:9" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showNewDialog = false">取消</el-button>
        <el-button type="primary" :loading="newSaving" :disabled="!newForm.title?.trim()" @click="submitNew">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showAiConfigDialog" title="AI 配置" width="90%" destroy-on-close>
      <AIConfigContent v-if="showAiConfigDialog" />
    </el-dialog>

    <el-dialog v-model="showEditDialog" title="编辑项目" width="480px" :close-on-click-modal="false" @closed="resetEditForm">
      <el-form :model="editForm" label-width="80px" label-position="top">
        <el-form-item label="标题" required>
          <el-input v-model="editForm.title" placeholder="输入项目标题" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="故事">
          <el-input v-model="editForm.description" type="textarea" :rows="3" placeholder="输入故事梗概（选填）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" :disabled="!editForm.title?.trim()" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit, Delete, Setting, Plus, User, PictureFilled, Box, Sunny, Moon, Download, Upload } from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme'
import { dramaAPI } from '@/api/drama'
import AIConfigContent from '@/components/AIConfigContent.vue'

const router = useRouter()
const { isDark, toggle: toggleTheme } = useTheme()

const loading = ref(false)
const dramas = ref([])
const total = ref(0)

const showAiConfigDialog = ref(false)
const showNewDialog = ref(false)
const newForm = ref({ title: '', description: '', aspect_ratio: '16:9' })
const newSaving = ref(false)
const exportingId = ref(null)
const importing = ref(false)
const importFileInput = ref(null)

const showEditDialog = ref(false)
const editForm = ref({ id: null, title: '', description: '' })
const editSaving = ref(false)

function loadList() {
  loading.value = true
  dramaAPI.list({ page: 1, page_size: 50 })
    .then((res) => {
      dramas.value = res?.items ?? []
      total.value = res?.pagination?.total ?? 0
    })
    .catch(() => { dramas.value = [] })
    .finally(() => { loading.value = false })
}

function formatDate(val) {
  if (!val) return ''
  const d = new Date(val)
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatStatus(status) {
  const map = { draft: '草稿', published: '已发布', archived: '已归档', generating: '生成中' }
  return map[status] || status || '草稿'
}

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
  return map[style] || style
}

function formatGenre(genre) {
  const map = { drama: '剧情', comedy: '喜剧', adventure: '冒险', romance: '爱情', thriller: '悬疑', action: '动作', horror: '恐怖' }
  return map[genre] || genre
}

function totalStoryboards(d) {
  return (d.episodes || []).reduce((sum, ep) => sum + (ep.storyboards?.length || 0), 0)
}

function goNewProject() { showNewDialog.value = true }
function resetNewForm() { newForm.value = { title: '', description: '', aspect_ratio: '16:9' } }

async function submitNew() {
  const title = newForm.value.title?.trim()
  if (!title) return
  newSaving.value = true
  try {
    const drama = await dramaAPI.create({ title, description: newForm.value.description?.trim() || undefined, metadata: { aspect_ratio: newForm.value.aspect_ratio || '16:9' } })
    showNewDialog.value = false
    ElMessage.success('项目已创建')
    loadList()
    router.push('/drama/' + drama.id)
  } catch (e) {
    ElMessage.error(e.message || '创建失败')
  } finally {
    newSaving.value = false
  }
}

function openEditDialog(d) {
  editForm.value = { id: d.id, title: d.title || '', description: d.description || '' }
  showEditDialog.value = true
}
function resetEditForm() { editForm.value = { id: null, title: '', description: '' } }

async function submitEdit() {
  const title = editForm.value.title?.trim()
  if (!title || editForm.value.id == null) return
  editSaving.value = true
  try {
    await dramaAPI.update(editForm.value.id, { title, description: editForm.value.description?.trim() || undefined })
    showEditDialog.value = false
    ElMessage.success('已保存')
    loadList()
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    editSaving.value = false
  }
}

function openProject(id) { router.push('/drama/' + id) }

async function onExport(d) {
  if (exportingId.value) return
  exportingId.value = d.id
  try {
    const blob = await dramaAPI.exportDrama(d.id)
    const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type: 'application/zip' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${d.title || 'drama'}.zip`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (e) {
    ElMessage.error(e.message || '导出失败')
  } finally {
    exportingId.value = null
  }
}

function triggerImport() { importFileInput.value?.click() }

async function onImportFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = ''
  if (!file.name.endsWith('.zip')) {
    ElMessage.error('请选择 .zip 格式的文件')
    return
  }
  importing.value = true
  try {
    const data = await dramaAPI.importDrama(file)
    ElMessage.success(`导入成功：${data?.title || '项目'}`)
    loadList()
  } catch (e) {
    const msg = e.response?.data?.message || e.message || '导入失败'
    ElMessage.error(msg)
  } finally {
    importing.value = false
  }
}

async function onDelete(d) {
  try {
    await ElMessageBox.confirm(
      `确定要删除项目「${(d.title || '未命名').slice(0, 20)}${(d.title && d.title.length > 20) ? '…' : ''}」吗？此操作不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch { return }
  try {
    await dramaAPI.delete(d.id)
    ElMessage.success('已删除')
    loadList()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

onMounted(() => { loadList() })
</script>

<style scoped>
.film-list {
  min-height: 100vh;
  background: #08080d;
  color: #e4e4e7;
  background-image:
    radial-gradient(ellipse 70% 45% at 50% -10%, rgba(99, 102, 241, 0.18) 0%, transparent 70%),
    radial-gradient(ellipse 50% 35% at 85% 55%, rgba(139, 92, 246, 0.1) 0%, transparent 60%),
    radial-gradient(ellipse 40% 30% at 10% 80%, rgba(79, 70, 229, 0.08) 0%, transparent 60%);
}
.header {
  background: rgba(12, 12, 18, 0.82);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(99, 102, 241, 0.18);
  padding: 12px 24px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 1px 0 rgba(99, 102, 241, 0.08), 0 4px 24px rgba(0, 0, 0, 0.3);
}
.header-inner {
  max-width: min(1400px, 96vw);
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
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
  letter-spacing: -0.01em;
  background: linear-gradient(135deg, #a5b4fc 0%, #c084fc 50%, #f0abfc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 10px rgba(168, 85, 247, 0.35));
}
.logo-sub {
  font-size: 0.68rem;
  font-weight: 400;
  letter-spacing: 0.02em;
  color: #6d6d7a;
  -webkit-text-fill-color: #6d6d7a;
}
.header-library {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 20px;
}
.header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-library {
  --el-button-bg-color: rgba(99, 102, 241, 0.12);
  --el-button-border-color: rgba(99, 102, 241, 0.35);
  --el-button-text-color: #a5b4fc;
  --el-button-hover-bg-color: rgba(99, 102, 241, 0.22);
  --el-button-hover-border-color: rgba(99, 102, 241, 0.55);
  --el-button-hover-text-color: #c7d2fe;
}
.btn-theme {
  --el-button-bg-color: rgba(148, 163, 184, 0.1);
  --el-button-border-color: rgba(148, 163, 184, 0.3);
  --el-button-text-color: #94a3b8;
  --el-button-hover-bg-color: rgba(148, 163, 184, 0.2);
  --el-button-hover-border-color: rgba(148, 163, 184, 0.5);
  --el-button-hover-text-color: #cbd5e1;
}
.btn-settings {
  --el-button-bg-color: rgba(234, 179, 8, 0.1);
  --el-button-border-color: rgba(234, 179, 8, 0.32);
  --el-button-text-color: #fcd34d;
  --el-button-hover-bg-color: rgba(234, 179, 8, 0.2);
  --el-button-hover-border-color: rgba(234, 179, 8, 0.5);
  --el-button-hover-text-color: #fde68a;
}
.main {
  max-width: min(1400px, 96vw);
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 18px;
}
.project-card {
  position: relative;
  background: rgba(24, 24, 30, 0.75);
  border: 1px solid rgba(63, 63, 70, 0.6);
  border-radius: 14px;
  padding: 20px;
  cursor: pointer;
  transition: border-color 0.25s, background 0.25s, transform 0.25s, box-shadow 0.25s;
  overflow: hidden;
}
.project-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.04) 0%, transparent 60%);
  pointer-events: none;
}
.project-card:hover {
  border-color: rgba(99, 102, 241, 0.55);
  background: rgba(28, 28, 36, 0.9);
  transform: translateY(-3px);
  box-shadow: 0 12px 40px rgba(99, 102, 241, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.1), 0 2px 8px rgba(0, 0, 0, 0.4);
}
.action-card {
  cursor: default;
  border-style: dashed;
  border-color: rgba(99, 102, 241, 0.4);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.06) 0%, rgba(139, 92, 246, 0.04) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}
.action-card:hover {
  border-color: rgba(99, 102, 241, 0.65);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.07) 100%);
  transform: translateY(-2px);
}
.action-card::before { display: none; }
.action-card-inner {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.action-card-title {
  font-size: 1rem;
  font-weight: 600;
  color: #a5b4fc;
  margin: 0;
}
.action-card-buttons {
  display: flex;
  gap: 12px;
  width: 100%;
  justify-content: center;
}
.action-btn { min-width: 150px; }
.project-card-body { padding-right: 56px; }
.project-title {
  font-size: 1.05rem;
  margin: 0 0 8px;
  color: #fafafa;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.project-desc {
  font-size: 0.875rem;
  color: #a1a1aa;
  margin: 0 0 12px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.project-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 10px;
}
.badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 99px;
  font-weight: 500;
  line-height: 1.5;
  white-space: nowrap;
}
.badge-status--draft { background: rgba(113, 113, 122, 0.15); color: #a1a1aa; border: 1px solid rgba(113, 113, 122, 0.3); }
.badge-status--published { background: rgba(34, 197, 94, 0.12); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
.badge-status--generating { background: rgba(234, 179, 8, 0.12); color: #fcd34d; border: 1px solid rgba(234, 179, 8, 0.3); }
.badge-episodes { background: rgba(14, 165, 233, 0.12); color: #38bdf8; border: 1px solid rgba(14, 165, 233, 0.28); }
.badge-storyboards { background: rgba(20, 184, 166, 0.12); color: #2dd4bf; border: 1px solid rgba(20, 184, 166, 0.28); }
.badge-ratio { background: rgba(251, 146, 60, 0.1); color: #fb923c; border: 1px solid rgba(251, 146, 60, 0.25); font-family: monospace; }
.badge-style { background: rgba(168, 85, 247, 0.1); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.25); }
.badge-genre { background: rgba(249, 115, 22, 0.1); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.25); }
.project-meta { font-size: 0.75rem; color: #71717a; margin: 0; }
.project-card-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 6px;
}

html.light .film-list {
  background: #f5f3ff;
  color: #1e1b4b;
}
html.light .header {
  background: rgba(248, 246, 255, 0.88);
  border-bottom-color: rgba(99, 102, 241, 0.2);
}
html.light .project-card {
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(199, 210, 254, 0.8);
}
html.light .project-title { color: #1e1b4b; }
html.light .project-desc { color: #4b5563; }
</style>
