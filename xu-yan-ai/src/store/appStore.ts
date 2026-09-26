import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { 
  PromptPreset, 
  ThemeMode, 
  GenerationState, 
  AppSettings, 
  HistoryRecord,
  WorkItem,
  WorkType,
  ExcelRowData,
  ExcelImportResult,
  TaskFolder,
  ApiProvider,
  ApiConfigs,
  RunningHubApiMapping,
  LipSyncState,
  VoiceItemState,
  VoiceCharacter,
  VoiceCharacterStorage,
  User,
  SubjectMaterial,
  Seedance2Data,
} from '../types'
import { DEFAULT_API_CONFIGS as defaultApiConfigs, DEFAULT_RUNNINGHUB_MAPPINGS } from '../types'
import { taskQueueManager } from '../services/taskQueueManager'
import type { TaskQueueState } from '../services/taskQueueManager'
import { projectStorageService, type ProjectData } from '../services/projectStorageService'
import { isSoftwareActivated as checkSoftwareActivation } from '../utils/licenseUtils'

interface AppState {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void

  user: User | null
  setUser: (user: User | null) => void
  isLoggedIn: () => boolean
  hasRemainingDays: () => boolean
  isSoftwareActivated: () => Promise<boolean>
  canUseSoftware: () => Promise<boolean>
  refreshUserInfo: () => Promise<void>

  workItems: WorkItem[]
  activeWorkId: string | null
  initialized: boolean
  
  initDefaultItems: () => void
  addWorkItemAfter: (afterId: string, type: WorkType) => void
  removeWorkItem: (id: string) => void
  setActiveWorkId: (id: string | null) => void
  updateWorkItem: (id: string, updates: Partial<WorkItem>) => void
  batchUpdateWorkItems: (updates: Array<{ id: string; updates: Partial<WorkItem> }>) => void
  clearWorkItems: () => void
  importFromExcel: (result: ExcelImportResult) => void
  importFromShots: (result: { data: Partial<ExcelRowData>[]; totalRows: number; replace?: boolean }) => void
  linkImageToVideoFirstFrame: (shotNumber: number | string, imageUrl: string) => void
  addReferenceImagesToShot: (shotNumber: number | string, images: Array<{ preview: string; name: string }>, type: WorkType) => void
  ensureDefaultMappings: () => void
  setGeneratedImageForShot: (shotNumber: number | string, imageUrl: string, fileName: string, thumbnailUrl?: string) => void

  presets: PromptPreset[]
  addPreset: (preset: PromptPreset) => void
  removePreset: (id: string) => void

  settings: AppSettings
  updateSettings: (settings: Partial<AppSettings>) => void

  history: HistoryRecord[]
  addToHistory: (record: HistoryRecord) => void
  clearHistory: () => void

  tasks: TaskFolder[]
  activeTask: TaskFolder | null
  addTask: (task: TaskFolder) => void
  removeTask: (path: string) => void
  renameTask: (oldPath: string, newName: string, newPath: string) => void
  setActiveTask: (task: TaskFolder | null, options?: { skipSave?: boolean }) => void
  scanAndLoadProjects: (savePath: string) => Promise<{ added: number; total: number }>
  
  saveCurrentProject: () => Promise<boolean>
  saveProjectImmediately: () => Promise<boolean>
  loadProjectData: (projectPath: string) => Promise<ProjectData | null>
  restoreProjectData: (data: ProjectData) => void
  lastActiveMode: 'image' | 'video' | 'lipsync' | 'voice' | 'seedance2'
  setLastActiveMode: (mode: 'image' | 'video' | 'lipsync' | 'voice' | 'seedance2') => void

  globalPrompt: string
  setGlobalPrompt: (prompt: string) => void

  imageApiProvider: ApiProvider
  setImageApiProvider: (provider: ApiProvider) => void
  videoApiProvider: ApiProvider
  setVideoApiProvider: (provider: ApiProvider) => void
  
  apiConfigs: ApiConfigs
  updateApiConfig: (provider: ApiProvider, config: Partial<ApiConfigs[ApiProvider]>) => void
  
  runningHubMappings: RunningHubApiMapping[]
  addRunningHubMapping: (mapping: RunningHubApiMapping) => void
  updateRunningHubMapping: (id: string, updates: Partial<RunningHubApiMapping>) => void
  removeRunningHubMapping: (id: string) => void
  
  runningHubImageMappingId: string | null
  setRunningHubImageMappingId: (id: string | null) => void
  runningHubVideoMappingId: string | null
  setRunningHubVideoMappingId: (id: string | null) => void
  runningHubViewAngleMappingId: string | null
  setRunningHubViewAngleMappingId: (id: string | null) => void
  runningHubText2ImageMappingId: string | null
  setRunningHubText2ImageMappingId: (id: string | null) => void

  taskQueueState: TaskQueueState
  updateTaskQueueState: (state: TaskQueueState) => void
  getQueueLength: () => number
  getActiveTaskCount: () => number

  lipSyncState: LipSyncState
  updateLipSyncState: (updates: Partial<LipSyncState>) => void
  resetLipSyncState: () => void

  amkApiKey: string
  setAmkApiKey: (key: string) => void

  favoriteVoiceIds: string[]
  toggleFavoriteVoice: (voiceId: string) => void

  voiceCharacters: VoiceCharacterStorage
  getVoiceCharactersForTask: (taskId: string) => VoiceCharacter[]
  addVoiceCharacter: (taskId: string, character: Omit<VoiceCharacter, 'id' | 'createdAt'>) => void
  updateVoiceCharacter: (taskId: string, characterId: string, updates: Partial<VoiceCharacter>) => void
  removeVoiceCharacter: (taskId: string, characterId: string) => void
  
  addVoiceWorkItemForCharacter: (characterId: string, characterName: string, voiceId: string) => void

  subjectMaterials: SubjectMaterial[]
  addSubjectMaterial: (material: SubjectMaterial) => void
  updateSubjectMaterial: (id: string, updates: Partial<SubjectMaterial>) => void
  removeSubjectMaterial: (id: string) => void
  getSubjectMaterialByProject: (projectId: string) => SubjectMaterial | undefined
  syncSubjectMaterials: () => Promise<void>

  seedance2Data: Seedance2Data
  updateSeedance2Data: (updates: Partial<Seedance2Data>) => void
  resetSeedance2Data: () => void

  resetGlobalState: () => void

  disableShotNavigator: boolean
  setDisableShotNavigator: (disable: boolean) => void

  toasts: Array<{ id: string; type: 'success' | 'error' | 'info' | 'warning'; title: string; message?: string; duration?: number; shotNumber?: string }>
  addToast: (toast: { type: 'success' | 'error' | 'info' | 'warning'; title: string; message?: string; duration?: number; shotNumber?: string }) => void
  removeToast: (id: string) => void

  eulaAccepted: boolean
  setEulaAccepted: (accepted: boolean) => void
}

const defaultPresets: PromptPreset[] = [

]

