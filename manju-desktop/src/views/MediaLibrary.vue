<template>
  <div class="media-library">
    <header class="header">
      <div class="header-inner">
        <h1 class="logo" @click="router.push('/')">
          <span class="logo-main">漫剧生成</span>
          <span class="logo-sub">manju desktop</span>
        </h1>
        <span class="breadcrumb-sep">›</span>
        <span class="page-title">媒体素材库</span>
        <div class="header-actions">
          <el-button @click="router.push('/')">返回列表</el-button>
        </div>
      </div>
    </header>
    <main class="main">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="角色素材" name="characters">
          <div class="library-section">
            <div class="library-toolbar">
              <el-input v-model="charSearch" placeholder="搜索角色" style="width: 240px" />
              <el-button type="primary" @click="showAddChar = true">添加角色</el-button>
            </div>
            <div v-if="characters.length === 0" class="empty-tip">暂无角色素材</div>
            <div v-else class="library-grid">
              <div v-for="item in characters" :key="item.id" class="library-card">
                <div class="library-card-image">
                  <img v-if="item.image_url || item.local_path" :src="item.image_url || '/static/' + item.local_path" />
                  <div v-else class="library-card-placeholder">暂无图片</div>
                </div>
                <div class="library-card-info">
                  <div class="library-card-name">{{ item.name }}</div>
                  <div class="library-card-desc">{{ item.description || '暂无描述' }}</div>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="场景素材" name="scenes">
          <div class="library-section">
            <div class="library-toolbar">
              <el-input v-model="sceneSearch" placeholder="搜索场景" style="width: 240px" />
              <el-button type="primary" @click="showAddScene = true">添加场景</el-button>
            </div>
            <div v-if="scenes.length === 0" class="empty-tip">暂无场景素材</div>
            <div v-else class="library-grid">
              <div v-for="item in scenes" :key="item.id" class="library-card">
                <div class="library-card-image">
                  <img v-if="item.image_url || item.local_path" :src="item.image_url || '/static/' + item.local_path" />
                  <div v-else class="library-card-placeholder">暂无图片</div>
                </div>
                <div class="library-card-info">
                  <div class="library-card-name">{{ item.location }}</div>
                  <div class="library-card-desc">{{ item.description || '暂无描述' }}</div>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="道具素材" name="props">
          <div class="library-section">
            <div class="library-toolbar">
              <el-input v-model="propSearch" placeholder="搜索道具" style="width: 240px" />
              <el-button type="primary" @click="showAddProp = true">添加道具</el-button>
            </div>
            <div v-if="props.length === 0" class="empty-tip">暂无道具素材</div>
            <div v-else class="library-grid">
              <div v-for="item in props" :key="item.id" class="library-card">
                <div class="library-card-image">
                  <img v-if="item.image_url || item.local_path" :src="item.image_url || '/static/' + item.local_path" />
                  <div v-else class="library-card-placeholder">暂无图片</div>
                </div>
                <div class="library-card-info">
                  <div class="library-card-name">{{ item.name }}</div>
                  <div class="library-card-desc">{{ item.description || '暂无描述' }}</div>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { characterLibraryAPI } from '@/api/characterLibrary'
import { sceneLibraryAPI } from '@/api/sceneLibrary'
import { propLibraryAPI } from '@/api/propLibrary'

const router = useRouter()
const activeTab = ref('characters')
const characters = ref([])
const scenes = ref([])
const props = ref([])
const charSearch = ref('')
const sceneSearch = ref('')
const propSearch = ref('')
const showAddChar = ref(false)
const showAddScene = ref(false)
const showAddProp = ref(false)

async function loadCharacters() {
  try {
    const res = await characterLibraryAPI.list({ keyword: charSearch.value, page: 1, page_size: 50 })
    characters.value = res?.items || []
  } catch (e) { characters.value = [] }
}

async function loadScenes() {
  try {
    const res = await sceneLibraryAPI.list({ keyword: sceneSearch.value, page: 1, page_size: 50 })
    scenes.value = res?.items || []
  } catch (e) { scenes.value = [] }
}

async function loadProps() {
  try {
    const res = await propLibraryAPI.list({ keyword: propSearch.value, page: 1, page_size: 50 })
    props.value = res?.items || []
  } catch (e) { props.value = [] }
}

onMounted(() => {
  loadCharacters()
  loadScenes()
  loadProps()
})
</script>

<style scoped>
.media-library { min-height: 100vh; background: #0f0f12; color: #e4e4e7; }
.header { background: rgba(18, 18, 22, 0.82); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(139, 92, 246, 0.18); padding: 12px 24px; }
.header-inner { max-width: min(1200px, 96vw); margin: 0 auto; display: flex; align-items: center; gap: 16px; }
.logo { margin: 0; cursor: pointer; display: flex; flex-direction: column; gap: 1px; line-height: 1; }
.logo-main { font-size: 1.1rem; font-weight: 700; background: linear-gradient(135deg, #c4b5fd 0%, #818cf8 50%, #a78bfa 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.logo-sub { font-size: 0.68rem; color: #6d6d7a; -webkit-text-fill-color: #6d6d7a; }
.breadcrumb-sep { color: #3f3f46; font-size: 1rem; font-weight: 300; }
.page-title { font-size: 0.88rem; font-weight: 500; color: #a1a1aa; }
.header-actions { margin-left: auto; }
.main { max-width: min(1200px, 96vw); margin: 0 auto; padding: 24px 16px 48px; }
.library-section { display: flex; flex-direction: column; gap: 16px; }
.library-toolbar { display: flex; gap: 12px; }
.empty-tip { color: #71717a; text-align: center; padding: 32px; }
.library-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.library-card { background: rgba(28, 28, 30, 0.8); border: 1px solid rgba(63, 63, 70, 0.6); border-radius: 10px; overflow: hidden; }
.library-card-image { aspect-ratio: 1; background: #18181b; display: flex; align-items: center; justify-content: center; }
.library-card-image img { width: 100%; height: 100%; object-fit: cover; }
.library-card-placeholder { color: #52525b; font-size: 0.8rem; }
.library-card-info { padding: 10px; }
.library-card-name { font-weight: 500; color: #fafafa; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.library-card-desc { color: #71717a; font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
</style>
