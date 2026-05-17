import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Plus, Minus, X, ImageIcon, Users, Package, Mountain, FileImage, Loader2, Play, Sparkles, Edit2, FolderOpen, Bell } from 'lucide-react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useAppStore } from '../../store/appStore'
import type { Seedance2MaterialItem, Seedance2VideoItem, Seedance2QualityStyle } from '../../types'
import { DEFAULT_RUNNINGHUB_MAPPINGS } from '../../types'
import { DeepSeekService } from '../../services/deepseekService'
import { YunwuService } from '../../services/yunwuService'
import { SeedanceService } from '../../services/seedanceService'
import { RunningHubService } from '../../services/runningHubService'
import { EnhanceVideoService } from '../../services/enhanceVideoService'
import { saveSeedanceResult, saveSeedanceVideo, saveSeedanceImage, getSavedVideos, saveEnhancedVideo } from '../../utils/seedanceStorage'
import { getAudioDurationViaTauri, formatDuration } from '../../utils/audioDuration'
import { videoLog } from '../../services/videoLogService'
import { notificationHistoryService } from '../../services/notificationHistoryService'
import { stylePrompts, realismEnhancement, STANDARD_STORYBOARD_PROMPT, ANCIENT_REALISTIC_2_STORYBOARD_PROMPT, ancientRealisticStylePrompt, ancientRealistic2StylePrompt } from './stylePrompts'
import LazyImage from '../LazyImage/LazyImage'
import { ImageEditor } from '../ImageEditor'
import CustomSelect from '../CustomSelect/CustomSelect'
import AssetLibraryPanel from '../AssetLibraryPanel'
import Seedance2NotificationHistory from './Seedance2NotificationHistory'
import styles from './Seedance2Panel.module.css'

type MaterialType = 'image' | 'audio' | 'video'

interface LibraryImage {
  id: string
  name: string
  path: string
  preview: string
}

const MAX_IMAGES = 9
const MAX_VIDEOS = 3
const MAX_AUDIOS = 3

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

interface MentionPopupState {
  show: boolean
  videoId: string | null
  position: { x: number; y: number }
  filterText: string
  cursorPosition: number
  selectedIndex: number
}