const defaultSettings: AppSettings = {
  theme: 'system',
  imageApiEndpoint: '',
  videoApiEndpoint: '',
  savePath: '',
  maxConcurrent: 2,
  quality: 'high',
  autoSave: true,
  promptFontSize: 14,
  analysisApi: 'yunwu',
  enhanceScene: 'short_series',
  compressReferenceImages: false,
  demoMode: false,
  demoScenario: 'recover',
}

const defaultSeedance2Data: Seedance2Data = {
  activeTab: 'novelToScript',
  novelText: '',
  scriptText: '',
  videoPrompts: [],
  videoItems: [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      prompt: '',
      materials: [],
      previewUrl: undefined,
      duration: 15
    }
  ],
  selectedProvider: 'runninghub-enterprise',
  selectedModel: 'seedance-2.0',
  customModelId: '',
  selectedAspectRatio: '9:16',
  selectedResolution: '720p',
  selectedQualityStyle: 'cg-anime',
  globalPrompt: '',
  generatedShotsCount: 0,
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

const defaultGenerationState: GenerationState = { status: 'idle', progress: 0, message: '' }

const defaultVoiceState: VoiceItemState = {
  text: '',
  voiceId: 'male-qn-qingse',
  speed: 1,
  volume: 1,
  pitch: 0,
  status: 'idle',
  progress: 0,
  message: '',
}

const createWorkItem = (type: WorkType, shotNumber: number | string, excelData?: ExcelRowData): WorkItem => {
  const getAspectRatio = (): '9:16' | '16:9' | '4:3' | '3:4' => {
    if (excelData?.resolution) {
      const res = excelData.resolution.toLowerCase()
      if (res.includes('16:9') || res.includes('1920x1080') || res.includes('1080p')) {
        return '16:9'
      }
      if (res.includes('9:16') || res.includes('1080x1920')) {
        return '9:16'
      }
      if (res.includes('4:3') || res.includes('3:4')) {
        return res.includes('3:4') ? '3:4' : '4:3'
      }
      if (excelData.videoWidth && excelData.videoHeight) {
        const ratio = excelData.videoWidth / excelData.videoHeight
        if (Math.abs(ratio - 4 / 3) < 0.1) return '4:3'
        if (Math.abs(ratio - 3 / 4) < 0.1) return '3:4'
        return excelData.videoWidth > excelData.videoHeight ? '16:9' : '9:16'
      }
    }
    return '9:16'
  }

  const basePrompt = type === 'image' 
    ? (excelData?.imagePrompt || '') 
    : (excelData?.videoPrompt || '')

  return {
    id: generateId(),
    type,
    shotNumber,
    excelData,
    prompt: basePrompt,
    referenceImages: [],
    firstFrame: undefined,
    lastFrame: undefined,
    generatedImage: null,
    generatedVideo: null,
    generatedAudio: null,
    generationState: { ...defaultGenerationState },
    resolution: '2k',
    aspectRatio: getAspectRatio(),
    duration: excelData?.duration || 5,
    voiceState: type === 'voice' ? { ...defaultVoiceState } : undefined,
  }
}

const parseShotNumber = (shotNum: number | string): number[] => {
  const str = String(shotNum)
  if (str.includes('-')) {
    return str.split('-').map(p => parseInt(p, 10) || 0)
  }
  return [parseInt(str, 10) || 1]
}

const shotNumberToString = (parts: number[]): string => {
  return parts.join('-')
}