const Seedance2Panel: React.FC = () => {
  const [showMaterialMenu, setShowMaterialMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [activeLibrary, setActiveLibrary] = useState<'character' | 'prop' | 'scene' | 'generated' | 'local' | null>(null)
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([])
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false)
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string; type?: MaterialType; path?: string; videoId?: string; materialId?: string } | null>(null)
  const [editingImage, setEditingImage] = useState<{ path: string; name: string; videoId: string; materialId: string } | null>(null)
  const [isTransforming, setIsTransforming] = useState(false)
  const [transformError, setTransformError] = useState<string | null>(null)
  const [generatingVideoIds, setGeneratingVideoIds] = useState<Set<string>>(new Set())
  const [videoProgress, setVideoProgress] = useState<Record<string, { progress: number; status: string; message: string }>>({})
  const [mentionPopup, setMentionPopup] = useState<MentionPopupState>({
    show: false,
    videoId: null,
    position: { x: 0, y: 0 },
    filterText: '',
    cursorPosition: 0,
    selectedIndex: 0,
  })
  const [enhanceMenuOpen, setEnhanceMenuOpen] = useState<string | null>(null)
  const [enhanceStep, setEnhanceStep] = useState<'provider' | 'volcengine' | 'runninghub'>('provider')
  const [enhancingVideos, setEnhancingVideos] = useState<Set<string>>(new Set())
  const [enhanceProgress, setEnhanceProgress] = useState<Record<string, string>>({})
  const [spreadPokerId, setSpreadPokerId] = useState<string | null>(null)
  const [isSelectingFile, setIsSelectingFile] = useState(false)
  const [showCloudAssetLibrary, setShowCloudAssetLibrary] = useState(false)
  const [showVideoNavigator, setShowVideoNavigator] = useState(false)
  const [videoNavigatorInput, setVideoNavigatorInput] = useState('')
  const [showGlobalPromptModal, setShowGlobalPromptModal] = useState(false)
  const [globalPromptInput, setGlobalPromptInput] = useState('')
  const [showNotificationHistory, setShowNotificationHistory] = useState(false)
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const cancelFlagsRef = useRef<Map<string, boolean>>(new Map())
  const taskIdsRef = useRef<Map<string, string>>(new Map())
  const generatingRef = useRef<Set<string>>(new Set())
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const mentionPopupRef = useRef<HTMLDivElement>(null)
  const videoNavigatorInputRef = useRef<HTMLInputElement>(null)
  const globalPromptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const lastRestoredProjectPathRef = useRef<string | null>(null)
  const justTypedAtRef = useRef(false)

  const { settings, activeTask, seedance2Data, updateSeedance2Data, apiConfigs, setDisableShotNavigator, amkApiKey, addToast, lastActiveMode, saveProjectImmediately } = useAppStore()

  const activeTab = seedance2Data.activeTab
  const novelText = seedance2Data.novelText
  const scriptText = seedance2Data.scriptText
  const videoPrompts = seedance2Data.videoPrompts
  const videoItems = seedance2Data.videoItems
  const globalPrompt = seedance2Data.globalPrompt
  const generatedShotsCount = seedance2Data.generatedShotsCount || 0

  // 初始化通知历史服务
  useEffect(() => {
    if (activeTask?.path) {
      notificationHistoryService.init(activeTask.path)
    }
  }, [activeTask?.path])

  // 项目切换时自动恢复视频（静默模式，不显示提示）
  useEffect(() => {
    const restoreVideosOnProjectChange = async () => {
      const currentPath = activeTask?.path
      
      // 如果没有项目路径，或者已经恢复过这个项目，跳过
      if (!currentPath || lastRestoredProjectPathRef.current === currentPath) {
        return
      }
      
      // 标记当前项目已恢复
      lastRestoredProjectPathRef.current = currentPath
      
      // 获取已保存的视频文件
      const savedVideos = await getSavedVideos(currentPath)
      if (savedVideos.length === 0) {
        return
      }
      
      // 获取当前的视频项
      const { seedance2Data, saveProjectImmediately } = useAppStore.getState()
      const currentVideoItems = seedance2Data.videoItems
      
      if (currentVideoItems.length === 0) {
        return
      }
      
      // 检查并恢复需要恢复的视频
      let restoredCount = 0
      const updatedItems = [...currentVideoItems]
      
      for (let i = 0; i < updatedItems.length; i++) {
        const video = updatedItems[i]
        
        // 如果没有预览视频，尝试从本地恢复
        if (!video.previewUrl) {
          const savedVideo = savedVideos.find(v => v.videoItemId === video.id)
          if (savedVideo) {
            updatedItems[i] = {
              ...video,
              previewUrl: convertFileSrc(savedVideo.path)
            }
            restoredCount++
            console.log(`[Seedance2] 项目切换时自动恢复视频 ${i + 1}`)
          }
        }
      }
      
      if (restoredCount > 0) {
        updateSeedance2Data({ videoItems: updatedItems })
        // 立即保存项目，确保持久化
        await saveProjectImmediately()
        console.log(`[Seedance2] 项目切换时自动恢复了 ${restoredCount} 个视频并已保存`)
      }
    }
    
    restoreVideosOnProjectChange()
  }, [activeTask?.path, updateSeedance2Data])

  // 根据当前是否在 Seedance2.0 界面来启用/禁用 ShotNavigator
  useEffect(() => {
    if (lastActiveMode === 'seedance2') {
      setDisableShotNavigator(true)
    } else {
      setDisableShotNavigator(false)
    }
  }, [lastActiveMode, setDisableShotNavigator])

  // 视频号导航功能 - 只在 Seedance2.0 界面的视频生成标签页生效
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 只在 Seedance2.0 界面生效
      if (lastActiveMode !== 'seedance2') return
      
      // 只在视频生成标签页生效
      if (activeTab !== 'videoGeneration') return
      
      // 如果 mentionPopup 显示，不处理
      if (mentionPopup.show) return
      
      // 如果视频导航器已显示，不重复处理 Enter
      if (showVideoNavigator) return

      const activeElement = document.activeElement
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.getAttribute('contenteditable') === 'true'
      )

      if (e.key === 'Enter' && !isInputFocused) {
        e.preventDefault()
        setShowVideoNavigator(true)
        setVideoNavigatorInput('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab, mentionPopup.show, showVideoNavigator, lastActiveMode])

  // 视频导航器显示时自动聚焦输入框
  useEffect(() => {
    if (showVideoNavigator && videoNavigatorInputRef.current) {
      setTimeout(() => {
        videoNavigatorInputRef.current?.focus()
      }, 100)
    }
  }, [showVideoNavigator])

  // 全局提示词快捷键 - Ctrl+T
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 只在 Seedance2.0 界面生效
      if (lastActiveMode !== 'seedance2') return
      
      // 只在视频生成标签页生效
      if (activeTab !== 'videoGeneration') return
      
      // 如果全局提示词模态框已显示，不重复处理
      if (showGlobalPromptModal) return

      // 检测 Ctrl+T
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault()
        setShowGlobalPromptModal(true)
        setGlobalPromptInput(globalPrompt)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab, showGlobalPromptModal, lastActiveMode, globalPrompt])

  // 全局提示词模态框显示时自动聚焦输入框
  useEffect(() => {
    if (showGlobalPromptModal && globalPromptTextareaRef.current) {
      setTimeout(() => {
        globalPromptTextareaRef.current?.focus()
      }, 100)
    }
  }, [showGlobalPromptModal])

  // 保存全局提示词
  const handleSaveGlobalPrompt = useCallback(() => {
    updateSeedance2Data({ globalPrompt: globalPromptInput.trim() })
    setShowGlobalPromptModal(false)
    addToast({
      type: 'success',
      title: '保存成功',
      message: '全局提示词已保存'
    })
  }, [globalPromptInput, updateSeedance2Data, addToast])

  // 关闭全局提示词模态框
  const handleCloseGlobalPromptModal = useCallback(() => {
    setShowGlobalPromptModal(false)
  }, [])

  // 处理视频号跳转
  const handleVideoNavigatorSubmit = useCallback(() => {
    const videoNumber = parseInt(videoNavigatorInput, 10)
    if (isNaN(videoNumber) || videoNumber <= 0) {
      setShowVideoNavigator(false)
      return
    }

    const targetIndex = videoNumber - 1
    if (targetIndex >= 0 && targetIndex < videoItems.length) {
      const targetVideo = videoItems[targetIndex]
      const element = document.querySelector(`[data-video-id="${targetVideo.id}"]`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // 添加高亮效果
        element.classList.add(styles.videoItemHighlight)
        setTimeout(() => {
          element.classList.remove(styles.videoItemHighlight)
        }, 2000)
      }
    }

    setShowVideoNavigator(false)
    setVideoNavigatorInput('')
  }, [videoNavigatorInput, videoItems])

  const handleVideoNavigatorInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '')
    setVideoNavigatorInput(value)
  }, [])

  const handleVideoNavigatorKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleVideoNavigatorSubmit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setShowVideoNavigator(false)
    }
    e.stopPropagation()
  }, [handleVideoNavigatorSubmit])
  const selectedProvider = seedance2Data.selectedProvider
  const selectedModel = seedance2Data.selectedModel
  const customModelId = seedance2Data.customModelId
  const selectedAspectRatio = seedance2Data.selectedAspectRatio
  const selectedResolution = seedance2Data.selectedResolution
  const setSelectedProvider = useCallback((provider: 'volcengine' | 'runninghub' | 'runninghub-enterprise') => {
    updateSeedance2Data({ selectedProvider: provider })
  }, [updateSeedance2Data])

  const setSelectedModel = useCallback((model: 'seedance-2.0' | 'seedance-2.0-fast' | 'custom') => {
    updateSeedance2Data({ selectedModel: model })
  }, [updateSeedance2Data])

  const setSelectedAspectRatio = useCallback((ratio: '16:9' | '9:16' | '4:3' | '1:1' | '3:4' | '21:9') => {
    updateSeedance2Data({ selectedAspectRatio: ratio })
  }, [updateSeedance2Data])

  const setSelectedResolution = useCallback((resolution: '480p' | '720p') => {
    updateSeedance2Data({ selectedResolution: resolution })
  }, [updateSeedance2Data])

  const basePath = useMemo(() => {
    return activeTask?.path || settings.savePath || null
  }, [activeTask, settings.savePath])

  const handlePasteImage = useCallback(async (e: React.ClipboardEvent, videoId: string) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageItem = Array.from(items).find((item: DataTransferItem) => item.type.startsWith('image/'))
    if (!imageItem) return

    e.preventDefault()

    const file = imageItem.getAsFile()
    if (!file) return

    const currentVideo = videoItems.find(v => v.id === videoId)
    if (!currentVideo) return

    const currentImageCount = currentVideo.materials.filter(m => m.type === 'image').length
    if (currentImageCount >= MAX_IMAGES) {
      addToast({
        type: 'warning',
        title: '素材数量已达上限',
        message: `图片最多支持 ${MAX_IMAGES} 张`
      })
      return
    }

    if (!basePath) {
      addToast({
        type: 'error',
        title: '保存失败',
        message: '请先选择项目'
      })
      return
    }

    try {
      const result = await saveSeedanceImage(basePath, file, videoId, currentImageCount + 1)
      if (result) {
        const material: Seedance2MaterialItem = {
          id: generateId(),
          preview: result.path,
          type: 'image',
          index: currentImageCount + 1,
          name: result.name,
          path: result.path,
          loadTime: Date.now(),
        }

        updateSeedance2Data({
          videoItems: videoItems.map(v => {
            if (v.id === videoId) {
              return { ...v, materials: [...v.materials, material] }
            }
            return v
          })
        })

        addToast({
          type: 'success',
          title: '图片已添加',
          message: `已添加到素材列表`
        })
      }
    } catch (error) {
      console.error('[Seedance2] 粘贴图片失败:', error)
      addToast({
        type: 'error',
        title: '添加失败',
        message: error instanceof Error ? error.message : '保存图片失败'
      })
    }
  }, [basePath, videoItems, updateSeedance2Data, addToast])

  const libraryPaths = useMemo(() => ({
    character: basePath ? `${basePath}\\角色库` : null,
    prop: basePath ? `${basePath}\\道具库` : null,
    scene: basePath ? `${basePath}\\场景库` : null,
    generated: basePath ? `${basePath}\\Image` : null,
  }), [basePath])

  const assetUrlCache = useRef(new Map<string, string>())

  const getAssetUrl = useCallback((filePath: string): string => {
    if (!filePath) return ''

    if (filePath.startsWith('data:') || filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath
    }

    const cached = assetUrlCache.current.get(filePath)
    if (cached) return cached

    const url = convertFileSrc(filePath)
    assetUrlCache.current.set(filePath, url)
    return url
  }, [])

  const getServiceInstance = useCallback(() => {
    if (settings.analysisApi === 'deepseek') {
      return new DeepSeekService({
        apiKey: apiConfigs.yunwu?.apiKey || '',
        endpoint: apiConfigs.yunwu?.endpoint || 'https://yunwu.ai',
        model: 'deepseek-v3.2-thinking',
      })
    }

    if (settings.analysisApi === 'deepseek-v3.2') {
      return new DeepSeekService({
        apiKey: apiConfigs.yunwu?.apiKey || '',
        endpoint: apiConfigs.yunwu?.endpoint || 'https://yunwu.ai',
        model: 'deepseek-v3.2',
      })
    }

    if (settings.analysisApi === 'doubao-seed-2-0-lite') {
      return new DeepSeekService({
        apiKey: apiConfigs.yunwu?.apiKey || '',
        endpoint: apiConfigs.yunwu?.endpoint || 'https://yunwu.ai',
        model: 'doubao-seed-2-0-lite-260215',
      })
    }

    if (settings.analysisApi === 'doubao-seed-2-0-mini') {
      return new DeepSeekService({
        apiKey: apiConfigs.yunwu?.apiKey || '',
        endpoint: apiConfigs.yunwu?.endpoint || 'https://yunwu.ai',
        model: 'doubao-seed-2-0-pro-260215',
      })
    }

    let model: string
    if (settings.analysisApi === 'yunwu3') {
      model = 'gemini-3-pro-preview-thinking'
    } else if (settings.analysisApi === 'gemini-3.1-flash-lite') {
      model = 'gemini-3.1-flash-lite-preview'
    } else if (settings.analysisApi === 'gemini-3-flash') {
      model = 'gemini-3-flash-preview'
    } else if (settings.analysisApi === 'gemini-3-pro') {
      model = 'gemini-3-pro-preview'
    } else {
      model = 'gemini-3.1-pro-preview'
    }

    return new YunwuService({
      apiKey: apiConfigs.yunwu?.apiKey || '',
      endpoint: apiConfigs.yunwu?.endpoint || 'https://yunwu.ai',
      model,
    })
  }, [apiConfigs, settings.analysisApi])

  const handleTransform = useCallback(async () => {
    if (!novelText.trim()) return
    setIsTransforming(true)
    setTransformError(null)
    try {
      const service = getServiceInstance()
      const result = await service.convertNovelToScript(novelText)

      if (result.success && result.script) {
        updateSeedance2Data({ scriptText: '' })
        await new Promise(resolve => setTimeout(resolve, 10))
        updateSeedance2Data({ scriptText: result.script || '' })
      } else {
        setTransformError(result.error || '转换失败')
      }
    } catch (err) {
      setTransformError(err instanceof Error ? err.message : '转换失败')
    } finally {
      setIsTransforming(false)
    }
  }, [novelText, updateSeedance2Data, getServiceInstance])

  const handleScriptTransform = useCallback(async () => {
    if (!scriptText.trim()) return
    setIsTransforming(true)
    setTransformError(null)
    try {
      const service = getServiceInstance()
      const styleConfig = stylePrompts[seedance2Data.selectedQualityStyle] || stylePrompts['cg-anime']

      let basePrompt: string
      if (seedance2Data.selectedQualityStyle === 'ancient-realistic-2') {
        basePrompt = ANCIENT_REALISTIC_2_STORYBOARD_PROMPT
      } else {
        const styleText = styleConfig.prompt
        const enhancement = seedance2Data.selectedQualityStyle === 'cg-anime' ? '' : realismEnhancement
        basePrompt = STANDARD_STORYBOARD_PROMPT.replace(/\{STYLE_PLACEHOLDER\}/g, styleText) + enhancement
      }

      const getModelName = (api: string) => {
        const modelMap: Record<string, string> = {
          'deepseek': 'deepseek-v3.2-thinking',
          'deepseek-v3.2': 'deepseek-v3.2',
          'doubao-seed-2-0-lite': 'doubao-seed-2-0-lite-260215',
          'doubao-seed-2-0-mini': 'doubao-seed-2-0-pro-260215',
          'yunwu3': 'gemini-3-pro-preview-thinking',
          'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite-preview',
          'gemini-3-flash': 'gemini-3-flash-preview',
          'gemini-3-pro': 'gemini-3-pro-preview',
          'yunwu': 'gemini-3.1-pro-preview',
        }
        return modelMap[api] || api
      }
      console.log('%c【剧本转分镜】使用模型:', 'color: #FF9800; font-size: 14px; font-weight: bold;', getModelName(settings.analysisApi))

      // 分批处理：按场景分割剧本
      const MAX_CHARS_PER_BATCH = 1500 // 每批最大字符数
      const scenes = scriptText.split(/(?=【场景[一二三四五六七八九十零\d]+】)/g).filter(s => s.trim())
      
      let batches: string[] = []
      let currentBatch = ''
      
      for (const scene of scenes) {
        if ((currentBatch + scene).length > MAX_CHARS_PER_BATCH && currentBatch) {
          batches.push(currentBatch)
          currentBatch = scene
        } else {
          currentBatch += scene
        }
      }
      if (currentBatch) batches.push(currentBatch)
      
      // 如果只有一批，直接处理
      if (batches.length === 0) batches = [scriptText]
      
      console.log(`【剧本转分镜】剧本已分割为 ${batches.length} 批处理`)
      
      let allSegments: string[] = []
      let hasError = false
      
      for (let i = 0; i < batches.length; i++) {
        const batchPrompt = basePrompt + '\n\n' + batches[i]
        console.log(`【剧本转分镜】处理第 ${i + 1}/${batches.length} 批，长度: ${batchPrompt.length} 字符`)
        
        const result = await service.convertNovelToScript(batchPrompt)

        // 输出每批的 AI 响应内容
        console.log(`%c【剧本转分镜】第 ${i + 1} 批 AI 输出:`, 'color: #2196F3; font-size: 14px; font-weight: bold;')
        console.log('%c' + '='.repeat(80), 'color: #2196F3;')
        console.log(result.script)
        console.log('%c' + '='.repeat(80), 'color: #2196F3;')
        console.log(`【剧本转分镜】第 ${i + 1} 批 AI 输出长度:`, result.script?.length, '字符')

        if (result.success && result.script) {
          let rawScript = result.script

          // 清理AI思考过程 - 找到第一个有效的分镜内容作为开始
          const sectionMarker = rawScript.indexOf('### 【分镜分段提示词】')
          if (sectionMarker !== -1) {
            rawScript = rawScript.substring(sectionMarker)
          } else {
            const contentStartPatterns = ['【场景1】', '【场景一】', '片段1', '片段一', '【画质', '#### 片段']
            let contentStartIdx = -1
            for (const pattern of contentStartPatterns) {
              const idx = rawScript.indexOf(pattern)
              if (idx !== -1 && (contentStartIdx === -1 || idx < contentStartIdx)) {
                contentStartIdx = idx
              }
            }
            if (contentStartIdx !== -1) {
              rawScript = rawScript.substring(contentStartIdx)
            }
          }

          // 首先尝试提取 "#### 片段X：" 格式的分镜
          const newFormatPattern = /####\s*片段[一二三四五六七八九十零\d]+[：:]/g
          const hasNewFormat = newFormatPattern.test(rawScript)
          
          let segments: string[] = []
          
          if (hasNewFormat) {
            const parts = rawScript.split(/####\s*片段[一二三四五六七八九十零\d]+[：:][^\n]*/g)
            for (const part of parts) {
              const trimmed = part.trim()
              if (!trimmed || trimmed.length < 50) continue
              // 检查是否包含古风写实格式的关键特征
              const hasAncientFormat = trimmed.includes('分镜时长：') && trimmed.includes('拍摄景别：') && trimmed.includes('核心内容：')
              const hasOldFormat = trimmed.includes('【画质风格】')
              if (!hasAncientFormat && !hasOldFormat) continue
              segments.push(trimmed)
            }
          } else {
            const fragmentPattern = /【场景[一二三四五六七八九十零\d]+】|片段[一二三四五六七八九十零\d]+/gs
            const parts = rawScript.split(fragmentPattern)
            for (const part of parts) {
              const trimmed = part.trim()
              if (!trimmed || trimmed.length < 20) continue
              if (/^[片段场景\s一二三四五六七八九十零\d【】：:]+$/s.test(trimmed)) continue
              if (/^[\s\n]*[a-zA-Z]/.test(trimmed) && !trimmed.includes('动作描述')) continue
              if (trimmed.includes('动作描述') || trimmed.includes('【画质') || trimmed.includes('【场景') || trimmed.includes('【分秒')) {
                segments.push(trimmed)
              }
            }
          }
          
          console.log(`【剧本转分镜】第 ${i + 1} 批提取 ${segments.length} 个片段`)
          allSegments.push(...segments)
        } else {
          console.error(`【剧本转分镜】第 ${i + 1} 批处理失败:`, result.error)
          hasError = true
        }
      }
      
      console.log('【剧本转分镜】所有批次处理完成，共提取片段数:', allSegments.length)
      
      if (allSegments.length > 0) {
        const isAncientRealistic = seedance2Data.selectedQualityStyle === 'ancient-realistic'
        const isAncientRealistic2 = seedance2Data.selectedQualityStyle === 'ancient-realistic-2'
        
        const correctAncientStylePrefix = ancientRealisticStylePrompt.split('\n')[0]
        const correctAncientStylePrefix2 = ancientRealistic2StylePrompt
        
        // 错误风格关键词列表（用于检测AI是否输出了错误的风格）
        const wrongStylePatterns = [
          /电影级CG动漫/,
          /国漫3D动画/,
          /高细节动漫发丝/,
          /PBR材质渲染/,
          /笔触线条清晰/,
          /动漫风格/,
          /CG动漫/,
          /3D动画/,
        ]

        const prompts = allSegments.map(segment => {
          let prompt = segment.trim()

          // 古风写实风格后处理：校验并修正风格描述
          if ((isAncientRealistic || isAncientRealistic2) && prompt.length > 10) {
            const stylePrefix = isAncientRealistic2 ? correctAncientStylePrefix2 : correctAncientStylePrefix
            // 检查是否包含错误风格关键词
            const hasWrongStyle = wrongStylePatterns.some(pattern => pattern.test(prompt))
            // 检查是否以正确的古风写实风格开头
            const hasCorrectPrefix = prompt.startsWith(stylePrefix)

            if (hasWrongStyle || !hasCorrectPrefix) {
              // 尝试找到并替换错误的风格描述行
              const lines = prompt.split('\n')
              let styleFixed = false

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim()
                // 如果该行包含错误风格关键词，或者是片段标题后的第一行非空行
                if (wrongStylePatterns.some(pattern => pattern.test(line)) ||
                    (i === 1 && line.length > 0 && !line.startsWith('（人物') && !line.startsWith('（场景') && !line.startsWith('分镜时长'))) {
                  lines[i] = stylePrefix
                  styleFixed = true
                  break
                }
              }

              // 如果没有找到可替换的行，但在开头插入了风格描述
              if (!styleFixed && !hasCorrectPrefix) {
                // 找到第一个非空行（跳过片段标题如 "#### 片段1："）
                let insertIndex = 0
                for (let i = 0; i < lines.length; i++) {
                  if (lines[i].trim().startsWith('####') || lines[i].trim().startsWith('【画质风格】')) {
                    insertIndex = i + 1
                    break
                  }
                }
                lines.splice(insertIndex, 0, stylePrefix)
                styleFixed = true
              }

              if (styleFixed) {
                prompt = lines.join('\n')
                console.log('%c【剧本转分镜】古风写实风格已修正', 'color: #4CAF50; font-weight: bold;')
              }
            }
          }

          return {
            id: generateId(),
            prompt
          }
        }).filter(p => p.prompt.length > 10)

        updateSeedance2Data({ videoPrompts: [] })
        await new Promise(resolve => setTimeout(resolve, 10))
        updateSeedance2Data({ videoPrompts: prompts })
      } else if (hasError) {
        setTransformError('部分批次处理失败，请重试')
      } else {
        setTransformError('转换失败')
      }
    } catch (err) {
      setTransformError(err instanceof Error ? err.message : '转换失败')
    } finally {
      setIsTransforming(false)
    }
  }, [scriptText, updateSeedance2Data, getServiceInstance])

  const handleUpdateVideoPrompt = useCallback((id: string, prompt: string) => {
    updateSeedance2Data({
      videoPrompts: videoPrompts.map(p => p.id === id ? { ...p, prompt } : p)
    })
  }, [videoPrompts, updateSeedance2Data])

  const handleRemoveVideoPrompt = useCallback((id: string) => {
    updateSeedance2Data({
      videoPrompts: videoPrompts.filter(p => p.id !== id)
    })
  }, [videoPrompts, updateSeedance2Data])

  const loadLibraryImages = useCallback(async (type: 'character' | 'prop' | 'scene' | 'generated') => {
    const libraryPath = libraryPaths[type]
    if (!libraryPath) {
      setLibraryImages([])
      return
    }

    setIsLoadingLibrary(true)
    try {
      const fs = await import('@tauri-apps/plugin-fs')
      const pathExists = await fs.exists(libraryPath)

      if (!pathExists) {
        setLibraryImages([])
        return
      }

      const entries = await fs.readDir(libraryPath)
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']

      const images: LibraryImage[] = entries
        .filter(entry =>
          entry.isFile === true && entry.name && imageExtensions.some(ext => entry.name.toLowerCase().endsWith(ext))
        )
        .map(entry => {
          const filePath = `${libraryPath}\\${entry.name}`
          return {
            id: entry.name,
            name: entry.name,
            path: filePath,
            preview: getAssetUrl(filePath),
          }
        })

      setLibraryImages(images)
    } catch (err) {
      console.error(`[Seedance2] 加载${type}库失败:`, err)
      setLibraryImages([])
    } finally {
      setIsLoadingLibrary(false)
    }
  }, [libraryPaths])

  useEffect(() => {
    if (activeLibrary && activeLibrary !== 'local') {
      loadLibraryImages(activeLibrary)
    }
  }, [activeLibrary, loadLibraryImages])

  const handleFileSelect = useCallback(async () => {
    setShowMaterialMenu(false)
    setIsSelectingFile(true)

    const selected = await open({
      multiple: true,
      filters: [{ name: '所有媒体', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'mp3', 'wav', 'ogg', 'mp4', 'avi', 'mov', 'webm'] }],
    })

    if (!selected || !selectedVideoId) {
      setIsSelectingFile(false)
      return
    }

    // 保持用户选择的顺序
    const filePaths = Array.isArray(selected) ? selected : [selected]

    const currentVideo = videoItems.find(v => v.id === selectedVideoId)
    if (!currentVideo) {
      setIsSelectingFile(false)
      return
    }

    const currentImageCount = currentVideo.materials.filter(m => m.type === 'image').length
    const currentVideoCount = currentVideo.materials.filter(m => m.type === 'video').length
    const currentAudioCount = currentVideo.materials.filter(m => m.type === 'audio').length

    // 按用户选择顺序处理文件，但按类型分组
    const imageFiles: { path: string; name: string; preview: string }[] = []
    const videoFiles: { path: string; name: string; preview: string }[] = []
    const audioFiles: { path: string; name: string }[] = []
    const MAX_AUDIO_DURATION = 15.2 // Seedance 2.0 音频时长限制
    
    // 第一步：按用户选择顺序分类文件
    for (const filePath of filePaths) {
      const fileName = filePath.split(/[/\\]/).pop() || ''
      const ext = fileName.split('.').pop()?.toLowerCase() || ''

      if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(ext)) {
        audioFiles.push({ path: filePath, name: fileName })
      } else if (['mp4', 'avi', 'mov', 'webm', 'mkv', 'wmv'].includes(ext)) {
        videoFiles.push({ path: filePath, name: fileName, preview: '' })
      } else {
        imageFiles.push({ path: filePath, name: fileName, preview: getAssetUrl(filePath) })
      }
    }
    
    // 检测音频总时长
    if (audioFiles.length > 0) {
      const MIN_AUDIO_DURATION = 1.8 // Seedance 2.0 音频最小时长要求
      let totalDuration = 0
      const audioDurations: { name: string; duration: number }[] = []
      
      for (const audioFile of audioFiles) {
        const duration = await getAudioDurationViaTauri(audioFile.path)
        totalDuration += duration
        audioDurations.push({ name: audioFile.name, duration })
      }
      
      console.log('[Seedance2Panel] 音频时长检测:', audioDurations.map(d => `${d.name}: ${formatDuration(d.duration)}`).join(', '))
      console.log(`[Seedance2Panel] 音频总时长: ${formatDuration(totalDuration)}, 限制: ${MIN_AUDIO_DURATION}-${MAX_AUDIO_DURATION}秒`)
      
      if (totalDuration > MAX_AUDIO_DURATION) {
        const exceededBy = totalDuration - MAX_AUDIO_DURATION
        addToast({
          type: 'error',
          title: '音频时长超限',
          message: `音频总时长 ${formatDuration(totalDuration)} 超过限制 ${MAX_AUDIO_DURATION}秒，超出 ${formatDuration(exceededBy)}。请裁剪音频后重试。`,
          duration: 5000,
        })
        setIsSelectingFile(false)
        return
      }
      
      if (totalDuration < MIN_AUDIO_DURATION) {
        const insufficientBy = MIN_AUDIO_DURATION - totalDuration
        addToast({
          type: 'error',
          title: '音频时长不足',
          message: `音频总时长 ${formatDuration(totalDuration)} 小于最低要求 ${MIN_AUDIO_DURATION}秒，还差 ${formatDuration(insufficientBy)}。请添加更多音频或更换更长的音频。`,
          duration: 5000,
        })
        setIsSelectingFile(false)
        return
      }
    }

    // 第二步：按顺序添加素材（图片 -> 视频 -> 音频），保持用户选择的顺序
    const newMaterials: Seedance2MaterialItem[] = []
    let addedImages = 0
    let addedVideos = 0
    let addedAudios = 0
    let skippedImages = 0
    let skippedVideos = 0
    let skippedAudios = 0

    // 先添加图片（保持用户选择顺序）
    for (const imgFile of imageFiles) {
      if (currentImageCount + addedImages >= MAX_IMAGES) {
        skippedImages++
        continue
      }

      newMaterials.push({
        id: generateId(),
        preview: imgFile.preview,
        type: 'image',
        index: currentImageCount + addedImages + 1,
        name: imgFile.name,
        path: imgFile.path,
        loadTime: Date.now(),
      })
      addedImages++
    }

    // 再添加视频（保持用户选择顺序）
    for (const vidFile of videoFiles) {
      if (currentVideoCount + addedVideos >= MAX_VIDEOS) {
        skippedVideos++
        continue
      }

      newMaterials.push({
        id: generateId(),
        preview: vidFile.preview,
        type: 'video',
        index: currentVideoCount + addedVideos + 1,
        name: vidFile.name,
        path: vidFile.path,
        loadTime: Date.now(),
      })
      addedVideos++
    }

    // 最后添加音频（保持用户选择顺序）
    for (const audioFile of audioFiles) {
      if (currentAudioCount + addedAudios >= MAX_AUDIOS) {
        skippedAudios++
        continue
      }

      newMaterials.push({
        id: generateId(),
        preview: '',
        type: 'audio',
        index: currentAudioCount + addedAudios + 1,
        name: audioFile.name,
        path: audioFile.path,
        loadTime: Date.now(),
      })
      addedAudios++
    }

    if (skippedImages > 0 || skippedVideos > 0 || skippedAudios > 0) {
      const messages: string[] = []
      if (skippedImages > 0) messages.push(`图片已达上限(${MAX_IMAGES}张)`)
      if (skippedVideos > 0) messages.push(`视频已达上限(${MAX_VIDEOS}个)`)
      if (skippedAudios > 0) messages.push(`音频已达上限(${MAX_AUDIOS}个)`)
      addToast({
        type: 'warning',
        title: '部分素材未添加',
        message: messages.join('，')
      })
    }

    if (newMaterials.length === 0) {
      setIsSelectingFile(false)
      return
    }

    updateSeedance2Data({
      videoItems: videoItems.map(v => {
        if (v.id === selectedVideoId) {
          return { ...v, materials: [...v.materials, ...newMaterials] }
        }
        return v
      })
    })
    
    setSpreadPokerId(null)
    setIsSelectingFile(false)
  }, [selectedVideoId, videoItems, updateSeedance2Data, getAssetUrl, addToast])

  const handleMenuOption = useCallback((type: 'character' | 'prop' | 'scene' | 'generated' | 'local') => {
    if (type === 'local') {
      handleFileSelect()
    } else {
      setActiveLibrary(type)
      setShowMaterialMenu(false)
    }
  }, [handleFileSelect])

  const getMaterialIcon = (type: MaterialType) => {
    switch (type) {
      case 'audio':
        return <span style={{ fontSize: '20px' }}>🎵</span>
      case 'video':
        return <span style={{ fontSize: '20px' }}>🎬</span>
      default:
        return <ImageIcon size={24} />
    }
  }

  const getMaterialPreview = (material: Seedance2MaterialItem) => {
    if (material.type === 'image' && material.preview) {
      return (
        <LazyImage
          src={getAssetUrl(material.preview)}
          alt={material.name || '素材'}
          timestamp={material.loadTime}
        />
      )
    }
    return (
      <div className={styles.materialPlaceholder} style={{ justifyContent: 'center', gap: '4px' }}>
        {getMaterialIcon(material.type)}
        <span style={{ fontSize: '8px', color: 'var(--color-text-tertiary)', textAlign: 'center', wordBreak: 'break-all', lineHeight: '1.1', maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {material.name}
        </span>
      </div>
    )
  }

  const handleSelectLibraryImage = useCallback((image: { id: string, name: string, path: string, preview: string }) => {
    if (!selectedVideoId) return

    const currentVideo = videoItems.find(v => v.id === selectedVideoId)
    if (!currentVideo) return

    const typeCount = currentVideo.materials.filter(m => m.type === 'image').length
    if (typeCount >= MAX_IMAGES) {
      addToast({
        type: 'warning',
        title: '图片数量已达上限',
        message: `最多只能添加 ${MAX_IMAGES} 张图片`
      })
      return
    }

    const material = {
      id: generateId(),
      preview: image.preview,
      type: 'image' as MaterialType,
      index: typeCount + 1,
      name: image.name,
      path: image.path,
      loadTime: Date.now(),
    }

    updateSeedance2Data({
      videoItems: videoItems.map(v => {
        if (v.id === selectedVideoId) {
          return { ...v, materials: [...v.materials, material] }
        }
        return v
      })
    })
    
    // 添加成功后显示提示，但不关闭素材库面板，允许连续添加
    addToast({
      type: 'success',
      title: '图片已添加',
      message: `已添加 "${image.name}"，可继续选择其他图片`,
      duration: 1500
    })
  }, [selectedVideoId, videoItems, updateSeedance2Data, addToast])

  const handleAddToVideoGeneration = useCallback(() => {
    // 检查是否有正在生成的视频
    if (generatingVideoIds.size > 0) {
      const confirmed = window.confirm(
        `有 ${generatingVideoIds.size} 个视频正在生成中，重置视频列表会导致生成完成后无法自动更新预览。\n\n确定要继续吗？`
      )
      if (!confirmed) {
        return
      }
    }
    
    const newVideos = videoPrompts.map((vp) => ({
      id: generateId(),
      prompt: vp.prompt,
      materials: [],
      previewUrl: undefined
    }))
    
    // 如果已有视频，询问用户选择覆盖还是顺序添加
    if (videoItems.length > 0) {
      const result = window.confirm(
        `当前已有 ${videoItems.length} 个视频镜头。\n\n点击"确定"覆盖原有视频镜头，点击"取消"则在现有视频后顺序添加。`
      )
      
      if (result) {
        // 覆盖模式：清空现有视频，添加新视频
        updateSeedance2Data({ videoItems: [] })
        setTimeout(() => {
          updateSeedance2Data({
            videoItems: newVideos,
            activeTab: 'videoGeneration'
          })
        }, 10)
      } else {
        // 顺序添加模式：在现有视频后面添加新视频
        updateSeedance2Data({
          videoItems: [...videoItems, ...newVideos],
          activeTab: 'videoGeneration'
        })
      }
    } else {
      // 没有现有视频，直接添加
      updateSeedance2Data({
        videoItems: newVideos,
        activeTab: 'videoGeneration'
      })
    }
  }, [videoPrompts, updateSeedance2Data, generatingVideoIds.size, videoItems])

  const handleAddVideo = useCallback((sourceVideoId?: string) => {
    // 获取源视频（传入的ID或当前选中的视频），复制其素材和提示词
    const sourceId = sourceVideoId || selectedVideoId
    const currentVideo = videoItems.find(v => v.id === sourceId)
    const newVideo = {
      id: generateId(),
      prompt: currentVideo?.prompt || '',
      materials: currentVideo?.materials ? [...currentVideo.materials] : [],
      previewUrl: undefined
    }
    // 插入到源视频项的下方
    const sourceIndex = videoItems.findIndex(v => v.id === sourceId)
    const insertIndex = sourceIndex >= 0 ? sourceIndex + 1 : videoItems.length
    const newVideoItems = [...videoItems]
    newVideoItems.splice(insertIndex, 0, newVideo)
    updateSeedance2Data({
      videoItems: newVideoItems
    })
  }, [videoItems, selectedVideoId, updateSeedance2Data])

  const handleRemoveVideo = useCallback((videoId: string) => {
    if (videoItems.length <= 1) return
    updateSeedance2Data({
      videoItems: videoItems.filter(v => v.id !== videoId)
    })
  }, [videoItems, updateSeedance2Data])

  // 恢复单个视频（当视频加载失败时自动调用）
  // silent 为 true 时不显示 toast 提示
  const handleRestoreSingleVideo = useCallback(async (videoId: string, videoIndex: number, silent: boolean = true) => {
    if (!activeTask?.path) {
      console.log('[Seedance2] 无法恢复视频：没有活动项目路径')
      return
    }

    try {
      console.log(`[Seedance2] 尝试恢复视频 ${videoIndex} (ID: ${videoId})`)
      
      const savedVideos = await getSavedVideos(activeTask.path)
      const savedVideo = savedVideos.find(v => v.videoItemId === videoId)
      
      if (savedVideo) {
        const { seedance2Data, saveProjectImmediately } = useAppStore.getState()
        const updatedVideoItems = seedance2Data.videoItems.map(v =>
          v.id === videoId ? { ...v, previewUrl: convertFileSrc(savedVideo.path) } : v
        )
        
        updateSeedance2Data({ videoItems: updatedVideoItems })
        
        // 立即保存项目，确保持久化
        await saveProjectImmediately()
        
        if (!silent) {
          addToast({
            type: 'success',
            title: '视频已恢复',
            message: `视频 ${videoIndex} 已从本地文件恢复`
          })
        }
        
        console.log(`[Seedance2] 视频 ${videoIndex} 恢复成功并已保存:`, savedVideo.path)
      } else {
        console.log(`[Seedance2] 未找到视频 ${videoIndex} 的本地文件`)
      }
    } catch (error) {
      console.error(`[Seedance2] 恢复视频 ${videoIndex} 失败:`, error)
      if (!silent) {
        addToast({
          type: 'error',
          title: '恢复失败',
          message: error instanceof Error ? error.message : '恢复视频失败'
        })
      }
    }
  }, [activeTask?.path, addToast, updateSeedance2Data])

  // 从本地恢复已保存的视频
  const handleRestoreSavedVideos = useCallback(async () => {
    if (!activeTask?.path) {
      addToast({
        type: 'error',
        title: '恢复失败',
        message: '没有活动项目'
      })
      return
    }

    try {
      addToast({
        type: 'info',
        title: '正在恢复',
        message: '正在检测视频状态并查找已保存的视频...'
      })

      // 获取已保存的视频文件
      const savedVideos = await getSavedVideos(activeTask.path)
      
      if (savedVideos.length === 0) {
        addToast({
          type: 'warning',
          title: '没有已保存的视频',
          message: '未找到本地保存的视频文件'
        })
        return
      }

      // 获取当前的视频项
      const { seedance2Data, saveProjectImmediately } = useAppStore.getState()
      const currentVideoItems = [...seedance2Data.videoItems]
      
      // 记录恢复了多少个视频
      let restoredCount = 0
      let replacedCount = 0
      
      // 处理所有视频项
      for (let i = 0; i < currentVideoItems.length; i++) {
        const video = currentVideoItems[i]

        // 条件：没有预览视频（previewUrl 为空）
        if (!video.previewUrl) {
          // 按 videoItemId 查找已保存的视频（支持新格式和旧格式兼容）
          const savedVideo = savedVideos.find(v => v.videoItemId === video.id)

          if (savedVideo) {
            // 恢复视频，不改变提示词
            currentVideoItems[i] = {
              ...video,
              previewUrl: convertFileSrc(savedVideo.path)
            }
            
            if (!video.previewUrl) {
              restoredCount++
            } else {
              replacedCount++
            }
          }
        }
      }

      updateSeedance2Data({ videoItems: currentVideoItems })
      
      // 立即保存项目，确保持久化
      if (restoredCount > 0 || replacedCount > 0) {
        await saveProjectImmediately()
      }
      
      // 构建提示消息
      let message = ''
      if (restoredCount > 0 && replacedCount > 0) {
        message = `已恢复 ${restoredCount} 个新视频，替换 ${replacedCount} 个失效视频`
      } else if (restoredCount > 0) {
        message = `已为 ${restoredCount} 个视频镜头添加视频`
      } else if (replacedCount > 0) {
        message = `已替换 ${replacedCount} 个失效视频`
      }
      
      if (restoredCount > 0 || replacedCount > 0) {
        addToast({
          type: 'success',
          title: '恢复成功',
          message
        })
      } else {
        addToast({
          type: 'info',
          title: '没有可恢复的视频',
          message: '所有视频均正常，无需恢复'
        })
      }
    } catch (error) {
      console.error('[Seedance2] 恢复视频失败:', error)
      addToast({
        type: 'error',
        title: '恢复失败',
        message: error instanceof Error ? error.message : '恢复视频失败'
      })
    }
  }, [activeTask?.path, addToast, updateSeedance2Data])

  const handleRemoveMaterial = useCallback((videoId: string, materialId: string) => {
    const video = videoItems.find(v => v.id === videoId)
    if (!video) return
    
    const removedMaterial = video.materials.find(m => m.id === materialId)
    if (!removedMaterial) return
    
    const removedType = removedMaterial.type
    const newMaterials = video.materials.filter(m => m.id !== materialId)
    
    let typeCounter = 1
    const updatedMaterials = newMaterials.map(m => {
      if (m.type === removedType) {
        return { ...m, index: typeCounter++ }
      }
      return m
    })
    
    updateSeedance2Data({
      videoItems: videoItems.map(v => {
        if (v.id === videoId) {
          return { ...v, materials: updatedMaterials }
        }
        return v
      })
    })
  }, [videoItems, updateSeedance2Data])

  const handleMaterialClick = useCallback((e: React.MouseEvent, videoId: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenuPosition({
      x: rect.left + rect.width / 2,
      y: rect.top
    })
    setSelectedVideoId(videoId)
    setShowMaterialMenu(true)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMaterialMenu(false)
      }
    }

    if (showMaterialMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMaterialMenu])

  useEffect(() => {
    if (!showMaterialMenu && !activeLibrary && !isSelectingFile) {
      setSpreadPokerId(null)
    }
  }, [showMaterialMenu, activeLibrary, isSelectingFile])

  const handleUpdatePrompt = useCallback((videoId: string, prompt: string) => {
    updateSeedance2Data({
      videoItems: videoItems.map(v => v.id === videoId ? { ...v, prompt } : v)
    })
  }, [videoItems, updateSeedance2Data])

  const getMentionText = useCallback((material: Seedance2MaterialItem): string => {
    if (material.type === 'image') {
      return `@图${material.index}`
    } else if (material.type === 'video') {
      return `@视频${material.index}`
    } else if (material.type === 'audio') {
      return `@音频${material.index}`
    }
    return ''
  }, [])

  // 将提示词中的 @引用 转换为 RunningHub 格式
  const convertPromptToRunningHubFormat = useCallback((prompt: string): string => {
    // 替换 @图1, @图2, ... 为 image 1, image 2, ... (带空格)
    let converted = prompt.replace(/@图(\d+)/g, 'image $1')
    // 替换 @视频1, @视频2, ... 为 video 1, video 2, ... (带空格)
    converted = converted.replace(/@视频(\d+)/g, 'video $1')
    // 替换 @音频1, @音频2, ... 为 audio 1, audio 2, ... (带空格)
    converted = converted.replace(/@音频(\d+)/g, 'audio $1')
    return converted
  }, [])

  const handlePromptKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === '@' || e.key === 'Process' || e.keyCode === 50 && e.shiftKey) {
      justTypedAtRef.current = true
    }

    if (mentionPopup.show) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setMentionPopup(prev => ({ ...prev, show: false }))
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const items = mentionPopupRef.current?.querySelectorAll('[data-mention-item]')
        if (items && items.length > 0) {
          const currentIndex = mentionPopup.selectedIndex
          const nextIndex = e.key === 'ArrowDown'
            ? (currentIndex + 1) % items.length
            : (currentIndex - 1 + items.length) % items.length
          setMentionPopup(prev => ({ ...prev, selectedIndex: nextIndex }))
          
          setTimeout(() => {
            const targetItem = items[nextIndex] as HTMLElement
            targetItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          }, 0)
        }
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const items = mentionPopupRef.current?.querySelectorAll('[data-mention-item]')
        if (items && items.length > 0) {
          const targetItem = items[mentionPopup.selectedIndex] as HTMLElement
          targetItem.click()
        }
        return
      }
    }
  }, [mentionPopup.show, mentionPopup.selectedIndex])

  const handlePromptInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>, videoId: string) => {
    const textarea = e.currentTarget
    const value = textarea.value
    const cursorPos = textarea.selectionStart

    let foundAtPos = -1
    for (let i = cursorPos - 1; i >= 0; i--) {
      const char = value[i]
      if (char === '@') {
        const textBetween = value.substring(i + 1, cursorPos)
        if (!textBetween.includes(' ') && !textBetween.includes('\n')) {
          foundAtPos = i
        }
        break
      }
      if (char === ' ' || char === '\n') {
        break
      }
    }
    
    if (foundAtPos !== -1) {
      const textAfterAt = value.substring(foundAtPos + 1, cursorPos)
      
      const completeMentionPattern = /^(图|图片|视频|音频)\d+/
      if (completeMentionPattern.test(textAfterAt)) {
        if (mentionPopup.show) {
          setMentionPopup(prev => ({ ...prev, show: false }))
        }
        justTypedAtRef.current = false
        return
      }
      
      if (!justTypedAtRef.current) {
        justTypedAtRef.current = false
        return
      }
      
      const currentVideo = videoItems.find(v => v.id === videoId)
      if (currentVideo && currentVideo.materials.length > 0) {
        const textareaRect = textarea.getBoundingClientRect()
        const style = getComputedStyle(textarea)
        const lineHeight = parseInt(style.lineHeight) || 22
        const paddingLeft = parseInt(style.paddingLeft) || 12
        const paddingTop = parseInt(style.paddingTop) || 12
        const scrollTop = textarea.scrollTop

        const textBeforeAt = value.substring(0, foundAtPos + 1)
        const linesBeforeAt = textBeforeAt.split('\n')
        const textAtLine = linesBeforeAt[linesBeforeAt.length - 1]

        const span = document.createElement('span')
        span.style.cssText = `
          position: absolute;
          visibility: hidden;
          white-space: pre;
          font-family: ${style.fontFamily};
          font-size: ${style.fontSize};
          line-height: ${style.lineHeight};
        `
        span.textContent = textAtLine
        document.body.appendChild(span)
        const atSymbolWidth = span.offsetWidth
        document.body.removeChild(span)

        const popupY = textareaRect.top + paddingTop + (linesBeforeAt.length - 1) * lineHeight - scrollTop + lineHeight / 2 + 8
        const popupX = textareaRect.left + paddingLeft + atSymbolWidth

        const popupWidth = 220
        const popupHeight = 240

        const finalPopupX = Math.max(10, Math.min(popupX, window.innerWidth - popupWidth - 10))
        const finalPopupY = popupY + popupHeight > window.innerHeight - 10 
          ? popupY - popupHeight - lineHeight / 2 
          : popupY

        setMentionPopup({
          show: true,
          videoId,
          position: { x: finalPopupX, y: finalPopupY },
          filterText: textAfterAt.toLowerCase(),
          cursorPosition: cursorPos,
          selectedIndex: 0,
        })
        justTypedAtRef.current = false
        return
      }
    }

    justTypedAtRef.current = false
    if (mentionPopup.show) {
      setMentionPopup(prev => ({ ...prev, show: false }))
    }
  }, [videoItems, mentionPopup.show])

  const handleMentionSelect = useCallback((material: Seedance2MaterialItem) => {
    if (!mentionPopup.videoId) return

    const currentVideo = videoItems.find(v => v.id === mentionPopup.videoId)
    if (!currentVideo) return

    const textarea = textareaRefs.current.get(mentionPopup.videoId)
    if (!textarea) return

    const value = currentVideo.prompt
    const cursorPos = mentionPopup.cursorPosition
    const atPos = value.lastIndexOf('@', cursorPos - 1)
    
    if (atPos === -1) return

    const mentionText = getMentionText(material)
    const newValue = value.substring(0, atPos) + mentionText + value.substring(cursorPos)
    const newCursorPos = atPos + mentionText.length

    handleUpdatePrompt(mentionPopup.videoId, newValue)
    
    setMentionPopup(prev => ({ ...prev, show: false }))

    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }, [mentionPopup, videoItems, handleUpdatePrompt, getMentionText])

  const getFilteredMaterials = useCallback((materials: Seedance2MaterialItem[], filterText: string): Seedance2MaterialItem[] => {
    if (!filterText) return materials
    
    return materials.filter(m => {
      const typeLabel = m.type === 'image' ? '图' : m.type === 'video' ? '视频' : '音频'
      const searchText = `${typeLabel}${m.index}`.toLowerCase()
      return searchText.includes(filterText) || filterText.includes(typeLabel)
    })
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (mentionPopupRef.current && !mentionPopupRef.current.contains(e.target as Node)) {
        const textarea = mentionPopup.videoId ? textareaRefs.current.get(mentionPopup.videoId) : null
        if (textarea && e.target !== textarea) {
          setMentionPopup(prev => ({ ...prev, show: false }))
        }
      }
    }

    if (mentionPopup.show) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [mentionPopup.show, mentionPopup.videoId])

  const getLibraryName = (type: 'character' | 'prop' | 'scene' | 'generated' | 'local') => {
    switch (type) {
      case 'character': return '角色库'
      case 'prop': return '道具库'
      case 'scene': return '场景库'
      case 'generated': return '生成图库'
      case 'local': return '本地文件'
      default: return ''
    }
  }

  const handleGenerateVideo = useCallback(async (videoItem: Seedance2VideoItem) => {
    // 从 store 获取最新的视频数据，避免使用过期闭包中的 videoItem
    const { seedance2Data: currentSeedance2Data } = useAppStore.getState()
    const latestVideoItem = currentSeedance2Data.videoItems.find(v => v.id === videoItem.id)
    const targetVideoItem = latestVideoItem || videoItem

    if (!targetVideoItem.prompt.trim()) {
      useAppStore.getState().addToast({
        type: 'error',
        title: '生成失败',
        message: '请输入视频提示词'
      })
      return
    }

    // 检查是否已有预览视频（防止重复生成浪费算力）
    if (targetVideoItem.previewUrl) {
      const confirmResult = window.confirm(
        '该视频已生成过，重新生成将消耗额外算力资源。\n\n确认要重新生成吗？'
      )
      if (!confirmResult) {
        return
      }
    }

    // 限制同时生成的视频数量（避免过多并发消耗算力）
    if (generatingVideoIds.size >= 2) {
      useAppStore.getState().addToast({
        type: 'warning',
        title: '生成限制',
        message: `当前已有 ${generatingVideoIds.size} 个视频在生成中，请等待完成后再继续`
      })
      return
    }

    const duration = targetVideoItem.duration ?? 15
    console.log(`[Seedance2] 生成视频时长: ${duration}, videoId: ${videoItem.id}, latestDuration: ${latestVideoItem?.duration}`)

    // 记录生成入口日志（用于诊断时长问题）
    const logShotNumber = String(currentSeedance2Data.videoItems.findIndex(v => v.id === videoItem.id) + 1)
    videoLog.info('Seedance2 开始生成视频', {
      provider: selectedProvider,
      model: selectedModel,
      shotNumber: logShotNumber,
      requestParams: {
        duration: duration,
        durationType: typeof duration,
        durationString: String(duration),
        videoItemDuration: videoItem.duration,
        latestVideoItemDuration: latestVideoItem?.duration,
        aspectRatio: selectedAspectRatio,
        resolution: selectedResolution,
        provider: selectedProvider,
        model: selectedModel,
      },
      extra: {
        videoId: videoItem.id,
        prompt: targetVideoItem.prompt.substring(0, 100) + (targetVideoItem.prompt.length > 100 ? '...' : ''),
        materialsCount: targetVideoItem.materials.length,
      },
    })

    // 验证音频总时长
    const audioMaterials = targetVideoItem.materials.filter(m => m.type === 'audio' && m.path)
    if (audioMaterials.length > 0) {
      const MAX_AUDIO_DURATION = 15.2
      const MIN_AUDIO_DURATION = 1.8
      let totalDuration = 0
      const audioDurations: { name: string; duration: number }[] = []

      for (const audio of audioMaterials) {
        const duration = await getAudioDurationViaTauri(audio.path!)
        totalDuration += duration
        audioDurations.push({ name: audio.name || '未知音频', duration })
      }

      console.log('[Seedance2Panel] 生成前音频时长检测:', audioDurations.map(d => `${d.name}: ${formatDuration(d.duration)}`).join(', '))
      console.log(`[Seedance2Panel] 生成前音频总时长: ${formatDuration(totalDuration)}, 要求: ${MIN_AUDIO_DURATION}-${MAX_AUDIO_DURATION}秒`)

      if (totalDuration > MAX_AUDIO_DURATION) {
        const exceededBy = totalDuration - MAX_AUDIO_DURATION
        useAppStore.getState().addToast({
          type: 'error',
          title: '音频时长超限',
          message: `音频总时长 ${formatDuration(totalDuration)} 超过限制 ${MAX_AUDIO_DURATION}秒，超出 ${formatDuration(exceededBy)}。请删除或替换音频后重试。`,
          duration: 5000,
        })
        return
      }

      if (totalDuration < MIN_AUDIO_DURATION) {
        const insufficientBy = MIN_AUDIO_DURATION - totalDuration
        useAppStore.getState().addToast({
          type: 'error',
          title: '音频时长不足',
          message: `音频总时长 ${formatDuration(totalDuration)} 小于最低要求 ${MIN_AUDIO_DURATION}秒，还差 ${formatDuration(insufficientBy)}。请添加更多音频或更换更长的音频。`,
          duration: 5000,
        })
        return
      }
    }

    if (selectedProvider === 'volcengine') {
      const volcarkConfig = apiConfigs.volcark
      if (!volcarkConfig?.apiKey) {
        useAppStore.getState().addToast({
          type: 'error',
          title: '生成失败',
          message: '请先配置火山方舟 API Key'
        })
        return
      }

      if (selectedModel === 'custom' && !customModelId.trim()) {
        useAppStore.getState().addToast({
          type: 'error',
          title: '生成失败',
          message: '请输入自定义模型ID'
        })
        return
      }
    } else if (selectedProvider === 'runninghub' || selectedProvider === 'runninghub-enterprise') {
      const runninghubConfig = apiConfigs.runninghub
      if (!runninghubConfig?.apiKey) {
        useAppStore.getState().addToast({
          type: 'error',
          title: '生成失败',
          message: '请先配置 RunningHub API Key'
        })
        return
      }
    }

    // 先标记正在生成（ref 同步更新，避免竞态）
    generatingRef.current.add(videoItem.id)

    // 清空当前视频的预览URL
    updateSeedance2Data({
      videoItems: videoItems.map(v =>
        v.id === videoItem.id ? { ...v, previewUrl: undefined, taskId: undefined } : v
      )
    })

    setGeneratingVideoIds(prev => new Set(prev).add(videoItem.id))
    setVideoProgress(prev => ({
      ...prev,
      [videoItem.id]: { progress: 0, status: 'pending', message: '正在创建任务...' }
    }))
    cancelFlagsRef.current.set(videoItem.id, false)

    let taskId: string | undefined
    let videoUrl: string | undefined
    // 从 store 获取最新的 videoItems，避免闭包问题
    const latestVideoItemsForIndex = useAppStore.getState().seedance2Data.videoItems
    const taskIndex = latestVideoItemsForIndex.findIndex(v => v.id === videoItem.id) + 1

    try {
      const materialsWithUrls: Seedance2MaterialItem[] = targetVideoItem.materials
        .filter(m => m.type === 'image' || m.type === 'video' || m.type === 'audio')
        .map(m => ({
          ...m,
          url: m.path ? getAssetUrl(m.path) : m.preview
        }))

      if (selectedProvider === 'volcengine') {
        const volcarkConfig = apiConfigs.volcark
        if (!volcarkConfig?.apiKey) {
          throw new Error('火山引擎 API Key 未配置')
        }

        const service = new SeedanceService(volcarkConfig!, {
          accessKey: volcarkConfig.accessKey || '',
          secretKey: volcarkConfig.secretKey || '',
          bucket: volcarkConfig.bucket,
          region: volcarkConfig.region || 'cn-beijing',
        })

        const modelMap: Record<string, string> = {
          'seedance-2.0': 'doubao-seedance-2-0-260128',
          'seedance-2.0-fast': 'doubao-seedance-2-0-fast-260128',
        }

        const modelToUse = selectedModel === 'custom' ? customModelId : (modelMap[selectedModel] || 'doubao-seedance-2-0-fast-260128')

        console.log(`[Seedance2] 开始创建视频任务，模型: ${modelToUse}`)
        
        // 组合全局提示词和单个视频提示词
        const combinedPrompt = globalPrompt
          ? `${targetVideoItem.prompt}\n\n【全局提示词】${globalPrompt}`
          : targetVideoItem.prompt
        
        const { success, taskId: tid, error } = await service.createVideoTask({
          prompt: combinedPrompt,
          model: modelToUse,
          materials: materialsWithUrls,
          aspectRatio: selectedAspectRatio,
          resolution: selectedResolution,
          duration: duration,
          generateAudio: true,
        })

        if (!success || !tid) {
          const errorMsg = error || '创建任务失败'
          console.error('[Seedance2] 创建任务失败:', errorMsg)
          
          // 记录失败到日志
          videoLog.error('Seedance2 火山引擎创建任务失败', {
            provider: 'volcengine',
            model: modelToUse,
            shotNumber: String(taskIndex),
            errorMessage: errorMsg,
            extra: {
              prompt: targetVideoItem.prompt,
              aspectRatio: selectedAspectRatio,
              resolution: selectedResolution,
              duration: duration,
              materialsCount: materialsWithUrls.length,
            },
          })

          // 记录失败到历史
          if (activeTask?.path) {
            await saveSeedanceResult(activeTask.path, {
              id: videoItem.id,
              taskId: 'failed-create-' + Date.now(),
              prompt: targetVideoItem.prompt,
              model: modelToUse,
              aspectRatio: selectedAspectRatio,
              resolution: selectedResolution,
              duration: duration,
              createdAt: Date.now(),
              status: 'failed',
              error: `创建任务失败: ${errorMsg}`,
            })
          }
          
          throw new Error(errorMsg)
        }

        taskId = tid
        console.log(`[Seedance2] 任务创建成功, taskId: ${taskId}`)

        // 存储 taskId 以便取消时使用
        taskIdsRef.current.set(videoItem.id, taskId)
        
        // 保存 taskId 到 videoItem 并持久化（使用 getState 取最新值，避免闭包旧值）
        const latestItems = useAppStore.getState().seedance2Data.videoItems
        updateSeedance2Data({
          videoItems: latestItems.map(v => v.id === videoItem.id ? { ...v, taskId } : v)
        })
        saveProjectImmediately()

        setVideoProgress(prev => ({
          ...prev,
          [videoItem.id]: { progress: 10, status: 'queued', message: '任务排队中...' }
        }))

        const result = await service.waitForCompletion(
          taskId,
          (progress, status, message) => {
            setVideoProgress(prev => ({
              ...prev,
              [videoItem.id]: { progress: Math.min(90, 10 + progress), status, message }
            }))
          },
          5000,
          6000000,
          () => cancelFlagsRef.current.get(videoItem.id) || false
        )

        if (result.success && result.videoUrl) {
          videoUrl = result.videoUrl
          console.log(`[Seedance2] 视频生成成功: ${videoUrl}`)
        } else {
          const errorMsg = result.error || '生成失败'
          console.error('[Seedance2] 生成失败:', errorMsg)
          
          // 记录失败到日志
          videoLog.error('Seedance2 火山引擎视频生成失败', {
            provider: 'volcengine',
            model: modelToUse,
            shotNumber: String(taskIndex),
            taskId: taskId,
            errorMessage: errorMsg,
            extra: {
              prompt: targetVideoItem.prompt,
              aspectRatio: selectedAspectRatio,
              resolution: selectedResolution,
              duration: duration,
            },
          })

          // 记录失败到历史
          if (activeTask?.path) {
            await saveSeedanceResult(activeTask.path, {
              id: videoItem.id,
              taskId: taskId || 'failed-' + Date.now(),
              prompt: targetVideoItem.prompt,
              model: modelToUse,
              aspectRatio: selectedAspectRatio,
              resolution: selectedResolution,
              duration: duration,
              createdAt: Date.now(),
              status: 'failed',
              error: errorMsg,
            })
          }
          
          throw new Error(errorMsg)
        }
      } else if (selectedProvider === 'runninghub') {
        const runninghubConfig = apiConfigs.runninghub
        const service = new RunningHubService(runninghubConfig!)

        const runninghubMappingId = selectedModel === 'seedance-2.0-fast' 
          ? 'runninghub-seedance-2-0-fast' 
          : 'runninghub-seedance-2-0'
        const runninghubMapping = DEFAULT_RUNNINGHUB_MAPPINGS.find(m => m.id === runninghubMappingId)
        if (!runninghubMapping) {
          throw new Error('未找到 RunningHub 视频生成映射配置')
        }

        // 去重：使用 Map 按 path 去重，保留第一个出现的素材
        const uniqueMaterials = new Map<string, typeof targetVideoItem.materials[0]>()
        targetVideoItem.materials.forEach(m => {
          if (m.path && !uniqueMaterials.has(m.path)) {
            uniqueMaterials.set(m.path, m)
          }
        })
        const dedupedMaterials = Array.from(uniqueMaterials.values())

        const imageMaterials = dedupedMaterials.filter(m => m.type === 'image' && m.path)
        const audioMaterials = dedupedMaterials.filter(m => m.type === 'audio' && m.path)

        console.log(`[RunningHub] 素材去重: 原始 ${targetVideoItem.materials.length} 个, 去重后 ${dedupedMaterials.length} 个`)
        console.log(`[RunningHub] 图片: ${imageMaterials.length} 个, 音频: ${audioMaterials.length} 个`)

        const uploadedImageUrls: string[] = []
        for (let i = 0; i < imageMaterials.length; i++) {
          // 检查是否已取消
          if (cancelFlagsRef.current.get(videoItem.id)) {
            console.log(`[RunningHub] 上传图片 ${i + 1} 前检测到取消标志，停止上传`)
            throw new Error('已取消')
          }
          
          const img = imageMaterials[i]
          if (img.path) {
            setVideoProgress(prev => ({
              ...prev,
              [videoItem.id]: { progress: 5 + i * 5, status: 'running', message: `上传图片 ${i + 1}/${imageMaterials.length}...` }
            }))
            console.log(`[RunningHub] 开始上传图片 ${i + 1}/${imageMaterials.length}:`, img.path)
            const uploadResult = await service.uploadImage(img.path)
            if (uploadResult.success && uploadResult.url) {
              uploadedImageUrls.push(uploadResult.url)
              console.log(`[RunningHub] 图片 ${i + 1} 上传成功:`, uploadResult.url)
            } else {
              console.error(`[RunningHub] 图片 ${i + 1} 上传失败:`, uploadResult.error)
              throw new Error(`图片 ${i + 1} 上传失败: ${uploadResult.error || '请检查网络连接或重新选择图片后重试'}`)
            }
          } else {
            console.error(`[RunningHub] 图片 ${i + 1} 没有 path`)
            throw new Error(`图片 ${i + 1} 没有有效的文件路径`)
          }
        }

        // 上传音频文件
        const uploadedAudioUrls: string[] = []
        for (let i = 0; i < audioMaterials.length; i++) {
          // 检查是否已取消
          if (cancelFlagsRef.current.get(videoItem.id)) {
            console.log(`[RunningHub] 上传音频 ${i + 1} 前检测到取消标志，停止上传`)
            throw new Error('已取消')
          }
          
          const audio = audioMaterials[i]
          if (audio.path) {
            setVideoProgress(prev => ({
              ...prev,
              [videoItem.id]: { progress: 5 + imageMaterials.length * 5 + i * 5, status: 'running', message: `上传音频 ${i + 1}/${audioMaterials.length}...` }
            }))
            console.log(`[RunningHub] 开始上传音频 ${i + 1}/${audioMaterials.length}:`, audio.path)
            const uploadResult = await service.uploadAudio(audio.path, true)
            if (uploadResult.success && uploadResult.url) {
              uploadedAudioUrls.push(uploadResult.url)
              console.log(`[RunningHub] 音频 ${i + 1} 上传成功:`, uploadResult.url)
            } else {
              console.error(`[RunningHub] 音频 ${i + 1} 上传失败:`, uploadResult.error)
              throw new Error(`音频 ${i + 1} 上传失败: ${uploadResult.error || '请检查网络连接或重新选择音频后重试'}`)
            }
          } else {
            console.error(`[RunningHub] 音频 ${i + 1} 没有 path`)
            throw new Error(`音频 ${i + 1} 没有有效的文件路径`)
          }
        }

        // 构建 index -> URL 的映射，确保按素材 index 对应
        const imageIndexToUrl = new Map<number, string>()
        imageMaterials.forEach((img, i) => {
          if (uploadedImageUrls[i]) {
            imageIndexToUrl.set(img.index, uploadedImageUrls[i])
          }
        })
        
        const audioIndexToUrl = new Map<number, string>()
        audioMaterials.forEach((aud, i) => {
          if (uploadedAudioUrls[i]) {
            audioIndexToUrl.set(aud.index, uploadedAudioUrls[i])
          }
        })
        
        console.log('[RunningHub] 图片 index 映射:', Array.from(imageIndexToUrl.entries()).map(([k, v]) => `${k}->${v.substring(0, 30)}...`).join(', '))
        console.log('[RunningHub] 音频 index 映射:', Array.from(audioIndexToUrl.entries()).map(([k, v]) => `${k}->${v.substring(0, 30)}...`).join(', '))

        const nodeInfoList: Array<{
          nodeId: string
          fieldName: string
          fieldValue?: string
          fieldData?: string
          description?: string
        }> = []

        // 获取图片和音频节点列表
        const imageNodes = runninghubMapping.nodeInfoList.filter(n => n.fieldName === 'image')
        const audioNodes = runninghubMapping.nodeInfoList.filter(n => n.fieldName === 'audio')

        runninghubMapping.nodeInfoList.forEach((node) => {
          if (node.fieldName === 'image') {
            // 按节点顺序找到对应的 index
            const nodeOrderIndex = imageNodes.findIndex(n => n.nodeId === node.nodeId)
            // 找到对应 index 的素材 URL
            const targetIndex = nodeOrderIndex + 1 // index 从 1 开始
            const url = imageIndexToUrl.get(targetIndex)
            nodeInfoList.push({
              nodeId: node.nodeId,
              fieldName: node.fieldName,
              fieldValue: url || 'None',
              description: node.description,
            })
            console.log(`[RunningHub] 图片节点 ${node.nodeId} -> index ${targetIndex} -> ${url ? '已分配' : 'None'}`)
          } else if (node.fieldName === 'audio') {
            const nodeOrderIndex = audioNodes.findIndex(n => n.nodeId === node.nodeId)
            const targetIndex = nodeOrderIndex + 1
            const url = audioIndexToUrl.get(targetIndex)
            nodeInfoList.push({
              nodeId: node.nodeId,
              fieldName: node.fieldName,
              fieldValue: url || 'None',
              description: node.description,
            })
            console.log(`[RunningHub] 音频节点 ${node.nodeId} -> index ${targetIndex} -> ${url ? '已分配' : 'None'}`)
          } else if (node.fieldName === 'file') {
            nodeInfoList.push({
              nodeId: node.nodeId,
              fieldName: node.fieldName,
              fieldValue: 'None',
              description: node.description,
            })
          } else if (node.fieldName === 'text') {
            // 将提示词转换为 RunningHub 格式，并附加全局提示词
            const combinedPrompt = globalPrompt
              ? `${targetVideoItem.prompt}\n\n【全局提示词】${globalPrompt}`
              : targetVideoItem.prompt
            const convertedPrompt = convertPromptToRunningHubFormat(combinedPrompt)
            nodeInfoList.push({
              nodeId: node.nodeId,
              fieldName: node.fieldName,
              fieldValue: convertedPrompt,
              description: node.description,
            })
          } else if (node.fieldName === 'resolution') {
            nodeInfoList.push({
              nodeId: node.nodeId,
              fieldName: node.fieldName,
              fieldData: '[[\"480p\", \"720p\", \"1080p\", \"2k\", \"4k\"], {\"default\": \"720p\"}]',
              fieldValue: selectedResolution,
              description: node.description,
            })
          } else if (node.fieldName === 'ratio') {
            nodeInfoList.push({
              nodeId: node.nodeId,
              fieldName: node.fieldName,
              fieldData: '[[\"adaptive\", \"16:9\", \"4:3\", \"1:1\", \"3:4\", \"9:16\", \"21:9\"], {\"default\": \"adaptive\"}]',
              fieldValue: selectedAspectRatio,
              description: node.description,
            })
          } else if (node.fieldName === 'duration') {
            nodeInfoList.push({
              nodeId: node.nodeId,
              fieldName: node.fieldName,
              fieldData: '[[\"4\", \"5\", \"6\", \"7\", \"8\", \"9\", \"10\", \"11\", \"12\", \"13\", \"14\", \"15\"], {\"default\": \"5\"}]',
              fieldValue: String(duration),
              description: node.description,
            })
          }
        })

        const payload = {
          nodeInfoList,
          instanceType: 'default',
          usePersonalQueue: 'false',
        }

        const url = `https://www.runninghub.cn/openapi/v2/run/ai-app/${runninghubMapping.appId}`
        
        try {
          console.log('[RunningHub] 提交视频生成任务:', JSON.stringify(payload, null, 2))
          
          // 记录请求到日志
          videoLog.info('Seedance2 RunningHub 提交视频生成任务', {
            provider: 'runninghub',
            model: selectedModel,
            shotNumber: String(taskIndex),
            requestParams: {
              appId: runninghubMapping.appId,
              nodeCount: payload.nodeInfoList.length,
              imageCount: payload.nodeInfoList.filter((n: any) => n.fieldName === 'image').length,
              audioCount: payload.nodeInfoList.filter((n: any) => n.fieldName === 'audio').length,
              duration: duration,
              resolution: selectedResolution,
              aspectRatio: selectedAspectRatio,
            },
          })
          
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${runninghubConfig.apiKey}`,
            },
            body: JSON.stringify(payload),
          })

          console.log('[RunningHub] 响应状态:', response.status)

          if (!response.ok) {
            const errorText = await response.text()
            console.error('[RunningHub] 错误响应:', errorText)
            const errorMsg = `API 请求失败: ${response.status} - ${errorText}`
            
            // 记录失败到日志
            videoLog.error('Seedance2 RunningHub 创建任务失败', {
              provider: 'runninghub',
              model: selectedModel,
              shotNumber: String(taskIndex),
              httpStatus: response.status,
              errorMessage: errorMsg,
              responseBody: errorText,
              extra: {
                appId: runninghubMapping.appId,
                prompt: targetVideoItem.prompt,
              },
            })

            // 记录失败到历史
            if (activeTask?.path) {
              await saveSeedanceResult(activeTask.path, {
                id: videoItem.id,
                taskId: 'failed-submit-' + Date.now(),
                prompt: targetVideoItem.prompt,
                model: 'runninghub',
                aspectRatio: selectedAspectRatio,
                resolution: selectedResolution,
                duration: duration,
                createdAt: Date.now(),
                status: 'failed',
                error: errorMsg,
              })
            }
            
            throw new Error(errorMsg)
          }

          const result = await response.json()
          console.log('[RunningHub] 响应结果:', result)

          if (result.code !== undefined && result.code !== 0) {
            const errorMsg = result.msg || result.message || '请求失败'
            
            // 记录失败到日志
            videoLog.error('Seedance2 RunningHub 返回错误码', {
              provider: 'runninghub',
              model: selectedModel,
              shotNumber: String(taskIndex),
              errorMessage: errorMsg,
              responseBody: result,
              extra: {
                appId: runninghubMapping.appId,
                code: result.code,
                prompt: targetVideoItem.prompt,
              },
            })

            // 记录失败到历史
            if (activeTask?.path) {
              await saveSeedanceResult(activeTask.path, {
                id: videoItem.id,
                taskId: 'failed-submit-' + Date.now(),
                prompt: targetVideoItem.prompt,
                model: 'runninghub',
                aspectRatio: selectedAspectRatio,
                resolution: selectedResolution,
                duration: duration,
                createdAt: Date.now(),
                status: 'failed',
                error: errorMsg,
              })
            }

            throw new Error(errorMsg)
          }

          taskId = result.taskId
          if (!taskId) {
            // 记录未获取到任务ID的错误
            videoLog.error('Seedance2 RunningHub 未获取到任务ID', {
              provider: 'runninghub',
              model: selectedModel,
              shotNumber: String(taskIndex),
              errorMessage: '未获取到任务ID',
              responseBody: result,
              extra: {
                appId: runninghubMapping.appId,
                prompt: targetVideoItem.prompt,
              },
            })
            throw new Error('未获取到任务ID')
          }

          // 存储 taskId 以便取消时使用
          taskIdsRef.current.set(videoItem.id, taskId)
          console.log('[RunningHub] 任务提交成功, taskId:', taskId)
          
          // 保存 taskId 到 videoItem 并持久化（使用 getState 取最新值，避免闭包旧值）
          const latestItems = useAppStore.getState().seedance2Data.videoItems
          updateSeedance2Data({
            videoItems: latestItems.map(v => v.id === videoItem.id ? { ...v, taskId } : v)
          })
          saveProjectImmediately()
          
          setVideoProgress(prev => ({
            ...prev,
            [videoItem.id]: { progress: 10, status: 'queued', message: '任务排队中...' }
          }))

          const queryResult = await service.waitForCompletion(
            taskId,
            (progress, message) => {
              setVideoProgress(prev => ({
                ...prev,
                [videoItem.id]: { progress: Math.min(90, 10 + progress), status: 'running', message }
              }))
            },
            5000,
            6000000, // 100分钟超时
            () => cancelFlagsRef.current.get(videoItem.id) || false
          )

          if (queryResult.success && queryResult.outputUrl) {
            videoUrl = queryResult.outputUrl
            console.log(`[RunningHub] 视频生成成功: ${videoUrl}`)
          } else {
            const errorMsg = queryResult.error || '生成失败'
            console.error('[RunningHub] 生成失败:', errorMsg)
            
            // 记录失败到历史
            if (activeTask?.path) {
              await saveSeedanceResult(activeTask.path, {
                id: videoItem.id,
                taskId: taskId,
                prompt: targetVideoItem.prompt,
                model: 'runninghub',
                aspectRatio: selectedAspectRatio,
                resolution: selectedResolution,
                duration: duration,
                createdAt: Date.now(),
                status: 'failed',
                error: errorMsg,
              })
            }
            
            throw new Error(errorMsg)
          }
        } catch (error) {
          console.error('[RunningHub] 请求异常:', error)
          throw error
        }
      } else if (selectedProvider === 'runninghub-enterprise') {
        // 企业模型使用直接API调用，不是通过App ID节点方式
        const runninghubConfig = apiConfigs.runninghub
        const service = new RunningHubService(runninghubConfig!)

        // 去重：使用 Map 按 path 去重，保留第一个出现的素材
        const uniqueMaterials = new Map<string, typeof targetVideoItem.materials[0]>()
        targetVideoItem.materials.forEach(m => {
          if (m.path && !uniqueMaterials.has(m.path)) {
            uniqueMaterials.set(m.path, m)
          }
        })
        const dedupedMaterials = Array.from(uniqueMaterials.values())

        const imageMaterials = dedupedMaterials.filter(m => m.type === 'image' && m.path)
        const videoMaterials = dedupedMaterials.filter(m => m.type === 'video' && m.path)
        const audioMaterials = dedupedMaterials.filter(m => m.type === 'audio' && m.path)

        console.log(`[Enterprise] 素材去重: 原始 ${targetVideoItem.materials.length} 个, 去重后 ${dedupedMaterials.length} 个`)
        console.log(`[Enterprise] 图片: ${imageMaterials.length} 个, 视频: ${videoMaterials.length} 个, 音频: ${audioMaterials.length} 个`)

        // 上传图片文件到 RunningHub
        const uploadedImageUrls: string[] = []
        for (let i = 0; i < imageMaterials.length; i++) {
          // 检查是否已取消
          if (cancelFlagsRef.current.get(videoItem.id)) {
            console.log(`[Enterprise] 上传图片 ${i + 1} 前检测到取消标志，停止上传`)
            throw new Error('已取消')
          }
          
          const img = imageMaterials[i]
          if (img.path) {
            setVideoProgress(prev => ({
              ...prev,
              [videoItem.id]: { progress: 5 + i * 5, status: 'running', message: `上传图片 ${i + 1}/${imageMaterials.length}...` }
            }))
            console.log(`[Enterprise] 开始上传图片 ${i + 1}/${imageMaterials.length}:`, img.path)
            const uploadResult = await service.uploadImage(img.path)
            if (uploadResult.success && uploadResult.url) {
              uploadedImageUrls.push(uploadResult.url)
              console.log(`[Enterprise] 图片 ${i + 1} 上传成功:`, uploadResult.url)
            } else {
              console.error(`[Enterprise] 图片 ${i + 1} 上传失败:`, uploadResult.error)
              throw new Error(`图片 ${i + 1} 上传失败: ${uploadResult.error || '请检查网络连接或重新选择图片后重试'}`)
            }
          } else {
            console.error(`[Enterprise] 图片 ${i + 1} 没有 path`)
            throw new Error(`图片 ${i + 1} 没有有效的文件路径`)
          }
        }

        // 上传视频文件
        const uploadedVideoUrls: string[] = []
        for (let i = 0; i < videoMaterials.length; i++) {
          // 检查是否已取消
          if (cancelFlagsRef.current.get(videoItem.id)) {
            console.log(`[Enterprise] 上传视频 ${i + 1} 前检测到取消标志，停止上传`)
            throw new Error('已取消')
          }
          
          const vid = videoMaterials[i]
          if (vid.path) {
            setVideoProgress(prev => ({
              ...prev,
              [videoItem.id]: { progress: 5 + imageMaterials.length * 5 + i * 5, status: 'running', message: `上传视频 ${i + 1}/${videoMaterials.length}...` }
            }))
            console.log(`[Enterprise] 开始上传视频 ${i + 1}/${videoMaterials.length}:`, vid.path)
            const uploadResult = await service.uploadImage(vid.path)
            if (uploadResult.success && uploadResult.url) {
              uploadedVideoUrls.push(uploadResult.url)
              console.log(`[Enterprise] 视频 ${i + 1} 上传成功:`, uploadResult.url)
            } else {
              console.error(`[Enterprise] 视频 ${i + 1} 上传失败:`, uploadResult.error)
              throw new Error(`视频 ${i + 1} 上传失败: ${uploadResult.error || '请检查网络连接或重新选择视频后重试'}`)
            }
          } else {
            console.error(`[Enterprise] 视频 ${i + 1} 没有 path`)
            throw new Error(`视频 ${i + 1} 没有有效的文件路径`)
          }
        }

        // 上传音频文件
        const uploadedAudioUrls: string[] = []
        for (let i = 0; i < audioMaterials.length; i++) {
          // 检查是否已取消
          if (cancelFlagsRef.current.get(videoItem.id)) {
            console.log(`[Enterprise] 上传音频 ${i + 1} 前检测到取消标志，停止上传`)
            throw new Error('已取消')
          }
          
          const audio = audioMaterials[i]
          if (audio.path) {
            setVideoProgress(prev => ({
              ...prev,
              [videoItem.id]: { progress: 5 + (imageMaterials.length + videoMaterials.length) * 5 + i * 5, status: 'running', message: `上传音频 ${i + 1}/${audioMaterials.length}...` }
            }))
            console.log(`[Enterprise] 开始上传音频 ${i + 1}/${audioMaterials.length}:`, audio.path)
            const uploadResult = await service.uploadAudio(audio.path, true)
            if (uploadResult.success && uploadResult.url) {
              uploadedAudioUrls.push(uploadResult.url)
              console.log(`[Enterprise] 音频 ${i + 1} 上传成功:`, uploadResult.url)
            } else {
              console.error(`[Enterprise] 音频 ${i + 1} 上传失败:`, uploadResult.error)
              throw new Error(`音频 ${i + 1} 上传失败: ${uploadResult.error || '请检查网络连接或重新选择音频后重试'}`)
            }
          } else {
            console.error(`[Enterprise] 音频 ${i + 1} 没有 path`)
            throw new Error(`音频 ${i + 1} 没有有效的文件路径`)
          }
        }

        // 构建企业模型API请求
        const apiEndpoint = selectedModel === 'seedance-2.0-fast'
          ? 'https://www.runninghub.cn/openapi/v2/rhart-video/sparkvideo-2.0-fast/multimodal-video'
          : 'https://www.runninghub.cn/openapi/v2/rhart-video/sparkvideo-2.0/multimodal-video'

        // 转换提示词中的 @引用 为 API 格式，并附加全局提示词
        let apiPrompt = targetVideoItem.prompt
          .replace(/@图(\d+)/g, '@Image $1')
          .replace(/@视频(\d+)/g, '@Video $1')
          .replace(/@音频(\d+)/g, '@Audio $1')

        // 附加全局提示词
        if (globalPrompt) {
          apiPrompt = `${apiPrompt}\n\n【全局提示词】${globalPrompt}`
        }

        const enterprisePayload = {
          prompt: apiPrompt,
          resolution: selectedResolution,
          duration: String(duration),
          imageUrls: uploadedImageUrls,
          videoUrls: uploadedVideoUrls,
          audioUrls: uploadedAudioUrls,
          generateAudio: true,
          ratio: selectedAspectRatio === '16:9' ? '16:9' :
                 selectedAspectRatio === '9:16' ? '9:16' :
                 selectedAspectRatio === '4:3' ? '4:3' :
                 selectedAspectRatio === '1:1' ? '1:1' :
                 selectedAspectRatio === '3:4' ? '3:4' :
                 selectedAspectRatio === '21:9' ? '21:9' : 'adaptive',
          realPersonMode: true,
          conversionSlots: ['all'],
        }

        try {
          const requestBody = JSON.stringify(enterprisePayload, null, 2)
          console.log('[Enterprise] 提交视频生成任务:', requestBody)

          // 记录详细请求到日志（包含完整请求体）
          videoLog.info('Seedance2 企业模型提交视频生成任务', {
            provider: 'runninghub-enterprise',
            model: 'runninghub-enterprise',
            shotNumber: String(taskIndex),
            requestParams: {
              apiEndpoint,
              resolution: selectedResolution,
              duration: duration,
              durationType: typeof duration,
              durationString: String(duration),
              aspectRatio: selectedAspectRatio,
              imageCount: uploadedImageUrls.length,
              videoCount: uploadedVideoUrls.length,
              audioCount: uploadedAudioUrls.length,
              promptLength: apiPrompt.length,
            },
            extra: {
              fullRequestBody: requestBody,
              prompt: apiPrompt.substring(0, 200) + (apiPrompt.length > 200 ? '...' : ''),
            },
          })

          const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${runninghubConfig.apiKey}`,
            },
            body: requestBody,
          })

          console.log('[Enterprise] 响应状态:', response.status)

          if (!response.ok) {
            const errorText = await response.text()
            console.error('[Enterprise] 错误响应:', errorText)
            const errorMsg = `API 请求失败: ${response.status} - ${errorText}`

            // 记录失败到日志（包含完整请求和响应）
            videoLog.error('Seedance2 企业模型创建任务失败', {
              provider: 'runninghub-enterprise',
              model: 'runninghub-enterprise',
              shotNumber: String(taskIndex),
              httpStatus: response.status,
              errorMessage: errorMsg,
              responseBody: errorText,
              requestParams: {
                apiEndpoint,
                duration: duration,
                durationString: String(duration),
              },
              extra: {
                fullRequestBody: requestBody,
                prompt: targetVideoItem.prompt,
              },
            })

            // 记录失败到历史
            if (activeTask?.path) {
              await saveSeedanceResult(activeTask.path, {
                id: videoItem.id,
                taskId: 'failed-submit-' + Date.now(),
                prompt: targetVideoItem.prompt,
                model: 'runninghub-enterprise',
                aspectRatio: selectedAspectRatio,
                resolution: selectedResolution,
                duration: duration,
                createdAt: Date.now(),
                status: 'failed',
                error: errorMsg,
              })
            }

            throw new Error(errorMsg)
          }

          const result = await response.json()
          console.log('[Enterprise] 响应结果:', result)

          // 记录响应到日志（无论成功与否）
          videoLog.info('Seedance2 企业模型收到响应', {
            provider: 'runninghub-enterprise',
            model: 'runninghub-enterprise',
            shotNumber: String(taskIndex),
            responseBody: result,
            requestParams: {
              duration: duration,
              durationString: String(duration),
            },
            extra: {
              taskId: result.taskId,
              status: result.status,
              code: result.code,
            },
          })

          if (result.code !== undefined && result.code !== 0) {
            const errorMsg = result.msg || result.message || '请求失败'

            // 记录失败到日志
            videoLog.error('Seedance2 企业模型返回错误码', {
              provider: 'runninghub-enterprise',
              model: 'runninghub-enterprise',
              shotNumber: String(taskIndex),
              errorMessage: errorMsg,
              responseBody: result,
              requestParams: {
                duration: duration,
                durationString: String(duration),
              },
              extra: {
                code: result.code,
                prompt: targetVideoItem.prompt,
              },
            })

            // 记录失败到历史
            if (activeTask?.path) {
              await saveSeedanceResult(activeTask.path, {
                id: videoItem.id,
                taskId: 'failed-submit-' + Date.now(),
                prompt: targetVideoItem.prompt,
                model: 'runninghub-enterprise',
                aspectRatio: selectedAspectRatio,
                resolution: selectedResolution,
                duration: duration,
                createdAt: Date.now(),
                status: 'failed',
                error: errorMsg,
              })
            }
            
            throw new Error(errorMsg)
          }

          taskId = result.taskId
          if (!taskId) {
            // 记录未获取到任务ID的错误
            videoLog.error('Seedance2 企业模型未获取到任务ID', {
              provider: 'runninghub-enterprise',
              model: 'runninghub-enterprise',
              shotNumber: String(taskIndex),
              errorMessage: '未获取到任务ID',
              responseBody: result,
              extra: {
                prompt: targetVideoItem.prompt,
              },
            })
            throw new Error('未获取到任务ID')
          }

          // 存储 taskId 以便取消时使用
          taskIdsRef.current.set(videoItem.id, taskId)
          console.log('[Enterprise] 任务提交成功, taskId:', taskId)
          
          // 保存 taskId 到 videoItem 并持久化（使用 getState 取最新值，避免闭包旧值）
          const latestItems = useAppStore.getState().seedance2Data.videoItems
          updateSeedance2Data({
            videoItems: latestItems.map(v => v.id === videoItem.id ? { ...v, taskId } : v)
          })
          saveProjectImmediately()
          
          setVideoProgress(prev => ({
            ...prev,
            [videoItem.id]: { progress: 10, status: 'queued', message: '任务排队中...' }
          }))

          const queryResult = await service.waitForCompletion(
            taskId,
            (progress, message) => {
              setVideoProgress(prev => ({
                ...prev,
                [videoItem.id]: { progress: Math.min(90, 10 + progress), status: 'running', message }
              }))
            },
            5000,
            6000000, // 100分钟超时
            () => cancelFlagsRef.current.get(videoItem.id) || false
          )

          if (queryResult.success && queryResult.outputUrl) {
            videoUrl = queryResult.outputUrl
            console.log(`[Enterprise] 视频生成成功: ${videoUrl}`)

            // 记录成功到日志
            videoLog.info('Seedance2 企业模型视频生成成功', {
              provider: 'runninghub-enterprise',
              model: 'runninghub-enterprise',
              shotNumber: String(taskIndex),
              taskId: taskId,
              requestParams: {
                duration: duration,
                durationString: String(duration),
              },
              extra: {
                videoUrl: videoUrl,
                outputUrl: queryResult.outputUrl,
              },
            })
          } else {
            const errorMsg = queryResult.error || '生成失败'
            console.error('[Enterprise] 生成失败:', errorMsg)

            // 记录失败到日志
            videoLog.error('Seedance2 企业模型视频生成失败', {
              provider: 'runninghub-enterprise',
              model: 'runninghub-enterprise',
              shotNumber: String(taskIndex),
              taskId: taskId,
              errorMessage: errorMsg,
              requestParams: {
                duration: duration,
                durationString: String(duration),
              },
              extra: {
                queryResult: queryResult,
              },
            })

            // 记录失败到历史
            if (activeTask?.path) {
              await saveSeedanceResult(activeTask.path, {
                id: videoItem.id,
                taskId: taskId,
                prompt: targetVideoItem.prompt,
                model: 'runninghub-enterprise',
                aspectRatio: selectedAspectRatio,
                resolution: selectedResolution,
                duration: duration,
                createdAt: Date.now(),
                status: 'failed',
                error: errorMsg,
              })
            }
            
            throw new Error(errorMsg)
          }
        } catch (error) {
          console.error('[Enterprise] 请求异常:', error)
          throw error
        }
      }

      if (videoUrl) {
        console.log('[Seedance2] 视频生成成功, videoUrl:', videoUrl)
        const { seedance2Data } = useAppStore.getState()
        const latestVideoItems = seedance2Data.videoItems
        
        // 检查视频项是否仍然存在（可能被用户删除或重置）
        const videoExists = latestVideoItems.some(v => v.id === videoItem.id)
        if (!videoExists) {
          console.warn('[Seedance2] 视频项已不存在，无法更新预览URL。视频已保存到本地。')
          useAppStore.getState().addToast({
            type: 'warning',
            title: '视频已保存',
            message: '视频生成成功并已保存到本地，但视频列表已被重置，请刷新查看'
          })
        } else {
          updateSeedance2Data({
            videoItems: latestVideoItems.map(v =>
              v.id === videoItem.id ? { ...v, previewUrl: videoUrl } : v
            )
          })
          setVideoProgress(prev => ({
            ...prev,
            [videoItem.id]: { progress: 100, status: 'succeeded', message: '生成完成' }
          }))
          useAppStore.getState().addToast({
            type: 'success',
            title: '视频生成成功',
            message: `视频${latestVideoItems.findIndex(v => v.id === videoItem.id) + 1}已完成`
          })

          // 记录到通知历史
          await notificationHistoryService.addRecord({
            type: 'success',
            title: '视频生成成功',
            message: `视频${latestVideoItems.findIndex(v => v.id === videoItem.id) + 1}已完成`,
            shotNumber: String(latestVideoItems.findIndex(v => v.id === videoItem.id) + 1)
          })
        }

        if (activeTask?.path && taskId) {
          let finalModel: string
          if (selectedProvider === 'volcengine') {
            finalModel = selectedModel === 'custom' ? customModelId : 'doubao-seedance-2-0-fast-260128'
          } else if (selectedProvider === 'runninghub-enterprise') {
            finalModel = 'runninghub-enterprise'
          } else {
            finalModel = 'runninghub'
          }
          const savedPath = await saveSeedanceVideo(activeTask.path, videoUrl, taskId, videoItem.id)
          console.log(`[Seedance2] 视频${taskIndex}已保存到: ${savedPath}`)

          await saveSeedanceResult(activeTask.path, {
            id: videoItem.id,
            taskId: taskId,
            prompt: targetVideoItem.prompt,
            model: finalModel,
            aspectRatio: selectedAspectRatio,
            resolution: selectedResolution,
            duration: duration,
            videoUrl: videoUrl,
            localVideoPath: savedPath || undefined,
            createdAt: Date.now(),
            completedAt: Date.now(),
            status: 'success',
          })
          
          // 已生成镜头计数+1
          const currentCount = useAppStore.getState().seedance2Data.generatedShotsCount || 0
          const newCount = currentCount + 1
          updateSeedance2Data({ generatedShotsCount: newCount })
          console.log(`[Seedance2] 已生成镜头计数: ${currentCount} -> ${newCount}`)
          
          // 立即保存项目数据，持久化生成状态
          await saveProjectImmediately()
          console.log('[Seedance2] 项目数据已持久化')
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '生成失败'
      
      // 检查是否是用户取消
      const isCancelled = errorMessage === '已取消' || errorMessage.includes('取消')
      
      if (isCancelled) {
        console.log(`[Seedance2] 视频${taskIndex}生成已取消`)
        
        // 记录取消到日志
        videoLog.info('Seedance2 视频生成已取消', {
          provider: selectedProvider === 'volcengine' ? 'volcengine' : 'runninghub',
          model: selectedProvider === 'volcengine'
            ? (selectedModel === 'custom' ? customModelId : selectedModel)
            : selectedModel,
          shotNumber: String(taskIndex),
          extra: {
            prompt: targetVideoItem.prompt,
            aspectRatio: selectedAspectRatio,
            resolution: selectedResolution,
            duration: duration,
            materialsCount: targetVideoItem.materials.length,
          },
        })
        
        // 更新进度状态显示已取消
        setVideoProgress(prev => ({
          ...prev,
          [videoItem.id]: { progress: 0, status: 'cancelled', message: '已取消' }
        }))
        
        // 显示取消提示
        useAppStore.getState().addToast({
          type: 'info',
          title: `视频${taskIndex}已取消`,
          message: '生成任务已取消',
          duration: 3000,
        })
      } else {
        console.error(`[Seedance2] 视频${taskIndex}生成失败:`, errorMessage)

        // 检测是否是网络相关错误
        const isNetworkError = errorMessage.includes('Failed to fetch') ||
          errorMessage.includes('网络') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('超时') ||
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('ENOTFOUND') ||
          errorMessage.includes('ETIMEDOUT')

        // 记录失败到日志
        videoLog.error('Seedance2 视频生成失败', {
          provider: selectedProvider === 'volcengine' ? 'volcengine' : 'runninghub',
          model: selectedProvider === 'volcengine'
            ? (selectedModel === 'custom' ? customModelId : selectedModel)
            : selectedModel,
          shotNumber: String(taskIndex),
          errorMessage,
          errorStack: err instanceof Error ? err.stack : undefined,
          taskId: taskId,
          extra: {
            prompt: targetVideoItem.prompt,
            aspectRatio: selectedAspectRatio,
            resolution: selectedResolution,
            duration: duration,
            materialsCount: targetVideoItem.materials.length,
            imageMaterials: targetVideoItem.materials.filter(m => m.type === 'image').length,
            audioMaterials: targetVideoItem.materials.filter(m => m.type === 'audio').length,
            videoMaterials: targetVideoItem.materials.filter(m => m.type === 'video').length,
          },
        })

        // 如果还没有记录过失败（前面可能已经记录了），这里再记录一次
        if (activeTask?.path) {
          let finalModel: string
          if (selectedProvider === 'volcengine') {
            finalModel = selectedModel === 'custom' ? customModelId : 'doubao-seedance-2-0-fast-260128'
          } else if (selectedProvider === 'runninghub-enterprise') {
            finalModel = 'runninghub-enterprise'
          } else {
            finalModel = 'runninghub'
          }
          await saveSeedanceResult(activeTask.path, {
            id: videoItem.id,
            taskId: taskId || 'failed-' + Date.now(),
            prompt: targetVideoItem.prompt,
            model: finalModel,
            aspectRatio: selectedAspectRatio,
            resolution: selectedResolution,
            duration: duration,
            createdAt: Date.now(),
            status: 'failed',
            error: errorMessage,
          })
        }

        // 更新进度状态显示错误
        setVideoProgress(prev => ({
          ...prev,
          [videoItem.id]: { progress: 0, status: 'failed', message: `生成失败: ${errorMessage}` }
        }))

        // 显示错误提示（包含日志路径提示）
        const logPath = await videoLog.getLogPath()

        if (isNetworkError) {
          // 网络抖动/代理问题，给出友好提示并记录到通知历史
          const networkErrorTitle = `视频${taskIndex}生成失败 - 网络异常`
          const networkErrorMsg = `检测到网络连接不稳定，可能是服务商网络抖动或代理/VPN干扰。\n\n建议：\n1. 等待 1-2 分钟后重新尝试生成\n2. 如使用了代理/VPN，请尝试切换节点或关闭后再试\n3. 检查本地网络连接是否正常\n\n技术信息：${errorMessage}`

          useAppStore.getState().addToast({
            type: 'warning',
            title: networkErrorTitle,
            message: networkErrorMsg,
            duration: 10000,
          })

          // 记录到通知历史
          if (activeTask?.path) {
            await notificationHistoryService.init(activeTask.path)
            await notificationHistoryService.addRecord({
              type: 'warning',
              title: networkErrorTitle,
              message: networkErrorMsg,
              shotNumber: String(taskIndex),
            })
          }
        } else {
          useAppStore.getState().addToast({
            type: 'error',
            title: `视频${taskIndex}生成失败`,
            message: `${errorMessage}\n日志位置: ${logPath}`,
            duration: 8000,
          })

          // 记录到通知历史
          if (activeTask?.path) {
            await notificationHistoryService.init(activeTask.path)
            await notificationHistoryService.addRecord({
              type: 'error',
              title: `视频${taskIndex}生成失败`,
              message: errorMessage,
              shotNumber: String(taskIndex)
            })
          }
        }
      }
    } finally {
      setGeneratingVideoIds(prev => {
        const next = new Set(prev)
        next.delete(videoItem.id)
        return next
      })
      generatingRef.current.delete(videoItem.id)
      cancelFlagsRef.current.delete(videoItem.id)
      taskIdsRef.current.delete(videoItem.id)
    }
  }, [apiConfigs, videoItems, updateSeedance2Data, getAssetUrl, selectedAspectRatio, selectedResolution, selectedModel, customModelId, activeTask, selectedProvider, convertPromptToRunningHubFormat, globalPrompt, saveProjectImmediately])

  const handleCancelGenerate = useCallback(async (videoId: string) => {
    // 设置取消标志
    cancelFlagsRef.current.set(videoId, true)

    // 获取 taskId 并调用取消 API
    const taskId = taskIdsRef.current.get(videoId)
    if (taskId) {
      if (selectedProvider === 'runninghub' || selectedProvider === 'runninghub-enterprise') {
        const runninghubConfig = apiConfigs.runninghub
        if (runninghubConfig?.apiKey) {
          console.log(`[Seedance2] 正在取消 RunningHub 任务: ${taskId}`)
          const service = new RunningHubService(runninghubConfig)
          const cancelResult = await service.cancelTask(taskId)
          if (cancelResult.success) {
            console.log(`[Seedance2] 任务 ${taskId} 取消成功`)
          } else {
            console.warn(`[Seedance2] 任务 ${taskId} 取消失败:`, cancelResult.error)
          }
        }
      } else if (selectedProvider === 'volcengine') {
        const volcarkConfig = apiConfigs.volcark
        if (volcarkConfig?.apiKey) {
          console.log(`[Seedance2] 正在取消火山引擎任务: ${taskId}`)
          const service = new SeedanceService(volcarkConfig)
          const cancelResult = await service.cancelTask(taskId)
          if (cancelResult.success) {
            console.log(`[Seedance2] 火山引擎任务 ${taskId} 取消成功`)
            useAppStore.getState().addToast({
              type: 'success',
              title: '取消成功',
              message: cancelResult.error || '任务已取消'
            })
          } else {
            console.warn(`[Seedance2] 火山引擎任务 ${taskId} 取消失败:`, cancelResult.error)
            useAppStore.getState().addToast({
              type: cancelResult.canRetry === false ? 'warning' : 'error',
              title: cancelResult.canRetry === false ? '无法取消' : '取消失败',
              message: cancelResult.error || '取消任务失败',
              duration: 5000
            })
          }
        }
      }
    }

    setGeneratingVideoIds(prev => {
      const next = new Set(prev)
      next.delete(videoId)
      return next
    })
  }, [selectedProvider, apiConfigs.runninghub, apiConfigs.volcark])

  const handleEnhanceVideo = useCallback(async (videoItem: Seedance2VideoItem, resolution: '720p' | '1080p' | '2k' | '4k') => {
    if (!amkApiKey) {
      useAppStore.getState().addToast({
        type: 'error',
        title: '画质增强失败',
        message: '请先配置 AI MediaKit API Key'
      })
      return
    }

    if (!videoItem.previewUrl) {
      useAppStore.getState().addToast({
        type: 'error',
        title: '画质增强失败',
        message: '没有可用的视频'
      })
      return
    }

    setEnhanceMenuOpen(null)
    setEnhanceStep('provider')
    setEnhancingVideos(prev => new Set(prev).add(videoItem.id))
    setEnhanceProgress(prev => ({ ...prev, [videoItem.id]: '准备视频中...' }))

    try {
      let videoUrl = videoItem.previewUrl

      // 检查是否是本地路径（http://asset.localhost 开头）
      const isLocalPath = videoUrl.startsWith('http://asset.localhost') || videoUrl.startsWith('asset://')
      
      // 检查是否是外部URL（需要检测链接是否失效）
      const isExternalUrl = videoUrl.startsWith('http://') || videoUrl.startsWith('https://')
      let needsReupload = isLocalPath

      // 如果是外部URL，检测链接是否有效
      if (isExternalUrl && !isLocalPath) {
        setEnhanceProgress(prev => ({ ...prev, [videoItem.id]: '检测视频链接...' }))
        try {
          const response = await fetch(videoUrl, { method: 'HEAD', mode: 'no-cors' })
          // 如果链接返回403/404等错误，标记需要重新上传
          if (response.status === 403 || response.status === 404) {
            console.log('[Enhance] 视频链接已失效:', videoUrl, '状态码:', response.status)
            needsReupload = true
          }
        } catch (fetchError) {
          // 如果fetch失败（如CORS错误），尝试另一种方式检测
          console.log('[Enhance] 无法直接检测链接状态，尝试获取本地视频:', fetchError)
          needsReupload = true
        }
      }

      // 如果需要重新上传（本地路径或失效的外部链接）
      if (needsReupload) {
        console.log('[Enhance] 需要从本地重新上传视频到TOS')
        
        // 获取火山引擎配置用于TOS上传
        const volcarkConfig = apiConfigs.volcark
        if (!volcarkConfig?.accessKey || !volcarkConfig?.secretKey || !volcarkConfig?.bucket) {
          throw new Error('视频需要先上传到TOS，但火山引擎TOS配置不完整。请先配置Access Key、Secret Key和Bucket')
        }

        // 如果是本地路径，直接使用processMediaUrl
        if (isLocalPath) {
          setEnhanceProgress(prev => ({ ...prev, [videoItem.id]: '上传视频到云存储...' }))

          // 创建SeedanceService用于TOS上传
          const seedanceService = new SeedanceService(volcarkConfig, {
            accessKey: volcarkConfig.accessKey,
            secretKey: volcarkConfig.secretKey,
            bucket: volcarkConfig.bucket,
            region: volcarkConfig.region || 'cn-beijing',
            s3Endpoint: volcarkConfig.s3Endpoint,
          })

          // 使用 processMediaUrl 处理本地路径上传
          const processResult = await seedanceService.processMediaUrl(videoUrl, 'video')
          if (!processResult.success || !processResult.url) {
            throw new Error(processResult.error || '上传视频到云存储失败')
          }

          videoUrl = processResult.url
          console.log('[Enhance] 本地视频已上传到TOS:', videoUrl)
        } else {
          // 外部链接失效，尝试从本地获取已保存的视频
          if (!activeTask?.path) {
            throw new Error('视频链接已失效，且无法找到本地保存的视频文件')
          }

          setEnhanceProgress(prev => ({ ...prev, [videoItem.id]: '查找本地视频文件...' }))
          
          // 获取已保存的视频列表
          const savedVideos = await getSavedVideos(activeTask.path)

          // 按 videoItemId 查找对应的本地视频文件
          const localVideo = savedVideos.find(v => v.videoItemId === videoItem.id)
          
          if (!localVideo) {
            throw new Error('视频链接已失效，且未找到本地保存的视频文件。请重新生成视频后再试')
          }

          console.log('[Enhance] 找到本地视频文件:', localVideo.path)
          setEnhanceProgress(prev => ({ ...prev, [videoItem.id]: '上传本地视频到云存储...' }))

          // 创建SeedanceService用于TOS上传
          const seedanceService = new SeedanceService(volcarkConfig, {
            accessKey: volcarkConfig.accessKey,
            secretKey: volcarkConfig.secretKey,
            bucket: volcarkConfig.bucket,
            region: volcarkConfig.region || 'cn-beijing',
            s3Endpoint: volcarkConfig.s3Endpoint,
          })

          // 使用 processMediaUrl 上传本地文件
          const processResult = await seedanceService.processMediaUrl(localVideo.path, 'video')
          if (!processResult.success || !processResult.url) {
            throw new Error(processResult.error || '上传本地视频到云存储失败')
          }

          videoUrl = processResult.url
          console.log('[Enhance] 本地视频已上传到TOS:', videoUrl)
        }
      }

      const service = new EnhanceVideoService(amkApiKey)
      setEnhanceProgress(prev => ({ ...prev, [videoItem.id]: '提交画质增强任务...' }))
      const submitResult = await service.submitEnhance(videoUrl, resolution, settings.enhanceScene || 'short_series')
      
      if (!submitResult.success || !submitResult.taskId) {
        throw new Error(submitResult.error || '提交任务失败')
      }

      const result = await service.waitForCompletion(
        submitResult.taskId,
        (progress, message) => {
          setEnhanceProgress(prev => ({ ...prev, [videoItem.id]: `${message} ${progress}%` }))
        },
        undefined,
        3000,
        10 * 60 * 1000
      )

      if (result.success && result.videoUrl) {
        // 使用函数式更新，从 store 获取最新的 videoItems
        const currentVideoItems = useAppStore.getState().seedance2Data.videoItems

        updateSeedance2Data({
          videoItems: currentVideoItems.map(v =>
            v.id === videoItem.id ? { ...v, previewUrl: result.videoUrl } : v
          )
        })

        if (activeTask?.path) {
          await saveEnhancedVideo(activeTask.path, result.videoUrl, videoItem.id, resolution)
        }

        setEnhancingVideos(prev => {
          const next = new Set(prev)
          next.delete(videoItem.id)
          return next
        })
        setEnhanceProgress(prev => {
          const next = { ...prev }
          delete next[videoItem.id]
          return next
        })

        useAppStore.getState().addToast({
          type: 'success',
          title: '画质增强完成',
          message: `已增强至 ${resolution}`
        })
      } else {
        throw new Error(result.error || '画质增强失败')
      }
    } catch (err) {
      setEnhancingVideos(prev => {
        const next = new Set(prev)
        next.delete(videoItem.id)
        return next
      })
      setEnhanceProgress(prev => {
        const next = { ...prev }
        delete next[videoItem.id]
        return next
      })

      useAppStore.getState().addToast({
        type: 'error',
        title: '画质增强失败',
        message: err instanceof Error ? err.message : '未知错误'
      })
    }
  }, [amkApiKey, updateSeedance2Data, activeTask, apiConfigs.volcark, settings.enhanceScene, videoItems])

  const handleRhEnhanceVideo = useCallback(async (videoItem: Seedance2VideoItem, resolution: '720p' | '1080p' | '2k' | '4k') => {
    const rhConfig = apiConfigs.runninghub
    if (!rhConfig?.apiKey) {
      useAppStore.getState().addToast({
        type: 'error',
        title: 'RH超分失败',
        message: '请先配置 RunningHub API Key'
      })
      return
    }

    if (!videoItem.previewUrl) {
      useAppStore.getState().addToast({
        type: 'error',
        title: 'RH超分失败',
        message: '没有可用的视频'
      })
      return
    }

    setEnhanceMenuOpen(null)
    setEnhanceStep('provider')
    setEnhancingVideos(prev => new Set(prev).add(videoItem.id))
    setEnhanceProgress(prev => ({ ...prev, [videoItem.id]: '准备视频中...' }))

    try {
      let videoUrl = videoItem.previewUrl

      const isLocalPath = videoUrl.startsWith('http://asset.localhost') || videoUrl.startsWith('asset://')
      const isExternalUrl = videoUrl.startsWith('http://') || videoUrl.startsWith('https://')
      let needsReupload = isLocalPath

      if (isExternalUrl && !isLocalPath) {
        setEnhanceProgress(prev => ({ ...prev, [videoItem.id]: '检测视频链接...' }))
        try {
          const response = await fetch(videoUrl, { method: 'HEAD', mode: 'no-cors' })
          if (response.status === 403 || response.status === 404) {
            console.log('[RH超分] 视频链接已失效:', videoUrl, '状态码:', response.status)
            needsReupload = true
          }
        } catch {
          console.log('[RH超分] 无法直接检测链接状态，尝试获取本地视频')
          needsReupload = true
        }
      }

      if (needsReupload) {
        console.log('[RH超分] 需要从本地重新上传视频')

        if (isLocalPath) {
          setEnhanceProgress(prev => ({ ...prev, [videoItem.id]: '上传视频中...' }))
          const uploaded = await new RunningHubService(rhConfig).uploadImage(videoUrl)
          if (!uploaded.success || !uploaded.url) {
            throw new Error(uploaded.error || '上传视频到RunningHub失败')
          }
          videoUrl = uploaded.url
          console.log('[RH超分] 视频已上传到RH:', videoUrl)
        } else {
          if (!activeTask?.path) {
            throw new Error('视频链接已失效，且无法找到本地保存的视频文件')
          }

          setEnhanceProgress(prev => ({ ...prev, [videoItem.id]: '查找本地视频文件...' }))
          const savedVideos = await getSavedVideos(activeTask.path)
          const localVideo = savedVideos.find(v => v.videoItemId === videoItem.id)

          if (!localVideo) {
            throw new Error('视频链接已失效，且未找到本地保存的视频文件。请重新生成视频后再试')
          }

          console.log('[RH超分] 找到本地视频文件:', localVideo.path)
          setEnhanceProgress(prev => ({ ...prev, [videoItem.id]: '上传视频到RH...' }))
          const uploaded = await new RunningHubService(rhConfig).uploadImage(localVideo.path)
          if (!uploaded.success || !uploaded.url) {
            throw new Error(uploaded.error || '上传视频到RunningHub失败')
          }
          videoUrl = uploaded.url
          console.log('[RH超分] 本地视频已上传到RH:', videoUrl)
        }
      }

      const service = new RunningHubService(rhConfig)
      setEnhanceProgress(prev => ({ ...prev, [videoItem.id]: '提交RH超分任务...' }))

      const result = await service.upscaleVideoAndWait(
        videoUrl,
        resolution,
        (progress, message) => {
          setEnhanceProgress(prev => ({ ...prev, [videoItem.id]: `${message} ${progress}%` }))
        }
      )

      if (result.success && result.outputUrl) {
        const currentVideoItems = useAppStore.getState().seedance2Data.videoItems

        updateSeedance2Data({
          videoItems: currentVideoItems.map(v =>
            v.id === videoItem.id ? { ...v, previewUrl: result.outputUrl } : v
          )
        })

        if (activeTask?.path) {
          await saveEnhancedVideo(activeTask.path, result.outputUrl, videoItem.id, resolution)
        }

        setEnhancingVideos(prev => {
          const next = new Set(prev)
          next.delete(videoItem.id)
          return next
        })
        setEnhanceProgress(prev => {
          const next = { ...prev }
          delete next[videoItem.id]
          return next
        })

        useAppStore.getState().addToast({
          type: 'success',
          title: 'RH超分完成',
          message: `已增强至 ${resolution}`
        })
      } else {
        throw new Error(result.error || 'RH超分失败')
      }
    } catch (err) {
      setEnhancingVideos(prev => {
        const next = new Set(prev)
        next.delete(videoItem.id)
        return next
      })
      setEnhanceProgress(prev => {
        const next = { ...prev }
        delete next[videoItem.id]
        return next
      })

      useAppStore.getState().addToast({
        type: 'error',
        title: 'RH超分失败',
        message: err instanceof Error ? err.message : '未知错误'
      })
    }
  }, [apiConfigs.runninghub, updateSeedance2Data, activeTask, videoItems])

  const isGenerating = useCallback((videoId: string) => {
    return generatingVideoIds.has(videoId)
  }, [generatingVideoIds])

  const renderNovelToScript = () => (
    <div className={styles.novelToScript}>
      <div className={styles.novelPanel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>源文本</h3>
          <CustomSelect
            value={settings.analysisApi}
            options={[
              { value: 'yunwu', label: 'Yunwu (Gemini 3.1 Pro)' },
              { value: 'yunwu3', label: 'Yunwu (Gemini 3 Pro Thinking)' },
              { value: 'gemini-3.1-flash-lite', label: 'Yunwu (Gemini 3.1 Flash Lite)' },
              { value: 'gemini-3-flash', label: 'Yunwu (Gemini 3 Flash)' },
              { value: 'gemini-3-pro', label: 'Yunwu (Gemini 3 Pro)' },
              { value: 'deepseek', label: 'DeepSeek (V3.2 Thinking)' },
              { value: 'deepseek-v3.2', label: 'DeepSeek (V3.2)' },
            ]}
            onChange={(value) => useAppStore.setState({
              settings: { ...settings, analysisApi: value as 'yunwu' | 'yunwu3' | 'deepseek' | 'deepseek-v3.2' | 'gemini-3.1-flash-lite' | 'gemini-3-flash' | 'gemini-3-pro' }
            })}
          />
        </div>
        <textarea
          className={styles.textArea}
          placeholder="请输入小说内容..."
          value={novelText}
          onChange={(e) => updateSeedance2Data({ novelText: e.target.value })}
          style={{ fontSize: `${settings.promptFontSize}px` }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          className={styles.transformBtn}
          onClick={handleTransform}
          disabled={isTransforming || !novelText.trim()}
        >
          {isTransforming ? '转换中...' : '转换'}
        </button>
        {transformError && (
          <span style={{ color: 'var(--color-error)', fontSize: '12px' }}>{transformError}</span>
        )}
      </div>

      <div className={styles.novelPanel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>剧本输出</h3>
        </div>
        <textarea
          className={styles.textArea}
          placeholder="转换后的剧本将显示在这里..."
          value={scriptText}
          onChange={(e) => updateSeedance2Data({ scriptText: e.target.value })}
          style={{ fontSize: `${settings.promptFontSize}px` }}
        />
      </div>
    </div>
  )

  const renderScriptToStoryboard = () => (
    <div className={styles.scriptToStoryboard}>
      <div className={styles.leftSection}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>剧本输入</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>画质风格</span>
              <CustomSelect
                value={seedance2Data.selectedQualityStyle}
                options={[
                  { value: 'cg-anime', label: 'CG动漫' },
                  { value: 'ancient-realistic', label: '古风写实1' },
                  { value: 'ancient-realistic-2', label: '古风写实2' },
                  { value: 'modern-urban', label: '现代都市' },
                ]}
                onChange={(value) => {
                  updateSeedance2Data({ selectedQualityStyle: value as Seedance2QualityStyle })
                  // 如果选择古风写实2，自动切换到doubao模型
                  if (value === 'ancient-realistic-2' && !['doubao-seed-2-0-lite', 'doubao-seed-2-0-mini'].includes(settings.analysisApi)) {
                    useAppStore.setState({
                      settings: { ...settings, analysisApi: 'doubao-seed-2-0-lite' }
                    })
                  }
                }}
              />
            </div>
            <CustomSelect
              value={settings.analysisApi}
              options={seedance2Data.selectedQualityStyle === 'ancient-realistic-2' ? [
                { value: 'doubao-seed-2-0-lite', label: 'Doubao Seed 2.0 Lite' },
                { value: 'doubao-seed-2-0-mini', label: 'Doubao Seed 2.0 Pro' },
              ] : [
                { value: 'yunwu', label: 'Yunwu (Gemini 3.1 Pro)' },
                { value: 'yunwu3', label: 'Yunwu (Gemini 3 Pro Thinking)' },
                { value: 'gemini-3.1-flash-lite', label: 'Yunwu (Gemini 3.1 Flash Lite)' },
                { value: 'gemini-3-flash', label: 'Yunwu (Gemini 3 Flash)' },
                { value: 'gemini-3-pro', label: 'Yunwu (Gemini 3 Pro)' },
                { value: 'deepseek', label: 'DeepSeek (V3.2 Thinking)' },
                { value: 'deepseek-v3.2', label: 'DeepSeek (V3.2)' },
                { value: 'doubao-seed-2-0-lite', label: 'Doubao Seed 2.0 Lite' },
                { value: 'doubao-seed-2-0-mini', label: 'Doubao Seed 2.0 Pro' },
              ]}
              onChange={(value) => useAppStore.setState({
                settings: { ...settings, analysisApi: value as 'yunwu' | 'yunwu3' | 'deepseek' | 'deepseek-v3.2' | 'gemini-3.1-flash-lite' | 'gemini-3-flash' | 'gemini-3-pro' | 'doubao-seed-2-0-lite' | 'doubao-seed-2-0-mini' }
              })}
            />
          </div>
        </div>
        <div className={styles.scriptPanel}>
          <textarea
            className={styles.textArea}
            placeholder="请输入剧本内容..."
            value={scriptText}
            onChange={(e) => updateSeedance2Data({ scriptText: e.target.value })}
            style={{ fontSize: `${settings.promptFontSize}px` }}
          />
        </div>
        <div className={styles.scriptFooter}>
          <button
            className={styles.transformBtn}
            onClick={handleScriptTransform}
            disabled={isTransforming || !scriptText.trim()}
          >
            {isTransforming ? '转换中...' : '转换'}
          </button>
        </div>
      </div>

      <div className={styles.rightSection}>
        <div className={styles.panelHeader}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className={styles.panelTitle}>视频提示词</h3>
            <button
              className={styles.addToVideoBtn}
              onClick={handleAddToVideoGeneration}
              disabled={videoPrompts.length === 0}
            >
              一键添加到视频
            </button>
          </div>
        </div>
        <div className={styles.storyboardList}>
          {videoPrompts.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: '40px' }}>
              点击"转换"按钮后，这里将显示视频提示词
            </div>
          ) : (
            videoPrompts.map((vp, idx) => (
              <div key={vp.id} className={styles.storyboardItem}>
                <div className={styles.storyboardItemHeader}>
                  <span className={styles.storyboardItemTitle}>视频{idx + 1}</span>
                  <button
                    onClick={() => handleRemoveVideoPrompt(vp.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-text-tertiary)',
                      cursor: 'pointer',
                      fontSize: '18px'
                    }}
                  >
                    ×
                  </button>
                </div>
                <textarea
                  className={styles.storyboardItemPrompt}
                  placeholder="输入视频提示词..."
                  value={vp.prompt}
                  onChange={(e) => handleUpdateVideoPrompt(vp.id, e.target.value)}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )

  const renderVideoGeneration = () => (
    <div className={styles.videoGeneration}>
      <div style={{ display: 'flex', gap: '16px', padding: '12px 16px', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>供应商</span>
          <CustomSelect
            value={selectedProvider}
            options={[
              { value: 'runninghub-enterprise', label: '企业模型' },
            ]}
            onChange={(value) => setSelectedProvider(value as 'runninghub-enterprise')}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>模型</span>
          <CustomSelect
            value={selectedModel}
            options={[
              { value: 'seedance-2.0', label: 'Seedance 2.0' },
              { value: 'seedance-2.0-fast', label: 'Seedance 2.0 Fast' },
            ]}
            onChange={(value) => setSelectedModel(value as 'seedance-2.0' | 'seedance-2.0-fast' | 'custom')}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>宽高比</span>
          <CustomSelect
            value={selectedAspectRatio}
            options={[
              { value: '16:9', label: '16:9' },
              { value: '9:16', label: '9:16' },
              { value: '4:3', label: '4:3' },
              { value: '1:1', label: '1:1' },
              { value: '3:4', label: '3:4' },
              { value: '21:9', label: '21:9' },
            ]}
            onChange={(value) => setSelectedAspectRatio(value as typeof selectedAspectRatio)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>分辨率</span>
          <CustomSelect
            value={selectedResolution}
            options={[
              { value: '480p', label: '480p' },
              { value: '720p', label: '720p' },
            ]}
            onChange={(value) => setSelectedResolution(value as typeof selectedResolution)}
          />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            共 {videoItems.length} 个视频
          </span>
          <span style={{ fontSize: '13px', color: 'var(--color-success)', fontWeight: 500 }}>
            已生成 {generatedShotsCount} 个镜头
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className={styles.restoreBtn}
            onClick={() => setShowNotificationHistory(true)}
            title="查看生成通知记录"
          >
            <Bell size={14} style={{ marginRight: '4px' }} />
            通知
          </button>
          <button
            className={styles.restoreBtn}
            onClick={handleRestoreSavedVideos}
            disabled={!activeTask?.path}
            title="从本地恢复已保存的视频"
          >
            <FolderOpen size={14} style={{ marginRight: '4px' }} />
            恢复已保存视频
          </button>
        </div>
      </div>
      <div className={styles.videoList}>
        {videoItems.map((video, idx) => (
          <div key={video.id} className={styles.videoItem} data-video-id={video.id}>
            <div className={styles.videoItemHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className={styles.videoItemTitle}>视频{idx + 1}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>时长</span>
                  <input
                    type="number"
                    min={4}
                    max={15}
                    value={video.duration ?? 15}
                    onChange={(e) => {
                      const newDuration = Math.max(4, Math.min(15, parseInt(e.target.value) || 15))
                      updateSeedance2Data({
                        videoItems: videoItems.map(v => v.id === video.id ? { ...v, duration: newDuration } : v)
                      })
                    }}
                    style={{
                      width: '50px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-tertiary)',
                      color: 'var(--color-text)',
                      fontSize: '12px',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>秒</span>
                </div>
                {video.taskId && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px',
                    marginLeft: '8px',
                    padding: '2px 6px',
                    background: 'var(--color-bg-tertiary)',
                    borderRadius: '4px',
                    fontSize: '10px',
                    color: 'var(--color-text-secondary)',
                  }}>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>ID:</span>
                    <span style={{ 
                      fontFamily: 'monospace',
                    }}>{video.taskId}</span>
                  </div>
                )}
              </div>
              <div className={styles.shotControls}>
                <button
                  className={styles.shotBtn}
                  onClick={() => handleAddVideo(video.id)}
                  title="添加视频"
                >
                  <Plus size={14} />
                </button>
                <button
                  className={styles.shotBtn}
                  onClick={() => handleRemoveVideo(video.id)}
                  title="删除视频"
                >
                  <Minus size={14} />
                </button>
              </div>
            </div>

            <div className={styles.videoItemContent}>
              <div className={styles.promptSection}>
                <div className={styles.promptWithMaterial}>
                  <div className={styles.materialPoker}>
                    <div className={styles.materialPokerLabel}>
                      素材
                      <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>
                        (图{video.materials.filter(m => m.type === 'image').length}/{MAX_IMAGES} | 视{video.materials.filter(m => m.type === 'video').length}/{MAX_VIDEOS} | 音{video.materials.filter(m => m.type === 'audio').length}/{MAX_AUDIOS})
                      </span>
                    </div>
                    {video.materials.length === 0 ? (
                      <div
                        className={styles.pokerAddBtn}
                        style={{ width: '80px', height: '100px' }}
                        onClick={(e) => handleMaterialClick(e, video.id)}
                      >
                        <Plus size={24} />
                      </div>
                    ) : (
                      <div 
                        className={`${styles.pokerCards} ${spreadPokerId === video.id ? styles.spread : ''}`}
                        style={{ '--total-cards': video.materials.length + 1 } as React.CSSProperties}
                        onMouseLeave={() => {
                          if (!showMaterialMenu && !activeLibrary) {
                            setSpreadPokerId(null)
                          }
                        }}
                      >
                        {video.materials.map((material, index) => (
                          <div
                            key={material.id}
                            className={styles.pokerCard}
                            style={{
                              '--card-index': index,
                              '--total-cards': video.materials.length + 1,
                            } as React.CSSProperties}
                            onClick={(e) => {
                              const target = e.target as HTMLElement
                              if (target.closest(`.${styles.pokerCardRemove}`)) return
                              setPreviewImage({ url: material.preview, name: material.name || '素材', type: material.type, path: material.path, videoId: video.id, materialId: material.id })
                            }}
                            onMouseEnter={() => setSpreadPokerId(video.id)}
                          >
                            {getMaterialPreview(material)}
                            <span className={styles.pokerCardIndex}>{material.index}</span>
                            <span className={styles.pokerTypeBadge} style={{
                              background: material.type === 'audio' ? '#10b981' : material.type === 'video' ? '#8b5cf6' : '#3b82f6'
                            }}>
                              {material.type === 'audio' ? '音' : material.type === 'video' ? '视' : '图'}
                            </span>
                            <button
                              className={styles.pokerCardRemove}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRemoveMaterial(video.id, material.id)
                              }}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                        <div
                          className={`${styles.pokerCard} ${styles.pokerAddCard}`}
                          style={{
                            '--card-index': video.materials.length,
                            '--total-cards': video.materials.length + 1,
                          } as React.CSSProperties}
                          onClick={(e) => handleMaterialClick(e, video.id)}
                          onMouseEnter={() => setSpreadPokerId(video.id)}
                        >
                          <div className={styles.pokerAddContent}>
                            <Plus size={24} />
                          </div>
                        </div>
                        <button
                          className={styles.pokerQuickAdd}
                          onClick={(e) => handleMaterialClick(e, video.id)}
                          onMouseEnter={(e) => {
                            e.stopPropagation()
                            setSpreadPokerId(null)
                          }}
                          title="添加素材"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className={styles.promptInputWrapper} style={{ position: 'relative' }}>
                    <label className={styles.promptLabel}>
                      提示词
                      <span style={{ marginLeft: '8px', fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                        (输入 @ 引用素材)
                      </span>
                      <button
                        onClick={() => setExpandedPromptId(video.id)}
                        style={{
                          marginLeft: '8px',
                          padding: '2px 8px',
                          fontSize: '11px',
                          color: 'var(--color-primary)',
                          background: 'transparent',
                          border: '1px solid var(--color-border)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        全屏编辑
                      </button>
                    </label>
                    <textarea
                      ref={(el) => {
                        if (el) {
                          textareaRefs.current.set(video.id, el)
                        } else {
                          textareaRefs.current.delete(video.id)
                        }
                      }}
                      className={styles.promptInput}
                      style={{ flex: 1, fontSize: `${settings.promptFontSize}px` }}
                      placeholder="输入视频生成提示词...&#10;示例: 一个女孩站在窗边，@图1 穿着蓝色连衣裙&#10;输入 @ 可快速选择已添加的素材"
                      value={video.prompt}
                      onChange={(e) => handleUpdatePrompt(video.id, e.target.value)}
                      onInput={(e) => handlePromptInput(e, video.id)}
                      onKeyDown={(e) => handlePromptKeyDown(e)}
                      onPaste={(e) => handlePasteImage(e, video.id)}
                    />
                    {mentionPopup.show && mentionPopup.videoId === video.id && (
                      <div
                        ref={mentionPopupRef}
                        className={styles.mentionPopup}
                        style={{
                          position: 'fixed',
                          left: mentionPopup.position.x,
                          top: mentionPopup.position.y,
                          zIndex: 1000,
                        }}
                      >
                        <div className={styles.mentionHeader}>
                          <span>选择素材</span>
                          <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                            ↑↓选择 Enter确认 Esc关闭
                          </span>
                        </div>
                        <div className={styles.mentionList}>
                          {getFilteredMaterials(video.materials, mentionPopup.filterText).length === 0 ? (
                            <div className={styles.mentionEmpty}>
                              {video.materials.length === 0 ? '暂无素材，请先添加' : '未找到匹配的素材'}
                            </div>
                          ) : (
                            getFilteredMaterials(video.materials, mentionPopup.filterText).map((material, index) => (
                              <button
                                key={material.id}
                                data-mention-item
                                className={`${styles.mentionItem} ${index === mentionPopup.selectedIndex ? styles.mentionItemSelected : ''}`}
                                onClick={() => handleMentionSelect(material)}
                                tabIndex={0}
                              >
                                <div className={styles.mentionItemPreview}>
                                  {material.type === 'image' && material.preview ? (
                                    <img src={getAssetUrl(material.preview)} alt={material.name} />
                                  ) : (
                                    <div className={styles.mentionItemIcon}>
                                      {material.type === 'audio' ? '🎵' : material.type === 'video' ? '🎬' : '🖼️'}
                                    </div>
                                  )}
                                </div>
                                <div className={styles.mentionItemInfo}>
                                  <span className={styles.mentionItemText}>
                                    {getMentionText(material)}
                                  </span>
                                  <span className={styles.mentionItemName}>
                                    {material.name || `素材${material.index}`}
                                  </span>
                                </div>
                                <span 
                                  className={styles.mentionItemType}
                                  style={{
                                    background: material.type === 'audio' ? '#10b981' : 
                                               material.type === 'video' ? '#8b5cf6' : '#3b82f6'
                                  }}
                                >
                                  {material.type === 'audio' ? '音频' : 
                                   material.type === 'video' ? '视频' : '图片'}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.previewSection}>
                <label className={styles.previewLabel}>视频预览</label>
                <div className={styles.previewArea}>
                  {video.previewUrl ? (
                    <VideoPlayer
                      src={video.previewUrl}
                      videoIndex={idx + 1}
                      onError={() => {
                        // 如果正在生成，不要恢复视频（用 ref 同步检查，避免竞态）
                        if (generatingRef.current.has(video.id)) {
                          console.log(`[Seedance2] 视频 ${idx + 1} 正在生成中，不恢复`)
                          return
                        }
                        console.log(`[Seedance2] 视频 ${idx + 1} 加载失败，尝试从本地恢复`)
                        handleRestoreSingleVideo(video.id, idx + 1)
                      }}
                    />
                  ) : isGenerating(video.id) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
                      <Loader2 size={32} className={styles.spinning} />
                      <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        {videoProgress[video.id]?.message || '生成中...'}
                      </span>
                      <div style={{ width: '80%', height: '4px', background: 'var(--color-bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${videoProgress[video.id]?.progress || 0}%`,
                          height: '100%',
                          background: 'var(--color-primary)',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                  ) : (
                    '等待生成'
                  )}
                </div>
                <div className={styles.previewActions}>
                  {isGenerating(video.id) ? (
                    <button
                      className={styles.generateBtn}
                      onClick={() => handleCancelGenerate(video.id)}
                      style={{ background: 'var(--color-error)' }}
                    >
                      取消生成
                    </button>
                  ) : (
                    <button
                      className={styles.generateBtn}
                      onClick={() => handleGenerateVideo(video)}
                      disabled={!video.prompt.trim()}
                    >
                      <Play size={14} style={{ marginRight: '6px' }} />
                      开始生成
                    </button>
                  )}
                  {video.previewUrl && !isGenerating(video.id) && (
                    <div style={{ position: 'relative' }}>
                      <button
                        className={styles.enhanceBtn}
                        onClick={() => {
                          if (enhanceMenuOpen === video.id) {
                            setEnhanceMenuOpen(null)
                            setEnhanceStep('provider')
                          } else {
                            setEnhanceMenuOpen(video.id)
                            setEnhanceStep('provider')
                          }
                        }}
                        disabled={enhancingVideos.has(video.id)}
                      >
                        {enhancingVideos.has(video.id) ? (
                          <>
                            <Loader2 size={14} className={styles.spinning} style={{ marginRight: '6px' }} />
                            {enhanceProgress[video.id] || '增强中...'}
                          </>
                        ) : (
                          <>
                            <Sparkles size={14} style={{ marginRight: '6px' }} />
                            画质增强
                          </>
                        )}
                      </button>
                      {enhanceMenuOpen === video.id && enhanceStep === 'provider' && (
                        <div className={styles.enhanceMenu}>
                          <button onClick={() => setEnhanceStep('volcengine')}>
                            火山引擎 ▸
                          </button>
                          <button onClick={() => setEnhanceStep('runninghub')}>
                            RH超分 ▸
                          </button>
                        </div>
                      )}
                      {enhanceMenuOpen === video.id && enhanceStep === 'volcengine' && (
                        <div className={styles.enhanceMenu}>
                          <button className={styles.enhanceBack} onClick={() => setEnhanceStep('provider')}>
                            ← 返回
                          </button>
                          <div className={styles.enhanceDivider} />
                          <button onClick={() => handleEnhanceVideo(video, '720p')}>720p</button>
                          <button onClick={() => handleEnhanceVideo(video, '1080p')}>1080p</button>
                          <button onClick={() => handleEnhanceVideo(video, '2k')}>2K</button>
                          <button onClick={() => handleEnhanceVideo(video, '4k')}>4K</button>
                        </div>
                      )}
                      {enhanceMenuOpen === video.id && enhanceStep === 'runninghub' && (
                        <div className={styles.enhanceMenu}>
                          <button className={styles.enhanceBack} onClick={() => setEnhanceStep('provider')}>
                            ← 返回
                          </button>
                          <div className={styles.enhanceDivider} />
                          <button onClick={() => handleRhEnhanceVideo(video, '720p')}>720p</button>
                          <button onClick={() => handleRhEnhanceVideo(video, '1080p')}>1080p</button>
                          <button onClick={() => handleRhEnhanceVideo(video, '2k')}>2K</button>
                          <button onClick={() => handleRhEnhanceVideo(video, '4k')}>4K</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showMaterialMenu && (
          <div
            ref={menuRef}
            className={styles.menuOverlay}
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              zIndex: 1000,
            }}
            onClick={() => setShowMaterialMenu(false)}
          >
            <div
              className={styles.menuPopup}
              style={{
                position: 'fixed',
                left: menuPosition.x,
                top: menuPosition.y,
                transform: 'translate(-50%, -100%)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.menuGrid}>
                <div
                  className={styles.menuItem}
                  onClick={() => handleMenuOption('character')}
                >
                  <div className={styles.menuIcon}>
                    <Users size={24} />
                  </div>
                  <span>角色库</span>
                </div>
                <div
                  className={styles.menuItem}
                  onClick={() => handleMenuOption('prop')}
                >
                  <div className={styles.menuIcon}>
                    <Package size={24} />
                  </div>
                  <span>道具库</span>
                </div>
                <div
                  className={styles.menuItem}
                  onClick={() => handleMenuOption('scene')}
                >
                  <div className={styles.menuIcon}>
                    <Mountain size={24} />
                  </div>
                  <span>场景库</span>
                </div>
                <div
                  className={styles.menuItem}
                  onClick={() => handleMenuOption('local')}
                >
                  <div className={styles.menuIcon}>
                    <FileImage size={24} />
                  </div>
                  <span>本地文件</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeLibrary && (
          <div className={styles.libraryOverlay} onClick={() => setActiveLibrary(null)}>
            <div className={styles.libraryModal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.libraryHeader}>
                <h3>{getLibraryName(activeLibrary)}</h3>
                <button className={styles.libraryCloseBtn} onClick={() => setActiveLibrary(null)}>
                  <X size={18} />
                </button>
              </div>
              <div className={styles.libraryContent}>
                {isLoadingLibrary ? (
                  <div className={styles.libraryLoading}>
                    <div className={styles.spinning}>加载中...</div>
                  </div>
                ) : libraryImages.length === 0 ? (
                  <div className={styles.libraryEmpty}>
                    <ImageIcon size={48} strokeWidth={1} />
                    <p>{getLibraryName(activeLibrary)}为空</p>
                    <span>请先在素材库中添加图片</span>
                  </div>
                ) : (
                  <div className={styles.libraryGrid}>
                    {libraryImages.map((image) => (
                      <div
                        key={image.id}
                        className={styles.libraryImageItem}
                        onClick={() => handleSelectLibraryImage(image)}
                      >
                        <LazyImage src={image.preview} alt={image.name} />
                        <div className={styles.libraryImageName}>{image.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {previewImage && (
          <div className={styles.imagePreviewOverlay} onClick={() => setPreviewImage(null)}>
            <div className={styles.imagePreviewModal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.imagePreviewHeader}>
                <span className={styles.imagePreviewName}>{previewImage.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {previewImage.type === 'image' && previewImage.path && previewImage.videoId && previewImage.materialId && (
                    <button
                      className={styles.editBtn}
                      onClick={() => {
                        setEditingImage({
                          path: previewImage.path!,
                          name: previewImage.name,
                          videoId: previewImage.videoId!,
                          materialId: previewImage.materialId!
                        })
                        setPreviewImage(null)
                      }}
                      title="编辑素材"
                    >
                      <Edit2 size={16} />
                      编辑
                    </button>
                  )}
                  <button
                    className={styles.imagePreviewCloseBtn}
                    onClick={() => setPreviewImage(null)}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className={styles.imagePreviewContent}>
                {previewImage.type === 'video' && previewImage.path ? (
                  <video
                    src={getAssetUrl(previewImage.path)}
                    controls
                    style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 120px)', objectFit: 'contain' }}
                  />
                ) : previewImage.type === 'audio' && previewImage.path ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '20px' }}>
                    <span style={{ fontSize: '48px' }}>🎵</span>
                    <audio
                      src={getAssetUrl(previewImage.path)}
                      controls
                      style={{ width: '100%' }}
                    />
                  </div>
                ) : (
                  <img
                    src={getAssetUrl(previewImage.url)}
                    alt={previewImage.name}
                    style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 120px)', objectFit: 'contain' }}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {editingImage && (
          <ImageEditor
            imagePath={editingImage.path}
            imageName={editingImage.name}
            onClose={() => setEditingImage(null)}
            onSave={(newPath, newName) => {
              updateSeedance2Data({
                videoItems: videoItems.map(v => {
                  if (v.id === editingImage.videoId) {
                    return {
                      ...v,
                      materials: v.materials.map(m => {
                        if (m.id === editingImage.materialId) {
                          return {
                            ...m,
                            path: newPath,
                            preview: newPath,
                            name: newName,
                            loadTime: Date.now()
                          }
                        }
                        return m
                      })
                    }
                  }
                  return v
                })
              })
              addToast({
                type: 'success',
                title: '素材已保存',
                message: `已保存为 ${newName}`
              })
            }}
          />
        )}

        {/* 视频号导航器 */}
        {showVideoNavigator && (
          <div
            className={styles.videoNavigatorOverlay}
            onClick={() => setShowVideoNavigator(false)}
          >
            <div
              className={styles.videoNavigatorModal}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.videoNavigatorHeader}>
                <span className={styles.videoNavigatorTitle}>输入视频号</span>
                <button
                  className={styles.videoNavigatorCloseBtn}
                  onClick={() => setShowVideoNavigator(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className={styles.videoNavigatorContent}>
                <input
                  ref={videoNavigatorInputRef}
                  type="text"
                  value={videoNavigatorInput}
                  onChange={handleVideoNavigatorInputChange}
                  onKeyDown={handleVideoNavigatorKeyDown}
                  className={styles.videoNavigatorInput}
                  placeholder={`请输入视频号 (1-${videoItems.length})...`}
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
                <div className={styles.videoNavigatorHint}>
                  按 Enter 确认 · Esc 取消
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 全局提示词模态框 */}
        {showGlobalPromptModal && (
          <div
            className={styles.globalPromptOverlay}
            onClick={handleCloseGlobalPromptModal}
          >
            <div
              className={styles.globalPromptModal}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.globalPromptHeader}>
                <span className={styles.globalPromptTitle}>全局提示词</span>
                <button
                  className={styles.globalPromptCloseBtn}
                  onClick={handleCloseGlobalPromptModal}
                >
                  <X size={16} />
                </button>
              </div>
              <div className={styles.globalPromptContent}>
                <textarea
                  ref={globalPromptTextareaRef}
                  value={globalPromptInput}
                  onChange={(e) => setGlobalPromptInput(e.target.value)}
                  className={styles.globalPromptTextarea}
                  placeholder="输入全局提示词，将自动附加到每个视频的提示词中..."
                  rows={6}
                />
                <div className={styles.globalPromptHint}>
                  按 Ctrl+T 可快速打开此窗口
                </div>
              </div>
              <div className={styles.globalPromptFooter}>
                <button
                  className={styles.globalPromptSaveBtn}
                  onClick={handleSaveGlobalPrompt}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 通知历史面板 */}
        <Seedance2NotificationHistory
          isOpen={showNotificationHistory}
          onClose={() => setShowNotificationHistory(false)}
          basePath={activeTask?.path || null}
        />

        {/* 提示词全屏编辑模态框 */}
        {expandedPromptId && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
            onClick={() => setExpandedPromptId(null)}
          >
            <div
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderRadius: '12px',
                padding: '24px',
                width: '100%',
                maxWidth: '1200px',
                height: '90vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ color: 'var(--color-text-primary)', fontSize: '18px', fontWeight: '600' }}>提示词编辑</h3>
                <button
                  onClick={() => setExpandedPromptId(null)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '14px',
                    color: 'var(--color-text-primary)',
                    backgroundColor: 'var(--color-primary)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  关闭
                </button>
              </div>
              <textarea
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderRadius: '8px',
                  padding: '16px',
                  fontSize: '14px',
                  lineHeight: '1.8',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  resize: 'none',
                  outline: 'none',
                }}
                value={videoItems.find((v) => v.id === expandedPromptId)?.prompt || ''}
                onChange={(e) => {
                  const videoItem = videoItems.find((v) => v.id === expandedPromptId)
                  if (videoItem) {
                    handleUpdatePrompt(videoItem.id, e.target.value)
                  }
                }}
                autoFocus
              />
            </div>
          </div>
        )}
    </div>
  )

  return (
    <div className={styles.panel}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h1 className={styles.title}>Seedance2.0</h1>
          <button
            className={styles.historyBtn}
            title="通知历史"
            onClick={() => setShowNotificationHistory(true)}
          >
            <Bell size={18} />
          </button>
        </div>
        <nav className={styles.nav}>
          <button
            className={`${styles.navBtn} ${activeTab === 'novelToScript' ? styles.navBtnActive : ''}`}
            onClick={() => updateSeedance2Data({ activeTab: 'novelToScript' })}
          >
            小说转剧本
          </button>
          <button
            className={`${styles.navBtn} ${activeTab === 'scriptToStoryboard' ? styles.navBtnActive : ''}`}
            onClick={() => updateSeedance2Data({ activeTab: 'scriptToStoryboard' })}
          >
            剧本转分镜
          </button>
          <button
          className={`${styles.navBtn} ${activeTab === 'videoGeneration' ? styles.navBtnActive : ''}`}
          onClick={() => updateSeedance2Data({ activeTab: 'videoGeneration' })}
        >
          视频生成
        </button>
        <div className={styles.navDivider} />
        <button
          className={`${styles.navBtn} ${showCloudAssetLibrary ? styles.navBtnActive : ''}`}
          onClick={() => setShowCloudAssetLibrary(true)}
          title="云端资产库"
        >
          <FolderOpen size={16} />
          <span>资产库</span>
        </button>
      </nav>
      </aside>

      <div className={styles.mainContent}>
        {activeTab === 'novelToScript' && renderNovelToScript()}
        {activeTab === 'scriptToStoryboard' && renderScriptToStoryboard()}
        {activeTab === 'videoGeneration' && renderVideoGeneration()}
      </div>

      <AssetLibraryPanel
        isOpen={showCloudAssetLibrary}
        onClose={() => setShowCloudAssetLibrary(false)}
      />

      <Seedance2NotificationHistory
        isOpen={showNotificationHistory}
        onClose={() => setShowNotificationHistory(false)}
        basePath={activeTask?.path || null}
      />
    </div>
  )
}

// 视频播放器组件，带错误处理
interface VideoPlayerProps {
  src: string
  videoIndex: number
  onError: () => void
}

function VideoPlayer({ src, videoIndex, onError }: VideoPlayerProps) {
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    // 重置状态当 src 改变时
    setHasError(false)
    setIsLoading(true)
  }, [src])

  const handleError = () => {
    console.log(`[VideoPlayer] 视频 ${videoIndex} 加载失败:`, src)
    setHasError(true)
    setIsLoading(false)
    onError()
  }

  const handleCanPlay = () => {
    setIsLoading(false)
  }

  if (hasError) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '8px',
        color: 'var(--color-text-secondary)',
        fontSize: '12px'
      }}>
        <span>视频加载失败</span>
        <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
          正在尝试从本地恢复...
        </span>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg-secondary)',
          zIndex: 1
        }}>
          <Loader2 size={24} className="spinning" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      )}
      <video
        ref={videoRef}
        src={src}
        controls
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onError={handleError}
        onCanPlay={handleCanPlay}
        preload="metadata"
      />
    </div>
  )
}

export default Seedance2Panel