const compareShotNumbers = (a: number | string, b: number | string): number => {
  const aParts = parseShotNumber(a)
  const bParts = parseShotNumber(b)
  
  const maxLen = Math.max(aParts.length, bParts.length)
  
  for (let i = 0; i < maxLen; i++) {
    const aVal = aParts[i] ?? 0
    const bVal = bParts[i] ?? 0
    if (aVal !== bVal) return aVal - bVal
  }
  
  return aParts.length - bParts.length
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),

      user: null,
      setUser: (user) => set({ user }),
      isLoggedIn: () => get().user !== null,
      hasRemainingDays: () => {
        const user = get().user
        return user !== null && user.remaining_days > 0
      },
      isSoftwareActivated: async () => {
        const user = get().user
        // 管理员无需激活
        if (user?.is_admin) return true
        return await checkSoftwareActivation()
      },
      canUseSoftware: async () => {
        const user = get().user
        // 管理员可以直接使用
        if (user?.is_admin) return true
        // 普通用户需要：已登录 + 有剩余天数 + 软件已激活
        if (!user) return false
        if (user.remaining_days <= 0) return false
        const activated = await checkSoftwareActivation()
        return activated
      },
      refreshUserInfo: async () => {
        const user = get().user
        if (!user?.account) return
        
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          const response = await invoke<{ success: boolean; message: string; user: User | null }>('tauri_refresh_user_info', { 
            account: user.account 
          })
          if (response.success && response.user) {
            // 保留原有的 password_hash，因为后端返回的 user 不包含它
            set({ user: { ...response.user, password_hash: user.password_hash } })
          }
        } catch (err) {
          console.error('刷新用户信息失败:', err)
        }
      },

      workItems: [],
      activeWorkId: null,
      initialized: false,

      initDefaultItems: () => {
        const state = get()
        if (state.initialized && state.workItems.length > 0) return
        
        const imageItem = createWorkItem('image', 1)
        const videoItem = createWorkItem('video', 1)
        const lipsyncItem = createWorkItem('lipsync', 1)
        const voiceItem = createWorkItem('voice', 1)
        voiceItem.voiceState = {
          text: '',
          voiceId: 'male-qn-qingse',
          speed: 1,
          volume: 1,
          pitch: 0,
          status: 'idle',
          progress: 0,
          message: '',
        }
        
        set({
          workItems: [imageItem, videoItem, lipsyncItem, voiceItem],
          activeWorkId: imageItem.id,
          initialized: true,
        })
      },

      addWorkItemAfter: (afterId, type) => {
        const state = get()
        const afterIndex = state.workItems.findIndex((item) => item.id === afterId)
        if (afterIndex === -1) return

        const afterItem = state.workItems[afterIndex]
        
        if (type === 'voice') {
          const voiceItems = state.workItems.filter(item => item.type === 'voice')
          const afterVoiceIndex = voiceItems.findIndex(item => item.id === afterId)
          
          let newShotNumber: number | string
          if (afterVoiceIndex === voiceItems.length - 1) {
            const maxShot = voiceItems.reduce((max, item) => {
              const shot = typeof item.shotNumber === 'number' ? item.shotNumber : parseInt(String(item.shotNumber), 10) || 0
              return shot > max ? shot : max
            }, 0)
            newShotNumber = maxShot + 1
          } else {
            newShotNumber = voiceItems.length + 1
          }
          
          // 创建所有类型的工作项
          const newImageItem = createWorkItem('image', newShotNumber)
          const newVideoItem = createWorkItem('video', newShotNumber)
          const newLipsyncItem = createWorkItem('lipsync', newShotNumber)
          const newVoiceItem = createWorkItem('voice', newShotNumber)
          newVoiceItem.voiceState = {
            text: '',
            voiceId: 'male-qn-qingse',
            speed: 1,
            volume: 1,
            pitch: 0,
            status: 'idle',
            progress: 0,
            message: '',
          }
          
          const newItems = [...state.workItems]
          newItems.splice(afterIndex + 1, 0, newImageItem, newVideoItem, newLipsyncItem, newVoiceItem)
          
          const sortedItems = newItems.sort((a, b) => {
            const typeOrder = (t: string) => {
              switch (t) {
                case 'image': return 0
                case 'video': return 1
                case 'lipsync': return 2
                case 'voice': return 3
                default: return 4
              }
            }
            const shotCompare = compareShotNumbers(a.shotNumber, b.shotNumber)
            if (shotCompare !== 0) return shotCompare
            return typeOrder(a.type) - typeOrder(b.type)
          })
          
          set({
            workItems: sortedItems,
            activeWorkId: newVoiceItem.id,
          })
          return
        }

        const currentParts = parseShotNumber(afterItem.shotNumber)

        const typeItems = state.workItems.filter(item => item.type === type)
        const afterTypeIndex = typeItems.findIndex(item => item.id === afterId)

        let newParts: number[]

        const nextTypeItem = typeItems[afterTypeIndex + 1]

        if (!nextTypeItem) {
          const sameLevelNext = [...currentParts]
          sameLevelNext[sameLevelNext.length - 1]++
          
          let hasConflict = false
          for (const item of typeItems) {
            const itemParts = parseShotNumber(item.shotNumber)
            if (compareShotNumbers(shotNumberToString(sameLevelNext), shotNumberToString(itemParts)) === 0) {
              hasConflict = true
              break
            }
          }
          
          if (hasConflict) {
            newParts = [...currentParts, 1]
          } else {
            newParts = sameLevelNext
          }
        } else {
          const nextParts = parseShotNumber(nextTypeItem.shotNumber)
          
          const isNextConsecutive = 
            nextParts.length === currentParts.length &&
            nextParts.length === 1 &&
            nextParts[0] === currentParts[0] + 1
          
          const isNextSameBase = 
            nextParts.length > currentParts.length &&
            nextParts.slice(0, currentParts.length).every((p, i) => p === currentParts[i])
          
          if (isNextConsecutive) {
            newParts = [...currentParts, 1]
          } else if (isNextSameBase) {
            const subItems: number[][] = []
            for (let i = afterTypeIndex + 1; i < typeItems.length; i++) {
              const itemParts = parseShotNumber(typeItems[i].shotNumber)
              if (itemParts.length > currentParts.length && 
                  itemParts.slice(0, currentParts.length).every((p, i) => p === currentParts[i])) {
                subItems.push(itemParts)
              } else {
                break
              }
            }
            
            const maxSubIndex = subItems.reduce((max, parts) => {
              const subIndex = parts[currentParts.length]
              return subIndex > max ? subIndex : max
            }, 0)
            
            newParts = [...currentParts, maxSubIndex + 1]
          } else {
            const sameLevelNext = [...currentParts]
            sameLevelNext[sameLevelNext.length - 1]++
            
            let hasConflict = false
            for (const item of typeItems) {
              const itemParts = parseShotNumber(item.shotNumber)
              if (compareShotNumbers(shotNumberToString(sameLevelNext), shotNumberToString(itemParts)) >= 0) {
                hasConflict = true
                break
              }
            }
            
            if (hasConflict) {
              newParts = [...currentParts, 1]
            } else {
              newParts = sameLevelNext
            }
          }
        }

        const newShotNumber = shotNumberToString(newParts)
        const insertIndex = afterIndex + 1
        const newItems = [...state.workItems]
        
        let newActiveId: string | null = null

        const newImageItem = createWorkItem('image', newShotNumber)
        const newVideoItem = createWorkItem('video', newShotNumber)
        const newLipsyncItem = createWorkItem('lipsync', newShotNumber)
        const newVoiceItem = createWorkItem('voice', newShotNumber)
        newVoiceItem.voiceState = {
          text: '',
          voiceId: 'male-qn-qingse',
          speed: 1,
          volume: 1,
          pitch: 0,
          status: 'idle',
          progress: 0,
          message: '',
        }

        // 如果从图生图镜头添加，复制源镜头的数据到新镜头
        if (type === 'image' && afterItem.type === 'image') {
          newImageItem.prompt = afterItem.prompt
          newImageItem.referenceImages = afterItem.referenceImages.map(img => ({
            ...img,
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          }))
          newImageItem.generatedImage = afterItem.generatedImage ? { ...afterItem.generatedImage } : null
          newImageItem.aspectRatio = afterItem.aspectRatio
          newImageItem.resolution = afterItem.resolution
          if (afterItem.excelData) {
            newImageItem.excelData = { ...afterItem.excelData }
          }

          // 同时复制对应的视频镜头数据
          const sourceVideoItem = state.workItems.find(
            item => item.type === 'video' && String(item.shotNumber) === String(afterItem.shotNumber)
          )
          if (sourceVideoItem) {
            newVideoItem.prompt = sourceVideoItem.prompt
            newVideoItem.aspectRatio = sourceVideoItem.aspectRatio
            newVideoItem.duration = sourceVideoItem.duration
            newVideoItem.generatedVideo = sourceVideoItem.generatedVideo ? { ...sourceVideoItem.generatedVideo } : null
            if (sourceVideoItem.firstFrame) {
              newVideoItem.firstFrame = {
                ...sourceVideoItem.firstFrame,
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              }
            }
            if (sourceVideoItem.lastFrame) {
              newVideoItem.lastFrame = {
                ...sourceVideoItem.lastFrame,
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              }
            }
            if (sourceVideoItem.excelData) {
              newVideoItem.excelData = { ...sourceVideoItem.excelData }
            }
          }
        }

        newItems.splice(insertIndex, 0, newImageItem, newVideoItem, newLipsyncItem, newVoiceItem)
        
        newActiveId = type === 'image' ? newImageItem.id : type === 'video' ? newVideoItem.id : type === 'lipsync' ? newLipsyncItem.id : newVoiceItem.id
        newActiveId = type === 'image' ? newImageItem.id : type === 'video' ? newVideoItem.id : newLipsyncItem.id

        const sortedItems = newItems.sort((a, b) => {
          const typeOrder = (t: string) => {
            switch (t) {
              case 'image': return 0
              case 'video': return 1
              case 'lipsync': return 2
              case 'voice': return 3
              default: return 4
            }
          }
          const shotCompare = compareShotNumbers(a.shotNumber, b.shotNumber)
          if (shotCompare !== 0) return shotCompare
          return typeOrder(a.type) - typeOrder(b.type)
        })

        set({
          workItems: sortedItems,
          activeWorkId: newActiveId,
        })
      },

      removeWorkItem: (id) => {
        const state = get()
        
        const itemToRemove = state.workItems.find(item => item.id === id)
        if (!itemToRemove) return

        const imageItems = state.workItems.filter(item => item.type === 'image')
        const videoItems = state.workItems.filter(item => item.type === 'video')
        const lipsyncItems = state.workItems.filter(item => item.type === 'lipsync')
        const voiceItems = state.workItems.filter(item => item.type === 'voice')

        if (itemToRemove.type === 'image' && imageItems.length <= 1) return
        if (itemToRemove.type === 'video' && videoItems.length <= 1) return
        if (itemToRemove.type === 'lipsync' && lipsyncItems.length <= 1) return
        if (itemToRemove.type === 'voice' && voiceItems.length <= 1) return
        
        const shotNumberToRemove = itemToRemove.shotNumber
        const itemsToRemove = state.workItems.filter(
          item => item.shotNumber === shotNumberToRemove
        )
        const idsToRemove = itemsToRemove.map(item => item.id)
        
        const newItems = state.workItems.filter((item) => !idsToRemove.includes(item.id))
        
        set({
          workItems: newItems,
          activeWorkId: idsToRemove.includes(state.activeWorkId || '')
            ? (newItems.find(item => item.type === itemToRemove.type)?.id || newItems[0]?.id || null)
            : state.activeWorkId,
        })
      },

      setActiveWorkId: (id) => set({ activeWorkId: id }),

      updateWorkItem: (id, updates) =>
        set((state) => ({
          workItems: state.workItems.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        })),

      clearWorkItems: () => {
        const imageItem = createWorkItem('image', 1)
        const videoItem = createWorkItem('video', 1)
        const lipsyncItem = createWorkItem('lipsync', 1)
        const voiceItem = createWorkItem('voice', 1)
        voiceItem.voiceState = {
          text: '',
          voiceId: 'male-qn-qingse',
          speed: 1,
          volume: 1,
          pitch: 0,
          status: 'idle',
          progress: 0,
          message: '',
        }
        set({ 
          workItems: [imageItem, videoItem, lipsyncItem, voiceItem], 
          activeWorkId: imageItem.id,
          initialized: true 
        })
      },

      importFromExcel: (result) => {
        const newItems: WorkItem[] = []
        
        result.data.forEach((row) => {
          const imageItem = createWorkItem('image', row.shotNumber, row)
          const videoItem = createWorkItem('video', row.shotNumber, row)
          const lipsyncItem = createWorkItem('lipsync', row.shotNumber, row)
          const voiceItem = createWorkItem('voice', row.shotNumber, row)
          voiceItem.voiceState = {
            text: row.novelText || '',
            voiceId: 'male-qn-qingse',
            speed: 1,
            volume: 1,
            pitch: 0,
            status: 'idle',
            progress: 0,
            message: '',
          }
          newItems.push(imageItem, videoItem, lipsyncItem, voiceItem)
        })

        const sortedItems = newItems.sort((a, b) => {
          const typeOrder = { image: 0, video: 1, lipsync: 2, voice: 3, seedance2: 4 }
          const shotCompare = compareShotNumbers(a.shotNumber, b.shotNumber)
          if (shotCompare !== 0) return shotCompare
          return typeOrder[a.type] - typeOrder[b.type]
        })

        set({
          workItems: sortedItems,
          activeWorkId: sortedItems[0]?.id || null,
          initialized: true,
        })
      },

      importFromShots: (result) => {
        console.log('[importFromShots] 开始导入, 数据条数:', result.data.length)
        const newItems: WorkItem[] = []
        
        result.data.forEach((row, idx) => {
          console.log(`[importFromShots] 第${idx}条数据:`, {
            scene: row.scene,
            props: row.props,
            characters: row.characters
          })
          
          const shotNumber = row.shotNumber || 1
          const excelData: ExcelRowData = {
            shotNumber: typeof shotNumber === 'string' ? parseInt(shotNumber, 10) : shotNumber,
            novelText: row.novelText || '',
            scene: row.scene || '',
            imagePrompt: row.imagePrompt || '',
            videoPrompt: row.videoPrompt || '',
            characterCount: row.characterCount || row.characters?.length || 0,
            characters: row.characters || [],
            props: row.props,
            resolution: row.resolution || '',
            videoWidth: row.videoWidth || 0,
            videoHeight: row.videoHeight || 0,
            duration: row.duration || 5,
          }
          
          const imageItem = createWorkItem('image', shotNumber, excelData)
          console.log(`[importFromShots] 创建image项, 参考图数量:`, imageItem.referenceImages.length, imageItem.referenceImages.map(r => r.name))
          
          const videoItem = createWorkItem('video', shotNumber, excelData)
          const lipsyncItem = createWorkItem('lipsync', shotNumber, excelData)
          const voiceItem = createWorkItem('voice', shotNumber, excelData)
          voiceItem.voiceState = {
            text: row.novelText || '',
            voiceId: 'male-qn-qingse',
            speed: 1,
            volume: 1,
            pitch: 0,
            status: 'idle',
            progress: 0,
            message: '',
          }
          newItems.push(imageItem, videoItem, lipsyncItem, voiceItem)
        })

        const sortedItems = newItems.sort((a, b) => {
          const typeOrder = { image: 0, video: 1, lipsync: 2, voice: 3, seedance2: 4 }
          const shotCompare = compareShotNumbers(a.shotNumber, b.shotNumber)
          if (shotCompare !== 0) return shotCompare
          return typeOrder[a.type] - typeOrder[b.type]
        })

        if (result.replace) {
          set({
            workItems: sortedItems,
            activeWorkId: sortedItems[0]?.id || null,
            initialized: true,
          })
        } else {
          const state = get()
          const existingItems = state.workItems
          const allItems = [...existingItems, ...sortedItems]
          const allSortedItems = allItems.sort((a, b) => {
            const typeOrder = { image: 0, video: 1, lipsync: 2, voice: 3, seedance2: 4 }
            const shotCompare = compareShotNumbers(a.shotNumber, b.shotNumber)
            if (shotCompare !== 0) return shotCompare
            return typeOrder[a.type] - typeOrder[b.type]
          })

          set({
            workItems: allSortedItems,
            activeWorkId: allSortedItems[0]?.id || null,
            initialized: true,
          })
        }
      },

      batchUpdateWorkItems: (updates) => {
        console.log('[batchUpdateWorkItems] 开始批量更新, 更新数量:', updates.length)
        const updatesMap = new Map(updates.map(u => [u.id, u.updates]))
        updates.forEach(u => {
          console.log(`[batchUpdateWorkItems] 更新项目 ${u.id}:`, u.updates)
        })
        
        set((state) => {
          const newWorkItems = state.workItems.map((item) => {
            const update = updatesMap.get(item.id)
            if (update) {
              console.log(`[batchUpdateWorkItems] 应用更新到项目 ${item.id}, type: ${item.type}`)
              if (update.firstFrame) {
                console.log(`[batchUpdateWorkItems] 设置 firstFrame:`, update.firstFrame)
              }
            }
            return update ? { ...item, ...update } : item
          })
          return { workItems: newWorkItems }
        })
        console.log('[batchUpdateWorkItems] 批量更新完成')
      },

      linkImageToVideoFirstFrame: (shotNumber, imageUrl) => {
        set((state) => {
          const videoItem = state.workItems.find(
            (item) => item.type === 'video' && item.shotNumber === shotNumber
          )
          
          if (!videoItem) {
            console.warn(`[AutoLink] 未找到镜头 ${shotNumber} 的视频项目`)
            return state
          }
          
          console.log(`[AutoLink] 自动关联: 镜头 ${shotNumber} 的图片 -> 视频首帧`)
          
          const newFirstFrame = {
            id: generateId(),
            file: null,
            preview: imageUrl,
            name: `镜头${shotNumber}_首帧`,
            order: 0,
          }
          
          return {
            workItems: state.workItems.map((item) =>
              item.id === videoItem.id 
                ? { ...item, firstFrame: newFirstFrame }
                : item
            ),
          }
        })
      },

      addReferenceImagesToShot: (shotNumber, images, type) => {
        set((state) => {
          const targetItem = state.workItems.find(
            (item) => item.type === type && item.shotNumber === shotNumber
          )
          
          if (!targetItem) {
            console.warn(`[AddRefImages] 未找到镜头 ${shotNumber} 的${type === 'image' ? '图生图' : '视频'}项目`)
            return state
          }
          
          console.log(`[AddRefImages] 添加参考图: 镜头 ${shotNumber}, ${images.length} 张图片`)
          
          const newReferenceImages = images.map((img, index) => ({
            id: generateId(),
            file: null,
            preview: img.preview,
            name: img.name,
            order: targetItem.referenceImages.length + index,
          }))
          
          return {
            workItems: state.workItems.map((item) =>
              item.id === targetItem.id 
                ? { ...item, referenceImages: [...item.referenceImages, ...newReferenceImages].slice(0, 6) }
                : item
            ),
          }
        })
      },

      setGeneratedImageForShot: (shotNumber, imageUrl, fileName, thumbnailUrl?) => {
        set((state) => {
          const imageItem = state.workItems.find(
            (item) => item.type === 'image' && String(item.shotNumber) === String(shotNumber)
          )
          
          if (!imageItem) {
            console.warn(`[SetGeneratedImage] 未找到镜头 ${shotNumber} 的图生图项目`)
            return state
          }
          
          console.log(`[SetGeneratedImage] 设置生成结果: 镜头 ${shotNumber}, 图片: ${fileName}`)
          
          const timestamp = Date.now()
          
          const generatedImage = {
            id: generateId(),
            url: imageUrl,
            thumbnailUrl: thumbnailUrl,
            timestamp,
            prompt: imageItem.prompt,
            referenceImages: imageItem.referenceImages.map((img) => img.preview),
          }
          
          const videoItem = state.workItems.find(
            (item) => item.type === 'video' && String(item.shotNumber) === String(shotNumber)
          )
          
          const lipsyncItem = state.workItems.find(
            (item) => item.type === 'lipsync' && String(item.shotNumber) === String(shotNumber)
          )
          
          const newFirstFrame = {
            id: generateId(),
            file: null as File | null,
            preview: imageUrl,
            path: imageUrl,
            thumbnailUrl: thumbnailUrl,
            name: `镜头${shotNumber}_首帧`,
            order: 0,
            slotIndex: 0,
            timestamp,
          }
          
          console.log(`[SetGeneratedImage] newFirstFrame:`, newFirstFrame)
          
          return {
            workItems: state.workItems.map((item) => {
              if (item.id === imageItem.id) {
                return { ...item, generatedImage }
              }
              if (videoItem && item.id === videoItem.id) {
                console.log(`[SetGeneratedImage] 更新 videoItem firstFrame`)
                return { ...item, firstFrame: newFirstFrame }
              }
              if (lipsyncItem && item.id === lipsyncItem.id) {
                console.log(`[SetGeneratedImage] 更新 lipsyncItem firstFrame`)
                return { ...item, firstFrame: newFirstFrame }
              }
              return item
            }),
          }
        })
      },

      presets: defaultPresets,
      addPreset: (preset) =>
        set((state) => ({
          presets: [...state.presets, preset],
        })),
      removePreset: (id) =>
        set((state) => ({
          presets: state.presets.filter((p) => p.id !== id),
        })),

      settings: defaultSettings,
      updateSettings: (settings) =>
        set((state) => ({
          settings: { ...state.settings, ...settings },
        })),

      history: [],
      addToHistory: (record) =>
        set((state) => ({
          history: [record, ...state.history].slice(0, 100),
        })),
      clearHistory: () => set({ history: [] }),

      tasks: [],
      activeTask: null,
      addTask: (task) =>
        set((state) => ({
          tasks: [...state.tasks, task],
        })),
      removeTask: (path) =>
        set((state) => {
          const normalizePath = (p: string) => p.replace(/\\/g, '/')
          const normalizedPath = normalizePath(path)
          const isRemovingActiveTask = state.activeTask && normalizePath(state.activeTask.path) === normalizedPath
          
          if (isRemovingActiveTask) {
            import('../utils/libraryCacheManager').then(({ clearAllLibraryCaches }) => {
              clearAllLibraryCaches()
            }).catch(() => {})
          }
          return {
            tasks: state.tasks.filter((t) => normalizePath(t.path) !== normalizedPath),
            activeTask: isRemovingActiveTask ? null : state.activeTask,
          }
        }),
      renameTask: (oldPath, newName, newPath) =>
        set((state) => {
          const normalizePath = (p: string) => p.replace(/\\/g, '/')
          const normalizedOldPath = normalizePath(oldPath)
          const isRenamingActiveTask = state.activeTask && normalizePath(state.activeTask.path) === normalizedOldPath
          const updatedTasks = state.tasks.map((t) =>
            normalizePath(t.path) === normalizedOldPath
              ? { ...t, name: newName, path: newPath }
              : t
          )
          return {
            tasks: updatedTasks,
            activeTask: isRenamingActiveTask
              ? { ...state.activeTask!, name: newName, path: newPath }
              : state.activeTask,
          }
        }),
      setActiveTask: async (task, options = {}) => {
        const currentState = get()
        const currentPath = currentState.activeTask?.path
        const newPath = task?.path
        const { skipSave = false } = options
        
        // 如果切换项目且不是跳过保存模式，先保存当前项目
        if (currentPath && currentPath !== newPath && !skipSave) {
          console.log(`[AppStore] 切换项目前保存当前项目: ${currentState.activeTask?.name}`)
          try {
            await currentState.saveProjectImmediately()
            console.log('[AppStore] 当前项目保存成功，继续切换')
          } catch (err) {
            console.error('[AppStore] 切换前保存失败:', err)
            // 保存失败也继续切换，但记录错误
          }
        }
        
        if (currentPath && currentPath !== newPath) {
          import('../utils/libraryCacheManager').then(({ clearAllLibraryCaches }) => {
            clearAllLibraryCaches()
          }).catch(() => {})
        }
        
        // 如果切换到新项目，加载新项目的 seedance2Data
        if (newPath && currentPath !== newPath) {
          try {
            const projectStorageService = (await import('../services/projectStorageService')).projectStorageService
            const projectData = await projectStorageService.loadProjectData(newPath)
            if (projectData?.seedance2Data) {
              set({ 
                activeTask: task,
                seedance2Data: projectData.seedance2Data 
              })
              console.log('[AppStore] 切换项目时加载 seedance2Data:', task?.name)
              return
            } else {
              // 新项目没有 seedance2Data，重置为默认值
              set({ 
                activeTask: task,
                seedance2Data: { ...defaultSeedance2Data }
              })
              console.log('[AppStore] 新项目无 seedance2Data，已重置为默认值:', task?.name)
              return
            }
          } catch (err) {
            console.error('[AppStore] 切换项目时加载 seedance2Data 失败:', err)
            // 加载失败时重置为默认值
            set({ 
              activeTask: task,
              seedance2Data: { ...defaultSeedance2Data }
            })
            console.log('[AppStore] 加载失败，已重置 seedance2Data 为默认值:', task?.name)
            return
          }
        }
        
        set({ activeTask: task })
      },

      scanAndLoadProjects: async (savePath: string) => {
        const normalizePath = (path: string): string => {
          return path.replace(/\\/g, '/')
        }
        
        try {
          const fs = await import('@tauri-apps/plugin-fs')
          const normalizedSavePath = normalizePath(savePath)
          const entries = await fs.readDir(normalizedSavePath)
          
          const newTasks: TaskFolder[] = []
          
          for (const entry of entries) {
            if (entry.isDirectory && entry.name) {
              const folderPath = `${normalizedSavePath}/${entry.name}`
              
              try {
                const subEntries = await fs.readDir(folderPath)
                const subFolderNames = subEntries
                  .filter(e => e.isDirectory)
                  .map(e => e.name)
                
                const hasCharacterImage = subFolderNames.includes('Character image')
                const hasImage = subFolderNames.includes('Image')
                const hasVideo = subFolderNames.includes('Video')
                
                if (hasCharacterImage && hasImage && hasVideo) {
                  let config = null
                  try {
                    const configPath = `${folderPath}/.project-config.json`
                    const configExists = await fs.exists(configPath)
                    if (configExists) {
                      const configContent = await fs.readTextFile(configPath)
                      config = JSON.parse(configContent)
                    }
                  } catch (configErr) {
                    console.warn(`[scanAndLoadProjects] 读取配置文件失败: ${folderPath}`, configErr)
                  }
                  
                  const folderName = entry.name
                  newTasks.push({
                    name: folderName,
                    path: folderPath,
                    createdAt: config?.createdAt || Date.now(),
                    style: config?.style,
                    styleName: config?.styleName,
                  })
                }
              } catch (err) {
                console.warn(`[scanAndLoadProjects] 读取子文件夹失败: ${folderPath}`, err)
              }
            }
          }
          
          const result = await new Promise<{ added: number; total: number }>((resolve) => {
            set((state) => {
              const existingNormalizedPaths = new Set(state.tasks.map(t => normalizePath(t.path)))
              const uniqueNewTasks = newTasks.filter(task => !existingNormalizedPaths.has(normalizePath(task.path)))
              
              console.log(`[scanAndLoadProjects] 扫描完成: 新增 ${uniqueNewTasks.length} 个项目, 总计 ${newTasks.length} 个有效项目`)
              
              resolve({ added: uniqueNewTasks.length, total: newTasks.length })
              
              return {
                tasks: [...state.tasks, ...uniqueNewTasks],
              }
            })
          })
          
          return result
        } catch (err) {
          console.error('[scanAndLoadProjects] 扫描项目失败:', err)
          throw err
        }
      },

      lastActiveMode: 'image',
      setLastActiveMode: (mode) => set({ lastActiveMode: mode }),

      globalPrompt: '',
      setGlobalPrompt: (prompt) => set({ globalPrompt: prompt }),

      saveCurrentProject: async () => {
        const state = get()
        const { activeTask, workItems, activeWorkId, lastActiveMode, seedance2Data } = state
        
        if (!activeTask?.path) {
          console.log('[AppStore] 没有活动项目，跳过保存')
          return true // 没有活动项目视为保存成功
        }

        // 记录保存时的数据状态
        console.log(`[AppStore] 开始保存项目: ${activeTask.name}, workItems数量: ${workItems.length}`)
        if (workItems.length === 0) {
          console.warn('[AppStore] 警告: 保存时 workItems 为空数组!')
        }

        const completedShots = workItems.filter(
          item => item.generationState.status === 'completed'
        ).length

        const totalShots = new Set(
          workItems.map(item => item.shotNumber)
        ).size

        const success = await projectStorageService.saveProjectData(activeTask.path, {
          projectName: activeTask.name,
          projectPath: activeTask.path,
          createdAt: activeTask.createdAt,
          workItems,
          activeWorkId,
          seedance2Data,
          metadata: {
            totalShots,
            completedShots,
            lastActiveMode,
          },
        })

        if (success) {
          console.log(`[AppStore] 项目保存成功: ${activeTask.name}, 包含 ${workItems.length} 个工作项`)
        } else {
          console.error(`[AppStore] 项目保存失败: ${activeTask.name}`)
        }

        return success
      },

      saveProjectImmediately: async () => {
        const state = get()
        const { activeTask, workItems, activeWorkId, lastActiveMode, seedance2Data } = state
        
        if (!activeTask?.path) {
          console.log('[AppStore] 没有活动项目，跳过保存')
          return true // 没有活动项目视为保存成功，允许关闭
        }

        // 记录保存时的数据状态
        console.log(`[AppStore] 开始立即保存项目: ${activeTask.name}, workItems数量: ${workItems.length}`)
        if (workItems.length === 0) {
          console.warn('[AppStore] 警告: 立即保存时 workItems 为空数组!')
        }

        const completedShots = workItems.filter(
          item => item.generationState.status === 'completed'
        ).length

        const totalShots = new Set(
          workItems.map(item => item.shotNumber)
        ).size

        const success = await projectStorageService.saveImmediately(activeTask.path, {
          projectName: activeTask.name,
          projectPath: activeTask.path,
          createdAt: activeTask.createdAt,
          workItems,
          activeWorkId,
          seedance2Data,
          metadata: {
            totalShots,
            completedShots,
            lastActiveMode,
          },
        })

        if (success) {
          console.log(`[AppStore] 项目立即保存成功: ${activeTask.name}, 包含 ${workItems.length} 个工作项`)
        } else {
          console.error(`[AppStore] 项目立即保存失败: ${activeTask.name}`)
        }

        return success
      },

      loadProjectData: async (projectPath: string) => {
        return await projectStorageService.loadProjectData(projectPath)
      },

      restoreProjectData: (data: ProjectData) => {
        console.log(`[AppStore] 恢复项目数据: ${data.projectName}, workItems数量: ${data.workItems?.length || 0}`)
        if (!data.workItems || data.workItems.length === 0) {
          console.warn('[AppStore] 警告: 恢复的数据中 workItems 为空!')
        }
        
        set({
          workItems: data.workItems || [],
          activeWorkId: data.activeWorkId,
          lastActiveMode: data.metadata?.lastActiveMode || 'image',
          seedance2Data: data.seedance2Data || { ...defaultSeedance2Data },
          initialized: true,
        })
        console.log('[AppStore] 项目数据已恢复:', data.projectName, `(${data.workItems?.length || 0} 个工作项)`)
      },

      imageApiProvider: 'runninghub',
      setImageApiProvider: (provider) => set({ imageApiProvider: provider }),
      videoApiProvider: 'runninghub',
      setVideoApiProvider: (provider) => set({ videoApiProvider: provider }),
      
      apiConfigs: { ...defaultApiConfigs },
      updateApiConfig: (provider, config) =>
        set((state) => ({
          apiConfigs: {
            ...state.apiConfigs,
            [provider]: { ...state.apiConfigs[provider], ...config },
          },
        })),
      
      runningHubMappings: [...DEFAULT_RUNNINGHUB_MAPPINGS],
      addRunningHubMapping: (mapping) =>
        set((state) => ({
          runningHubMappings: [...state.runningHubMappings, mapping],
        })),
      updateRunningHubMapping: (id, updates) =>
        set((state) => {
          const existingIds = state.runningHubMappings.map(m => m.id)
          const defaultMapping = DEFAULT_RUNNINGHUB_MAPPINGS.find(m => m.id === id)
          
          if (!existingIds.includes(id) && defaultMapping) {
            return {
              runningHubMappings: [...state.runningHubMappings, { ...defaultMapping, ...updates }],
            }
          }
          
          return {
            runningHubMappings: state.runningHubMappings.map((m) =>
              m.id === id ? { ...m, ...updates } : m
            ),
          }
        }),
      removeRunningHubMapping: (id) =>
        set((state) => ({
          runningHubMappings: state.runningHubMappings.filter((m) => m.id !== id),
        })),
      
      ensureDefaultMappings: () => {
        set((state) => {
          const existingIds = state.runningHubMappings.map(m => m.id)
          const missingMappings = DEFAULT_RUNNINGHUB_MAPPINGS.filter(
            m => !existingIds.includes(m.id)
          )
          
          if (missingMappings.length > 0) {
            console.log(`[AppStore] 添加缺失的默认映射: ${missingMappings.map(m => m.name).join(', ')}`)
            return {
              runningHubMappings: [...state.runningHubMappings, ...missingMappings],
            }
          }
          
          return state
        })
      },
      
      runningHubImageMappingId: 'character-consistency',
      setRunningHubImageMappingId: (id) => set({ runningHubImageMappingId: id }),
      runningHubVideoMappingId: null,
      setRunningHubVideoMappingId: (id) => set({ runningHubVideoMappingId: id }),
      runningHubViewAngleMappingId: null,
      setRunningHubViewAngleMappingId: (id) => set({ runningHubViewAngleMappingId: id }),
      runningHubText2ImageMappingId: null,
      setRunningHubText2ImageMappingId: (id) => set({ runningHubText2ImageMappingId: id }),

      taskQueueState: {
        queue: [],
        isProcessing: false,
        currentRunningCount: 0,
        maxConcurrent: 2,
      },
      updateTaskQueueState: (state) => set({ taskQueueState: state }),
      getQueueLength: () => taskQueueManager.getQueueLength(),
      getActiveTaskCount: () => taskQueueManager.getActiveTaskCount(),

      lipSyncState: {
        imageFile: null,
        imageUrl: '',
        audioFile: null,
        audioUrl: '',
        audioName: '',
        subjects: [],
        selectedSubjectIds: [],
        prompt: '',
        resolution: 1080,
        status: 'idle',
        progress: 0,
        message: '',
      },
      updateLipSyncState: (updates) =>
        set((state) => ({
          lipSyncState: { ...state.lipSyncState, ...updates },
        })),
      resetLipSyncState: () =>
        set({
          lipSyncState: {
            imageFile: null,
            imageUrl: '',
            audioFile: null,
            audioUrl: '',
            audioName: '',
            subjects: [],
            selectedSubjectIds: [],
            prompt: '',
            resolution: 1080,
            status: 'idle',
            progress: 0,
            message: '',
          },
        }),

      amkApiKey: '',
      setAmkApiKey: (key) => set({ amkApiKey: key }),

      favoriteVoiceIds: [],
      toggleFavoriteVoice: (voiceId) =>
        set((state) => {
          const isFavorited = state.favoriteVoiceIds.includes(voiceId)
          return {
            favoriteVoiceIds: isFavorited
              ? state.favoriteVoiceIds.filter(id => id !== voiceId)
              : [...state.favoriteVoiceIds, voiceId],
          }
        }),

      voiceCharacters: {},
      getVoiceCharactersForTask: (taskId) => {
        const state = get()
        return state.voiceCharacters[taskId] || []
      },
      addVoiceCharacter: (taskId, character) =>
        set((state) => {
          const existingCharacters = state.voiceCharacters[taskId] || []
          const nameExists = existingCharacters.some(c => c.name === character.name)
          if (nameExists) {
            console.warn(`[VoiceCharacter] 角色名称 "${character.name}" 已存在`)
            return state
          }
          const newCharacter: VoiceCharacter = {
            id: generateId(),
            name: character.name,
            voiceId: character.voiceId,
            voiceName: character.voiceName,
            createdAt: Date.now(),
          }
          return {
            voiceCharacters: {
              ...state.voiceCharacters,
              [taskId]: [...existingCharacters, newCharacter],
            },
          }
        }),
      updateVoiceCharacter: (taskId, characterId, updates) =>
        set((state) => {
          const taskCharacters = state.voiceCharacters[taskId] || []
          if (updates.name) {
            const nameExists = taskCharacters.some(c => c.id !== characterId && c.name === updates.name)
            if (nameExists) {
              console.warn(`[VoiceCharacter] 角色名称 "${updates.name}" 已存在`)
              return state
            }
          }
          return {
            voiceCharacters: {
              ...state.voiceCharacters,
              [taskId]: taskCharacters.map(c =>
                c.id === characterId ? { ...c, ...updates } : c
              ),
            },
          }
        }),
      removeVoiceCharacter: (taskId, characterId) =>
        set((state) => {
          const taskCharacters = state.voiceCharacters[taskId] || []
          return {
            voiceCharacters: {
              ...state.voiceCharacters,
              [taskId]: taskCharacters.filter(c => c.id !== characterId),
            },
          }
        }),
      addVoiceWorkItemForCharacter: (characterId: string, characterName: string, voiceId: string) => {
      const state = get()
      const voiceItems = state.workItems.filter(item => item.type === 'voice')
      
      const characterItems = voiceItems.filter(item => item.voiceState?.characterId === characterId)
      
      let newIndex = 1
      if (characterItems.length > 0) {
        const existingIndices = characterItems
          .map(item => {
            const match = item.voiceState?.characterIndex
            return typeof match === 'number' ? match : 0
          })
          .filter(i => i > 0)
        if (existingIndices.length > 0) {
          newIndex = Math.max(...existingIndices) + 1
        }
      }
      
      const newItem = createWorkItem('voice', `${characterName}-${newIndex}`)
      newItem.voiceState = {
        text: '',
        voiceId: voiceId,
        speed: 1,
        volume: 1,
        pitch: 0,
        status: 'idle',
        progress: 0,
        message: '',
        characterId: characterId,
        characterName: characterName,
        characterIndex: newIndex,
      }
      
      set({
        workItems: [...state.workItems, newItem],
        activeWorkId: newItem.id,
      })
    },
    
    toasts: [],
    addToast: (toast) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
      set(state => ({
        toasts: [...state.toasts, { ...toast, id }]
      }))
    },
    removeToast: (id) => {
      set(state => ({
        toasts: state.toasts.filter(t => t.id !== id)
      }))
    },

    subjectMaterials: [],
    addSubjectMaterial: (material) => {
      set(state => ({
        subjectMaterials: [...state.subjectMaterials, material]
      }))
    },
    updateSubjectMaterial: (id, updates) => {
      set(state => ({
        subjectMaterials: state.subjectMaterials.map(m => 
          m.id === id ? { ...m, ...updates, updatedAt: Date.now() } : m
        )
      }))
    },
    removeSubjectMaterial: (id) => {
      set(state => ({
        subjectMaterials: state.subjectMaterials.filter(m => m.id !== id)
      }))
    },
    getSubjectMaterialByProject: (projectId) => {
      return get().subjectMaterials.find(m => m.projectId === projectId)
    },
    syncSubjectMaterials: async () => {
      const state = get()
      const { tasks, subjectMaterials, addSubjectMaterial, updateSubjectMaterial, removeSubjectMaterial } = state
      
      try {
        const { readDir } = await import('@tauri-apps/plugin-fs')
        
        const taskPaths = new Set(tasks.map(t => t.path))
        
        const existingProjectIds = new Set<string>()
        const duplicatesToRemove: string[] = []
        const orphanedMaterials: string[] = []
        
        subjectMaterials.forEach((material) => {
          if (!taskPaths.has(material.projectId)) {
            orphanedMaterials.push(material.id)
          } else if (existingProjectIds.has(material.projectId)) {
            duplicatesToRemove.push(material.id)
          } else {
            existingProjectIds.add(material.projectId)
          }
        })

        for (const id of orphanedMaterials) {
          removeSubjectMaterial(id)
        }
        for (const id of duplicatesToRemove) {
          removeSubjectMaterial(id)
        }
        
        const currentMaterials = get().subjectMaterials
        
        for (const task of tasks) {
          const existingMaterial = currentMaterials.find(m => m.projectId === task.path)
          
          const countFilesInFolder = async (folderName: string): Promise<number> => {
            try {
              const folderPath = `${task.path}/${folderName}`
              const files = await readDir(folderPath)
              return files.filter(file => 
                !file.name?.startsWith('.') && 
                /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.name || '')
              ).length
            } catch {
              return 0
            }
          }

          const charactersCount = await countFilesInFolder('角色库')
          const propsCount = await countFilesInFolder('道具库')
          const scenesCount = await countFilesInFolder('场景库')

          if (!existingMaterial) {
            const newMaterial: SubjectMaterial = {
              id: generateId(),
              projectId: task.path,
              projectName: task.name,
              projectPath: task.path,
              characters: Array(charactersCount).fill(null),
              props: Array(propsCount).fill(null),
              scenes: Array(scenesCount).fill(null),
              createdAt: Date.now(),
              updatedAt: Date.now()
            }
            addSubjectMaterial(newMaterial)
          } else {
            const currentCharactersCount = existingMaterial.characters.length
            const currentPropsCount = existingMaterial.props.length
            const currentScenesCount = existingMaterial.scenes.length

            if (currentCharactersCount !== charactersCount || 
                currentPropsCount !== propsCount || 
                currentScenesCount !== scenesCount) {
              updateSubjectMaterial(existingMaterial.id, {
                characters: Array(charactersCount).fill(null),
                props: Array(propsCount).fill(null),
                scenes: Array(scenesCount).fill(null),
              })
            }
          }
        }
      } catch (error) {
        console.error('Failed to sync subject materials:', error)
      }
    },

    seedance2Data: { ...defaultSeedance2Data },
    updateSeedance2Data: (updates) => {
      set((state) => ({
        seedance2Data: { ...state.seedance2Data, ...updates }
      }))
    },
    resetSeedance2Data: () => {
      set({ seedance2Data: { ...defaultSeedance2Data } })
    },

    resetGlobalState: () => {
      set({
        globalPrompt: '',
        imageApiProvider: 'runninghub',
        videoApiProvider: 'runninghub',
        lastActiveMode: 'image',
      })
    },

    disableShotNavigator: false,
    setDisableShotNavigator: (disable: boolean) => set({ disableShotNavigator: disable }),

    eulaAccepted: false,
    setEulaAccepted: (accepted: boolean) => set({ eulaAccepted: accepted }),
  }),
  {
    name: 'xuyan-ai-storage',
    partialize: (state) => ({
        theme: state.theme,
        user: state.user,
        presets: state.presets,
        settings: state.settings,
        history: state.history,
        tasks: state.tasks,
        activeTask: state.activeTask,
        imageApiProvider: state.imageApiProvider,
        videoApiProvider: state.videoApiProvider,
        apiConfigs: state.apiConfigs,
        runningHubMappings: state.runningHubMappings,
        runningHubImageMappingId: state.runningHubImageMappingId,
        runningHubVideoMappingId: state.runningHubVideoMappingId,
        runningHubViewAngleMappingId: state.runningHubViewAngleMappingId,
        runningHubText2ImageMappingId: state.runningHubText2ImageMappingId,
        amkApiKey: state.amkApiKey,
        globalPrompt: state.globalPrompt,
        favoriteVoiceIds: state.favoriteVoiceIds,
        voiceCharacters: state.voiceCharacters,
        subjectMaterials: state.subjectMaterials,
        eulaAccepted: state.eulaAccepted,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.settings = { ...defaultSettings, ...state.settings }

          const allProviders: ApiProvider[] = ['kling', 'runninghub', 'jimeng', 'minimax', 'gemini12ai', 'yunwu', 'volcark']
          const currentConfigs = state.apiConfigs
          let needsUpdate = false
          
          allProviders.forEach((provider) => {
            if (!currentConfigs[provider]) {
              currentConfigs[provider] = defaultApiConfigs[provider]
              needsUpdate = true
            }
          })
          
          if (needsUpdate) {
            state.apiConfigs = { ...currentConfigs }
          }
          
          if (!state.favoriteVoiceIds) {
            state.favoriteVoiceIds = []
          }
          
          if (!state.imageApiProvider && !state.videoApiProvider) {
            const stored = localStorage.getItem('xuyan-ai-storage')
            if (stored) {
              try {
                const parsed = JSON.parse(stored)
                if (parsed.state?.apiProvider) {
                  state.imageApiProvider = parsed.state.apiProvider
                  state.videoApiProvider = parsed.state.apiProvider
                }
              } catch {
                // ignore
              }
            }
          }
        }
      },
    }
  )
)
