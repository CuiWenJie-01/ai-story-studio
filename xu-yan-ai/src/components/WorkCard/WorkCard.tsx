import React, { useCallback, useRef, useState, useMemo, useEffect } from 'react'
import { Plus, Minus, Play, Video, Image, Download, X, Sparkles, Square, BookOpen, Users, Package, Mountain, FileImage, Loader2, LayoutGrid, Pencil, Maximize2, Minimize2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { open, save } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useAppStore } from '../../store/appStore'
import { taskQueueManager } from '../../services/taskQueueManager'
import { Gemini12AIService } from '../../services/gemini12aiService'
import { YunwuImageService } from '../../services/yunwuImageService'
import { YunwuVideoService } from '../../services/yunwuVideoService'
import { RunningHubService } from '../../services/runningHubService'
import { SeedanceService } from '../../services/seedanceService'
import { EnhanceVideoService } from '../../services/enhanceVideoService'
import { saveImageToTaskFolder, saveNineGridImagesToTaskFolder, saveVideoToTaskFolder } from '../../utils/fileSaver'
import { notificationHistoryService } from '../../services/notificationHistoryService'
import { videoLog } from '../../services/videoLogService'
import LazyImage from '../LazyImage/LazyImage'
import { clearImageCache } from '../../utils/imageCache'
import type { WorkItem, ReferenceImage, GeneratedImage, GeneratedVideo, RunningHubApiMapping } from '../../types'
import type { QueuedTask } from '../../services/taskQueueManager'
import CustomSelect from '../CustomSelect/CustomSelect'
import PromptSelector from '../PromptSelector'
import NineGridPreviewModal from '../NineGridPreviewModal'
import { ImageEditor } from '../ImageEditor'
import { compressImage } from '../../utils/imageCompressor'
import { reorderReferenceImages } from '../../utils/scriptPreprocessor'
import styles from './WorkCard.module.css'

let currentNineGridDragData: { path: string; index: number; shotNumber: string | number } | null = null
let isNineGridDragging = false

const IMAGE_GENERATION_TIMEOUT_MS = 10 * 60 * 1000

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = '任务超时，已自动取消'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(errorMessage))
    }, timeoutMs)

    promise
      .then((result) => {
        clearTimeout(timeoutId)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

interface LibraryImage {
  id: string
  name: string
  path: string
  preview: string
}

type LibraryType = 'character' | 'prop' | 'scene' | 'generated' | 'local'

const imageCache = new Map<string, string>()

const libraryCache = new Map<string, { images: LibraryImage[], fileCount: number, loaded: boolean }>()
let isPreloading = false
const NINE_GRID_MAPPING: RunningHubApiMapping = {
  id: 'nine-grid-splitter',
  name: '九宫格切割',
  appId: '2001155573666246658',
  type: 'image',
  nodeInfoList: [
    { nodeId: '203', fieldName: 'image', description: 'image' },
  ],
}

const DEMO_MAPPING: RunningHubApiMapping = {
  id: 'local-demo',
  name: '本地演示任务',
  appId: 'local-demo',
  type: 'image',
  nodeInfoList: [],
}

const isDemoResultUrl = (url?: string): boolean => Boolean(url?.startsWith('demo://'))

export function clearAllLibraryCaches() {
  libraryCache.clear()
  imageCache.clear()
  isPreloading = false
  console.log('[WorkCard] 已清除所有素材库缓存')
}

function getAssetUrl(filePath: string): string {
  const cached = imageCache.get(filePath)
  if (cached) return cached
  const url = convertFileSrc(filePath)
  imageCache.set(filePath, url)
  return url
}

function getLibraryFromCache(libraryPath: string): LibraryImage[] | null {
  const cached = libraryCache.get(libraryPath)
  if (cached?.loaded) {
    return cached.images
  }
  return null
}

function setLibraryCache(libraryPath: string, images: LibraryImage[]) {
  libraryCache.set(libraryPath, {
    images,
    fileCount: images.length,
    loaded: true
  })
}

async function loadLibraryFromDisk(libraryPath: string): Promise<LibraryImage[]> {
  const fs = await import('@tauri-apps/plugin-fs')
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
  
  if (!(await fs.exists(libraryPath))) return []
  
  const entries = await fs.readDir(libraryPath)
  return entries
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
}

async function preloadAllLibraries(basePath: string | null) {
  if (!basePath || isPreloading) return
  isPreloading = true
  
  const libraries = [
    { type: 'character' as const, folder: '角色库' },
    { type: 'prop' as const, folder: '道具库' },
    { type: 'scene' as const, folder: '场景库' },
  ]
  
  try {
    for (const lib of libraries) {
      const libraryPath = `${basePath}\\${lib.folder}`
      
      const cached = libraryCache.get(libraryPath)
      if (cached?.loaded) continue
      
      try {
        const images = await loadLibraryFromDisk(libraryPath)
        if (images.length > 0) {
          setLibraryCache(libraryPath, images)
          console.log(`[WorkCard] 预加载${lib.folder}完成: ${images.length}张图片`)
        }
      } catch (err) {
        console.warn(`[WorkCard] 预加载${lib.folder}失败:`, err)
      }
    }
  } finally {
    isPreloading = false
  }
}

interface WorkCardProps {
  item: WorkItem
  isActive: boolean
  onClick: () => void
}

const WorkCard = ({ item, isActive, onClick }: WorkCardProps) => {
  const { 
    updateWorkItem, 
    removeWorkItem, 
    addWorkItemAfter,
    imageApiProvider,
    videoApiProvider,
    apiConfigs,
    runningHubMappings,
    runningHubImageMappingId,
    runningHubVideoMappingId,
    activeTask,
    settings,
    batchUpdateWorkItems,
    addToast,
    globalPrompt,
    amkApiKey
  } = useAppStore(
    useShallow((state) => ({
      updateWorkItem: state.updateWorkItem,
      removeWorkItem: state.removeWorkItem,
      addWorkItemAfter: state.addWorkItemAfter,
      imageApiProvider: state.imageApiProvider,
      videoApiProvider: state.videoApiProvider,
      apiConfigs: state.apiConfigs,
      runningHubMappings: state.runningHubMappings,
      runningHubImageMappingId: state.runningHubImageMappingId,
      runningHubVideoMappingId: state.runningHubVideoMappingId,
      activeTask: state.activeTask,
      settings: state.settings,
      batchUpdateWorkItems: state.batchUpdateWorkItems,
      addToast: state.addToast,
      globalPrompt: state.globalPrompt,
      amkApiKey: state.amkApiKey,
    }))
  )

  const apiProvider = item.type === 'image' ? imageApiProvider : videoApiProvider

  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [showPromptSelector, setShowPromptSelector] = useState(false)
  const [promptSelectorAnchor, setPromptSelectorAnchor] = useState<HTMLElement | null>(null)
  const cancelledRef = useRef(false)
  const nineGridCancelledRef = useRef(false)
  const nineGridServiceRef = useRef<RunningHubService | null>(null)
  const isNineGridCuttingRef = useRef(false)
  const processingTasksRef = useRef<Set<string>>(new Set())
  const lastStatusKeyRef = useRef<string | null>(null)
  
  const [showImageMenu, setShowImageMenu] = useState(false)
  const [imageMenuPosition, setImageMenuPosition] = useState({ x: 0, y: 0 })
  const [activeImageSlot, setActiveImageSlot] = useState<number | null>(null)
  const [activeLibrary, setActiveLibrary] = useState<LibraryType | null>(null)
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([])
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false)
  const [libraryMaximized, setLibraryMaximized] = useState(false)
  const [libraryZoom, setLibraryZoom] = useState(140)
  const imageMenuRef = useRef<HTMLDivElement>(null)
  const [showNineGridPreview, setShowNineGridPreview] = useState(false)
  const [isDragOverFirstFrame, setIsDragOverFirstFrame] = useState(false)
  const [isDragOverLastFrame, setIsDragOverLastFrame] = useState(false)
  const [editingImagePath, setEditingImagePath] = useState<{ path: string; type: 'ref' | 'firstFrame' | 'lastFrame'; refId?: string } | null>(null)

  // @ mention popup state
  const [mentionPopup, setMentionPopup] = useState<{ show: boolean; position: { x: number; y: number }; filterText: string; cursorPosition: number; selectedIndex: number }>({
    show: false, position: { x: 0, y: 0 }, filterText: '', cursorPosition: 0, selectedIndex: 0,
  })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionPopupRef = useRef<HTMLDivElement>(null)

  // 文生视频降级确认弹窗
  const [fallbackConfirm, setFallbackConfirm] = useState<{
    show: boolean
    title: string
    message: string
    resolve: ((value: boolean) => void) | null
  }>({ show: false, title: '', message: '', resolve: null })

  const showFallbackConfirm = useCallback((title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setFallbackConfirm({ show: true, title, message, resolve })
    })
  }, [])

  const handleFallbackConfirmResponse = useCallback((accepted: boolean) => {
    fallbackConfirm.resolve?.(accepted)
    setFallbackConfirm({ show: false, title: '', message: '', resolve: null })
  }, [fallbackConfirm.resolve])

  const basePath = useMemo(() => {
    return activeTask?.path || settings.savePath || null
  }, [activeTask, settings.savePath])
  
  const libraryPathsRef = useRef({
    character: null as string | null,
    prop: null as string | null,
    scene: null as string | null,
    generated: null as string | null,
  })
  
  if (basePath) {
    libraryPathsRef.current = {
      character: `${basePath}\\角色库`,
      prop: `${basePath}\\道具库`,
      scene: `${basePath}\\场景库`,
      generated: `${basePath}\\Image`,
    }
  }

  useEffect(() => {
    if (basePath) {
      preloadAllLibraries(basePath)
    }
  }, [basePath])

  const isImage = item.type === 'image'
  const isGenerating = item.generationState.status === 'processing' || item.generationState.status === 'pending'

  const [localPrompt, setLocalPrompt] = useState(item.prompt.replace(/<br\s*\/?>/gi, '\n'))
  const localPromptRef = useRef(localPrompt)
  
  useEffect(() => {
    localPromptRef.current = localPrompt
  }, [localPrompt])

  useEffect(() => {
    const cleaned = item.prompt.replace(/<br\s*\/?>/gi, '\n')
    if (cleaned !== localPrompt) {
      setLocalPrompt(cleaned)
    }
  }, [item.prompt])

  const charCount = localPrompt.length
  const maxChars = 10000
  const displayShotNumber = String(item.shotNumber)

  const handlePromptChange = useCallback((prompt: string) => {
    setLocalPrompt(prompt.slice(0, maxChars))
  }, [maxChars])

  // debounce 同步提示词到 store，用户停止输入 500ms 后自动保存
  const promptSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (localPrompt === item.prompt) return
    
    if (promptSaveTimerRef.current) {
      clearTimeout(promptSaveTimerRef.current)
    }
    promptSaveTimerRef.current = setTimeout(() => {
      updateWorkItem(item.id, { prompt: localPrompt })
    }, 500)
    
    return () => {
      if (promptSaveTimerRef.current) {
        clearTimeout(promptSaveTimerRef.current)
      }
    }
  }, [localPrompt, item.id, item.prompt, updateWorkItem])

  // 组件卸载时立即保存未同步的提示词
  useEffect(() => {
    return () => {
      const currentPrompt = localPromptRef.current
      if (currentPrompt !== item.prompt) {
        updateWorkItem(item.id, { prompt: currentPrompt })
      }
    }
  }, [item.id, item.prompt, updateWorkItem])

  const handlePromptBlur = useCallback(() => {
    if (localPrompt !== item.prompt) {
      if (promptSaveTimerRef.current) {
        clearTimeout(promptSaveTimerRef.current)
        promptSaveTimerRef.current = null
      }
      updateWorkItem(item.id, { prompt: localPrompt })
    }
  }, [localPrompt, item.id, item.prompt, updateWorkItem])

  // @ mention: 获取参考图列表用于 mention
  const getMentionRefImages = useCallback(() => {
    return item.referenceImages
      .filter(img => img.preview)
      .sort((a, b) => (a.slotIndex ?? a.order) - (b.slotIndex ?? b.order))
      .map((img, idx) => ({
        id: img.id,
        index: idx + 1,
        name: img.characterName || img.name || `参考图${idx + 1}`,
        preview: img.preview,
        mentionText: `@参考图${idx + 1}`,
      }))
  }, [item.referenceImages])

  // @ mention: 输入监听
  const handlePromptInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    if (!isImage) return // 只在图生图模式启用
    const textarea = e.currentTarget
    const value = textarea.value
    const cursorPos = textarea.selectionStart || 0

    // 向前查找 @
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
      if (char === ' ' || char === '\n') break
    }

    if (foundAtPos >= 0) {
      const filterText = value.substring(foundAtPos + 1, cursorPos)
      // 如果已经是完整的 @参考图N，不弹窗
      if (/^参考图\d+$/.test(filterText)) {
        if (mentionPopup.show) setMentionPopup(prev => ({ ...prev, show: false }))
        return
      }

      const rect = textarea.getBoundingClientRect()
      setMentionPopup({
        show: true,
        position: { x: rect.left + 10, y: rect.top },
        filterText,
        cursorPosition: cursorPos,
        selectedIndex: 0,
      })
      return
    }

    if (mentionPopup.show) {
      setMentionPopup(prev => ({ ...prev, show: false }))
    }
  }, [isImage, mentionPopup.show])

  // @ mention: 键盘导航
  const handlePromptKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionPopup.show) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setMentionPopup(prev => ({ ...prev, show: false }))
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const items = getMentionRefImages().filter(img =>
        !mentionPopup.filterText || img.name.includes(mentionPopup.filterText) || img.mentionText.includes(mentionPopup.filterText)
      )
      if (items.length === 0) return
      setMentionPopup(prev => ({
        ...prev,
        selectedIndex: e.key === 'ArrowDown'
          ? (prev.selectedIndex + 1) % items.length
          : (prev.selectedIndex - 1 + items.length) % items.length,
      }))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const items = getMentionRefImages().filter(img =>
        !mentionPopup.filterText || img.name.includes(mentionPopup.filterText) || img.mentionText.includes(mentionPopup.filterText)
      )
      if (items.length > 0 && items[mentionPopup.selectedIndex]) {
        handleMentionSelect(items[mentionPopup.selectedIndex])
      }
    }
  }, [mentionPopup])

  // @ mention: 选择参考图
  const handleMentionSelect = useCallback((refImg: { mentionText: string }) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const value = localPrompt
    const cursorPos = mentionPopup.cursorPosition
    const atPos = value.lastIndexOf('@', cursorPos - 1)
    if (atPos === -1) return

    const newValue = value.substring(0, atPos) + refImg.mentionText + ' ' + value.substring(cursorPos)
    const newCursorPos = atPos + refImg.mentionText.length + 1
    handlePromptChange(newValue)
    setMentionPopup(prev => ({ ...prev, show: false }))
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }, [localPrompt, mentionPopup.cursorPosition, handlePromptChange])

  // @ mention: 点击外部关闭
  useEffect(() => {
    if (!mentionPopup.show) return
    const handleClickOutside = (e: MouseEvent) => {
      if (mentionPopupRef.current && !mentionPopupRef.current.contains(e.target as Node)) {
        setMentionPopup(prev => ({ ...prev, show: false }))
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mentionPopup.show])

  const handleShowImageMenu = useCallback((e: React.MouseEvent, slotIndex: number) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setImageMenuPosition({ 
      x: rect.left + rect.width / 2, 
      y: rect.top 
    })
    setActiveImageSlot(slotIndex)
    setShowImageMenu(true)
  }, [])

  const handleFileSelect = useCallback(async (targetSlotIndex?: number) => {
    const selected = await open({
      multiple: targetSlotIndex === undefined,
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
    })

    if (!selected) return

    const files = Array.isArray(selected) ? selected : [selected]
    const currentState = useAppStore.getState()
    const currentItem = currentState.workItems.find(i => i.id === item.id)
    if (!currentItem) return

    if (targetSlotIndex !== undefined) {
      const filePath = files[0]
      const fileName = filePath.split(/[/\\]/).pop() || ''
      const characterName = item.excelData?.characters?.[targetSlotIndex] || ''
      const newImage: ReferenceImage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file: null,
        preview: filePath,
        path: filePath,
        name: fileName,
        order: targetSlotIndex,
        slotIndex: targetSlotIndex,
        characterName,
      }
      const existingImages = currentItem.referenceImages.filter(img => img.slotIndex !== targetSlotIndex)
      currentState.updateWorkItem(item.id, {
        referenceImages: [...existingImages, newImage],
      })
    } else {
      let nextSlotIndex = currentItem.referenceImages.length
      for (const filePath of files) {
        if (nextSlotIndex >= 6) break
        const fileName = filePath.split(/[/\\]/).pop() || ''
        const characterName = item.excelData?.characters?.[nextSlotIndex] || ''
        const newImage: ReferenceImage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file: null,
          preview: filePath,
          path: filePath,
          name: fileName,
          order: nextSlotIndex,
          slotIndex: nextSlotIndex,
          characterName,
        }
        currentItem.referenceImages.push(newImage)
        nextSlotIndex++
      }
      currentState.updateWorkItem(item.id, {
        referenceImages: currentItem.referenceImages.slice(0, 6),
      })
    }
  }, [item.id, item.excelData?.characters])

  const handleImageMenuOption = useCallback((type: LibraryType) => {
    if (type === 'local') {
      setShowImageMenu(false)
      handleFileSelect(activeImageSlot ?? undefined)
    } else {
      const libraryPath = libraryPathsRef.current[type as keyof typeof libraryPathsRef.current]
      if (libraryPath) {
        libraryCache.delete(libraryPath)
        console.log(`[WorkCard] 清除${type}库缓存，将重新加载最新数据`)
      }
      setActiveLibrary(type)
      setShowImageMenu(false)
    }
  }, [activeImageSlot, handleFileSelect])

  const loadLibraryImages = useCallback(async (type: 'character' | 'prop' | 'scene' | 'generated') => {
    const libraryPath = libraryPathsRef.current[type]
    if (!libraryPath) {
      setLibraryImages([])
      return
    }

    const cachedImages = getLibraryFromCache(libraryPath)
    if (cachedImages && cachedImages.length > 0) {
      console.log(`[WorkCard] 使用缓存: ${type}库, ${cachedImages.length}张图片`)
      setLibraryImages(cachedImages)
      return
    }

    setIsLoadingLibrary(true)
    try {
      const images = await loadLibraryFromDisk(libraryPath)
      setLibraryCache(libraryPath, images)
      setLibraryImages(images)
      console.log(`[WorkCard] 加载${type}库完成: ${images.length}张图片, 已缓存`)
    } catch (err) {
      console.error(`[WorkCard] 加载${type}库失败:`, err)
      setLibraryImages([])
    } finally {
      setIsLoadingLibrary(false)
    }
  }, [])

  useEffect(() => {
    if (activeLibrary && activeLibrary !== 'local') {
      loadLibraryImages(activeLibrary)
    }
  }, [activeLibrary, loadLibraryImages])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (imageMenuRef.current && !imageMenuRef.current.contains(e.target as Node)) {
        setShowImageMenu(false)
      }
    }
    
    if (showImageMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showImageMenu])

  const handleSelectLibraryImage = useCallback((image: LibraryImage) => {
    if (activeImageSlot === null) return
    
    const currentState = useAppStore.getState()
    const currentItem = currentState.workItems.find(i => i.id === item.id)
    if (!currentItem) return
    
    const characterName = item.excelData?.characters?.[activeImageSlot] || ''
    const newImage: ReferenceImage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: null,
      preview: image.preview,
      path: image.path,
      name: image.name,
      order: activeImageSlot,
      slotIndex: activeImageSlot,
      characterName,
    }
    const existingImages = currentItem.referenceImages.filter(img => img.slotIndex !== activeImageSlot)
    currentState.updateWorkItem(item.id, {
      referenceImages: [...existingImages, newImage],
    })
    setActiveLibrary(null)
  }, [activeImageSlot, item.id, item.excelData?.characters])

  const getLibraryName = (type: LibraryType) => {
    switch (type) {
      case 'character': return '角色库'
      case 'prop': return '道具库'
      case 'scene': return '场景库'
      case 'generated': return '生成图库'
      default: return ''
    }
  }

  const handleLibraryWheel = useCallback((e: React.WheelEvent) => {
    if (!libraryMaximized) return
    e.preventDefault()
    setLibraryZoom(prev => {
      const delta = e.deltaY > 0 ? -15 : 15
      return Math.max(80, Math.min(300, prev + delta))
    })
  }, [libraryMaximized])

  const handleCloseLibrary = useCallback(() => {
    setActiveLibrary(null)
    setLibraryMaximized(false)
    setLibraryZoom(140)
  }, [])

  const handleRemoveImage = useCallback((id: string) => {
    updateWorkItem(item.id, {
      referenceImages: item.referenceImages.filter((img) => img.id !== id),
    })
  }, [item.id, item.referenceImages, updateWorkItem])

  const handleFrameSelect = useCallback(async (type: 'first' | 'last') => {
    const selected = await open({
      multiple: false,
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
    })

    if (!selected || Array.isArray(selected)) return

    const fileName = selected.split(/[/\\]/).pop() || ''
    const newFrame: ReferenceImage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: null,
      preview: selected,
      path: selected,
      name: fileName,
      order: 0,
    }
    if (type === 'first') {
      updateWorkItem(item.id, { firstFrame: newFrame })
    } else {
      updateWorkItem(item.id, { lastFrame: newFrame })
    }
  }, [item.id, updateWorkItem])

  const handleCancel = useCallback(async () => {
    cancelledRef.current = true
    nineGridCancelledRef.current = true

    const currentState = useAppStore.getState()
    const currentItem = currentState.workItems.find(i => i.id === item.id)
    const currentTaskId = currentItem?.currentTaskId

    if (currentTaskId) {
      const queueTask = taskQueueManager.getTaskById(currentTaskId)
      if (queueTask) {
        taskQueueManager.removeTask(currentTaskId)
      } else if (isNineGridCuttingRef.current && nineGridServiceRef.current) {
        await nineGridServiceRef.current.cancelTask(currentTaskId)
      }
      isNineGridCuttingRef.current = false
      nineGridServiceRef.current = null
      updateWorkItem(item.id, {
        generationState: { status: 'idle', progress: 0, message: '已取消' },
        currentTaskId: undefined,
      })
      return
    }

    const myTask = taskQueueManager.getAllTasks().find(t => t.workItemId === item.id)
    if (myTask) {
      taskQueueManager.removeTask(myTask.id)
      updateWorkItem(item.id, {
        generationState: { status: 'idle', progress: 0, message: '已取消' },
        currentTaskId: undefined,
      })
      return
    }

    isNineGridCuttingRef.current = false
    nineGridServiceRef.current = null
    updateWorkItem(item.id, {
      generationState: { status: 'idle', progress: 0, message: '已取消' },
      currentTaskId: undefined,
    })
  }, [item.id, updateWorkItem])

  const handleQueueTaskComplete = useCallback(async (queuedTask: QueuedTask) => {
    if (queuedTask.workItemId !== item.id) {
      console.log(`[WorkCard] 任务完成回调不属于当前工作项，跳过: taskId=${queuedTask.id}, workItemId=${queuedTask.workItemId}, 当前item.id=${item.id}`)
      return
    }

    if (processingTasksRef.current.has(queuedTask.id)) {
      console.log(`[WorkCard] 任务 ${queuedTask.id} 正在处理中，跳过重复调用`)
      return
    }

    processingTasksRef.current.add(queuedTask.id)

    const cleanup = () => {
      processingTasksRef.current.delete(queuedTask.id)
    }

    try {
      if (!queuedTask.result?.success || !queuedTask.result.outputUrl) {
        console.log(`[WorkCard] 任务结果无效, success: ${queuedTask.result?.success}, outputUrl: ${queuedTask.result?.outputUrl}`)
        
        if (queuedTask.result?.error) {
          updateWorkItem(item.id, {
            generationState: {
              status: 'error',
              progress: 0,
              message: queuedTask.result.error,
              error: queuedTask.result.error,
            },
            currentTaskId: undefined,
          })
        } else {
          updateWorkItem(item.id, {
            generationState: {
              status: 'idle',
              progress: 0,
              message: '任务失败，无输出结果',
            },
            currentTaskId: undefined,
          })
        }
        cleanup()
        return
      }

      const outputUrl = queuedTask.result.outputUrl
      const workItemId = queuedTask.workItemId
      
      console.log(`[WorkCard] 处理任务完成, workItemId: ${workItemId}, outputUrl: ${outputUrl}`)
      
      const currentState = useAppStore.getState()
      const currentItem = currentState.workItems.find(i => i.id === workItemId)
      const currentActiveTask = currentState.activeTask
      
      if (!currentItem) {
        console.error('[handleQueueTaskComplete] 找不到对应的 workItem, workItemId:', workItemId)
        cleanup()
        return
      }

      if (queuedTask.result.demo) {
        const timestamp = Date.now()
        const demoMessage = queuedTask.demoScenario === 'recover'
          ? '本地演示完成：已模拟异常并自动恢复'
          : '本地演示任务完成'

        if (queuedTask.type === 'image') {
          const generatedImage: GeneratedImage = {
            id: `demo-image-${timestamp}`,
            url: outputUrl,
            timestamp,
            prompt: currentItem.prompt,
            referenceImages: currentItem.referenceImages.map(image => image.preview),
          }
          updateWorkItem(currentItem.id, {
            generatedImage,
            generationState: { status: 'completed', progress: 100, message: demoMessage },
            currentTaskId: undefined,
          })
        } else if (queuedTask.type === 'video') {
          const generatedVideo: GeneratedVideo = {
            id: `demo-video-${timestamp}`,
            url: outputUrl,
            timestamp,
            prompt: currentItem.prompt,
            firstFrame: currentItem.firstFrame?.preview || '',
            lastFrame: currentItem.lastFrame?.preview || '',
            duration: currentItem.duration,
          }
          updateWorkItem(currentItem.id, {
            generatedVideo,
            generationState: { status: 'completed', progress: 100, message: demoMessage },
            currentTaskId: undefined,
          })
        }
        return
      }

      if (queuedTask.type === 'image') {
        let finalUrl = outputUrl
        let finalThumbnailUrl: string | undefined
        let saveMessage = '生成完成！'
        
        if (currentActiveTask?.path) {
          try {
            const saveResult = await saveImageToTaskFolder(
              outputUrl,
              currentActiveTask.path,
              currentItem.shotNumber,
              Date.now()
            )
            if (saveResult.success && saveResult.path) {
              finalUrl = saveResult.path
              finalThumbnailUrl = saveResult.thumbnailPath
              clearImageCache(finalUrl)
              saveMessage = '生成完成！图片已保存'
            } else {
              saveMessage = `生成完成！保存失败: ${saveResult.error}`
            }
          } catch (saveError) {
            saveMessage = `生成完成！保存异常: ${saveError instanceof Error ? saveError.message : '未知错误'}`
          }
        }

        const cacheBuster = `?t=${Date.now()}`
        const previewWithCache = finalUrl + (finalUrl.startsWith('http') ? cacheBuster : '')
        const thumbnailWithCache = finalThumbnailUrl ? finalThumbnailUrl + (finalThumbnailUrl.startsWith('http') ? cacheBuster : '') : undefined

        const generatedImage: GeneratedImage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url: previewWithCache,
          thumbnailUrl: thumbnailWithCache,
          timestamp: Date.now(),
          prompt: currentItem.prompt,
          referenceImages: currentItem.referenceImages.map((img) => img.preview),
        }

        const videoItem = currentState.workItems.find(
          (item) => item.type === 'video' && String(item.shotNumber) === String(currentItem.shotNumber)
        )
        
        const lipsyncItem = currentState.workItems.find(
          (item) => item.type === 'lipsync' && String(item.shotNumber) === String(currentItem.shotNumber)
        )

        const timestamp = Date.now()
        
        const newFirstFrame: ReferenceImage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file: null,
          preview: previewWithCache,
          path: previewWithCache,
          thumbnailUrl: thumbnailWithCache,
          name: `镜头${currentItem.shotNumber}_首帧`,
          order: 0,
          slotIndex: 0,
          timestamp,
        }

        const updates: Array<{ id: string; updates: Record<string, unknown> }> = [
          {
            id: currentItem.id,
            updates: {
              generatedImage,
              generationState: { status: 'completed', progress: 100, message: saveMessage },
              currentTaskId: undefined,
            }
          }
        ]

        if (videoItem) {
          updates.push({
            id: videoItem.id,
            updates: { firstFrame: newFirstFrame }
          })
          console.log(`[WorkCard] 关联视频首帧: videoItem.id=${videoItem.id}`)
        }
        
        if (lipsyncItem) {
          updates.push({
            id: lipsyncItem.id,
            updates: { firstFrame: newFirstFrame }
          })
          console.log(`[WorkCard] 关联对口型首帧: lipsyncItem.id=${lipsyncItem.id}`)
        }

        if (updates.length > 1) {
          batchUpdateWorkItems(updates)
          console.log(`[WorkCard] 批量更新: 图片生成完成 + 关联首帧, preview: ${previewWithCache.substring(0, 50)}...`)
        } else {
          updateWorkItem(currentItem.id, {
            generatedImage,
            generationState: { status: 'completed', progress: 100, message: saveMessage },
            currentTaskId: undefined,
          })
        }
      } else if (queuedTask.type === 'video') {
        let finalUrl = outputUrl
        let saveMessage = '生成完成！'
        
        if (currentActiveTask?.path) {
          try {
            const saveResult = await saveVideoToTaskFolder(
              outputUrl,
              currentActiveTask.path,
              currentItem.shotNumber,
              Date.now()
            )
            if (saveResult.success && saveResult.path) {
              finalUrl = saveResult.path
              clearImageCache(finalUrl)
              saveMessage = '生成完成！视频已保存'
            } else {
              saveMessage = `生成完成！保存失败: ${saveResult.error}`
            }
          } catch (saveError) {
            saveMessage = `生成完成！保存异常: ${saveError instanceof Error ? saveError.message : '未知错误'}`
          }
        }

        const generatedVideo: GeneratedVideo = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url: finalUrl,
          originalUrl: outputUrl,
          timestamp: Date.now(),
          prompt: currentItem.prompt,
          firstFrame: currentItem.firstFrame?.preview || '',
          lastFrame: currentItem.lastFrame?.preview || '',
          duration: currentItem.duration,
        }

        updateWorkItem(currentItem.id, {
          generatedVideo,
          generationState: { status: 'completed', progress: 100, message: saveMessage },
          currentTaskId: undefined,
        })
      }
    } catch (error) {
      console.error('[handleQueueTaskComplete] 处理任务失败:', error)
      updateWorkItem(item.id, {
        generationState: {
          status: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : '处理任务失败',
          error: error instanceof Error ? error.message : '处理任务失败',
        },
        currentTaskId: undefined,
      })
    } finally {
      cleanup()
    }
  }, [item.id, updateWorkItem, batchUpdateWorkItems])

  useEffect(() => {
    const handleTaskUpdate = (myTask: QueuedTask) => {
      if (myTask.workItemId !== item.id) {
        console.log(`[WorkCard] 收到其他任务更新，忽略: taskId=${myTask.id}, workItemId=${myTask.workItemId}, 当前item.id=${item.id}`)
        return
      }
      
      const currentGenStatus = useAppStore.getState().workItems.find(i => i.id === item.id)?.generationState.status
      
      if (myTask.status === 'completed' && currentGenStatus === 'completed') {
        console.log(`[WorkCard] 任务 ${myTask.id} 已完成，跳过重复通知`)
        return
      }
      
      if (myTask.status === 'processing' && currentGenStatus === 'completed') {
        console.log(`[WorkCard] 任务已完成，忽略 processing 状态更新`)
        return
      }
      
      console.log(`[WorkCard] 收到任务更新: ${myTask.id}, 状态: ${myTask.status}, workItemId: ${myTask.workItemId}`)
      
      switch (myTask.status) {
        case 'pending':
          updateWorkItem(item.id, {
            generationState: { 
              status: 'pending', 
              progress: 0, 
              message: '任务已加入队列，等待处理...' 
            },
            currentTaskId: myTask.id,
          })
          break
        case 'processing':
          updateWorkItem(item.id, {
            generationState: { 
              status: 'processing', 
              progress: 20, 
              message: '正在处理...' 
            },
            currentTaskId: myTask.id,
          })
          break
        case 'completed':
          if (myTask.result?.success && myTask.result?.outputUrl) {
            console.log(`[WorkCard] 任务完成，准备处理结果: ${myTask.result.outputUrl}`)
            handleQueueTaskComplete(myTask)
            const successTitle = `镜头 #${item.shotNumber} 生成成功`
            const successMsg = myTask.result.demo
              ? `本地模拟${isImage ? '图像' : '视频'}已生成（未调用 API）`
              : (isImage ? '图像已生成' : '视频已生成')
            addToast({
              type: 'success',
              title: successTitle,
              message: successMsg,
              shotNumber: String(item.shotNumber),
            })
            notificationHistoryService.addRecord({
              type: 'success',
              title: successTitle,
              message: successMsg,
              shotNumber: String(item.shotNumber),
            })
          } else {
            console.warn(`[WorkCard] 任务完成但无有效结果: success=${myTask.result?.success}, outputUrl=${myTask.result?.outputUrl}`)
            const errorMsg = myTask.result?.error || '任务完成但无输出结果'
            updateWorkItem(item.id, {
              generationState: {
                status: 'error',
                progress: 0,
                message: errorMsg,
                error: errorMsg,
              },
              currentTaskId: undefined,
            })
            const errorTitle = `镜头 #${item.shotNumber} 生成失败`
            addToast({
              type: 'error',
              title: errorTitle,
              message: errorMsg,
              shotNumber: String(item.shotNumber),
            })
            notificationHistoryService.addRecord({
              type: 'error',
              title: errorTitle,
              message: errorMsg,
              shotNumber: String(item.shotNumber),
            })
          }
          break
        case 'cancelled':
          updateWorkItem(item.id, {
            generationState: {
              status: 'idle',
              progress: 0,
              message: '任务已取消',
            },
            currentTaskId: undefined,
          })
          break
        case 'error': {
          const errorMessage = myTask.result?.error || '生成失败'
          updateWorkItem(item.id, {
            generationState: {
              status: 'error',
              progress: 0,
              message: errorMessage,
              error: myTask.result?.error,
            },
            currentTaskId: undefined,
          })
          const errorTitle2 = `镜头 #${item.shotNumber} 生成失败`
          addToast({
            type: 'error',
            title: errorTitle2,
            message: errorMessage,
            shotNumber: String(item.shotNumber),
          })
          notificationHistoryService.addRecord({
            type: 'error',
            title: errorTitle2,
            message: errorMessage,
            shotNumber: String(item.shotNumber),
          })
          break
        }
      }
    }
    
    const unsubscribe = taskQueueManager.subscribeToTask(item.id, handleTaskUpdate)
    
    return () => {
      console.log(`[WorkCard] 清理任务订阅: ${item.id}`)
      unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  const handleGenerate = useCallback(async () => {
    cancelledRef.current = false
    lastStatusKeyRef.current = null

    const currentPrompt = localPromptRef.current.trim()
    
    // 拼接全局提示词
    const globalPromptText = globalPrompt.trim()
    const finalPrompt = globalPromptText
      ? (currentPrompt ? `${globalPromptText}，${currentPrompt}` : globalPromptText)
      : currentPrompt
    
    if (globalPromptText) {
      console.log(`[Generate] 全局提示词已拼接: "${globalPromptText.substring(0, 50)}..." + 镜头提示词`)
    }
    
    if (currentPrompt !== item.prompt) {
      updateWorkItem(item.id, { prompt: currentPrompt })
    }

    if (!activeTask) {
      updateWorkItem(item.id, {
        generationState: { 
          status: 'error', 
          progress: 0, 
          message: '请先选择任务',
          error: '请先选择任务'
        },
      })
      return
    }

    const canGenerate = finalPrompt.length > 0 ||
      (isImage ? item.referenceImages.length > 0 : (item.firstFrame || item.lastFrame))

    if (!canGenerate || isGenerating) return

    const currentState = useAppStore.getState()
    const currentItem = currentState.workItems.find(i => i.id === item.id)
    const hasExistingResult = isImage ? !!currentItem?.generatedImage : !!currentItem?.generatedVideo
    
    // 图生图生成时，清除相关联的视频首帧和对口型首帧
    let videoItem: typeof currentItem | undefined
    let lipsyncItem: typeof currentItem | undefined
    
    if (isImage && hasExistingResult) {
      console.log(`[Generate] 清除镜头 ${item.shotNumber} 的已有生成结果及关联数据`)
      
      videoItem = currentState.workItems.find(
        (workItem) => workItem.type === 'video' && String(workItem.shotNumber) === String(item.shotNumber)
      )
      lipsyncItem = currentState.workItems.find(
        (workItem) => workItem.type === 'lipsync' && String(workItem.shotNumber) === String(item.shotNumber)
      )
      
      // 清除缓存
      if (currentItem?.generatedImage?.url) {
        imageCache.delete(currentItem.generatedImage.url)
      }
      if (currentItem?.generatedImage?.thumbnailUrl) {
        imageCache.delete(currentItem.generatedImage.thumbnailUrl)
      }
      if (videoItem?.firstFrame?.path) {
        imageCache.delete(videoItem.firstFrame.path)
      }
      if (lipsyncItem?.firstFrame?.path) {
        imageCache.delete(lipsyncItem.firstFrame.path)
      }
      
      // 批量清除图生图结果、视频首帧和对口型首帧
      const clearUpdates: Array<{ id: string; updates: Record<string, unknown> }> = [
        {
          id: item.id,
          updates: { generatedImage: null }
        }
      ]
      
      if (videoItem) {
        clearUpdates.push({
          id: videoItem.id,
          updates: { firstFrame: null }
        })
      }
      
      if (lipsyncItem) {
        clearUpdates.push({
          id: lipsyncItem.id,
          updates: { firstFrame: null }
        })
      }
      
      batchUpdateWorkItems(clearUpdates)
      console.log(`[Generate] 已清除镜头 ${item.shotNumber} 的图生图结果、视频首帧和对口型首帧`)
    }

    const isQueued = await taskQueueManager.willBeQueuedAsync(settings.demoMode)

    updateWorkItem(item.id, {
      generationState: { 
        status: 'pending', 
        progress: 0, 
        message: isQueued ? '正在排队中...' : '正在提交中...' 
      },
    })

    try {
      if (settings.demoMode) {
        taskQueueManager.setMaxConcurrent(settings.maxConcurrent)

        const tempTaskId = `demo-temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
        updateWorkItem(item.id, { currentTaskId: tempTaskId })

        const taskId = await taskQueueManager.addToQueue(
          item.id,
          isImage ? 'image' : 'video',
          { ...DEMO_MAPPING, type: isImage ? 'image' : 'video' },
          { text: finalPrompt },
          (progress, message) => {
            const currentItem = useAppStore.getState().workItems.find(workItem => workItem.id === item.id)
            if (currentItem?.currentTaskId) {
              updateWorkItem(item.id, {
                generationState: {
                  status: 'processing',
                  progress,
                  message,
                },
              })
            }
          },
          { demoScenario: settings.demoScenario }
        )

        updateWorkItem(item.id, { currentTaskId: taskId })
        console.log(`[Generate] 本地演示任务已加入队列: ${taskId}, 场景: ${settings.demoScenario}`)
      } else if (apiProvider === 'runninghub') {
        const config = apiConfigs.runninghub

        if (!config.apiKey) {
          throw new Error('请先在设置中配置 RunningHub API Key')
        }

        taskQueueManager.setService(config)
        taskQueueManager.setMaxConcurrent(settings.maxConcurrent)

        if (isImage) {
          const mapping = runningHubMappings.find(m => m.id === runningHubImageMappingId)
          if (!mapping) {
            throw new Error('请先在设置中选择图生图 API 映射')
          }

          const imageNodes = mapping.nodeInfoList.filter(node => node.fieldName === 'image')

          // 根据提示词中的 @参考图N 顺序重排序参考图，确保与提示词描述一致
          const orderedRefImages = reorderReferenceImages(item.referenceImages, finalPrompt)

          const images = orderedRefImages.map((img, index) => {
            if (index >= imageNodes.length) return null
            const imageData = img.path || img.preview
            if (!imageData) return null
            return {
              nodeId: imageNodes[index].nodeId,
              base64Data: imageData,
            }
          }).filter(Boolean) as { nodeId: string; base64Data: string }[]

          const tempTaskId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
          
          updateWorkItem(item.id, { currentTaskId: tempTaskId })
          
          const taskId = await taskQueueManager.addToQueue(
            item.id,
            'image',
            mapping,
            {
              images,
              text: finalPrompt,
              aspectRatio: item.aspectRatio,
              resolution: item.resolution,
            },
            (progress, message) => {
              const state = useAppStore.getState()
              const currentItem = state.workItems.find(i => i.id === item.id)
              if (currentItem?.currentTaskId) {
                updateWorkItem(item.id, {
                  generationState: {
                    status: 'processing',
                    progress: 20 + progress * 0.7,
                    message
                  },
                })
              }
            }
          )

          updateWorkItem(item.id, { currentTaskId: taskId })
          console.log(`[Generate] 图像任务已加入队列: ${taskId}`)

        } else {
          const mapping = runningHubMappings.find(m => m.id === runningHubVideoMappingId)
          if (!mapping) {
            throw new Error('请先在设置中选择图生视频 API 映射')
          }

          const imageNodes = mapping.nodeInfoList.filter(node => node.fieldName === 'image')

          let firstFrameData: { nodeId: string; base64Data: string } | undefined
          let lastFrameData: { nodeId: string; base64Data: string } | undefined

          if (item.firstFrame && imageNodes.length > 0) {
            const firstFramePath = item.firstFrame.path || item.firstFrame.preview
            if (firstFramePath) {
              firstFrameData = {
                nodeId: imageNodes[0].nodeId,
                base64Data: firstFramePath,
              }
            }
          }

          if (item.lastFrame && imageNodes.length > 1) {
            const lastFramePath = item.lastFrame.path || item.lastFrame.preview
            if (lastFramePath) {
              lastFrameData = {
                nodeId: imageNodes[1].nodeId,
                base64Data: lastFramePath,
              }
            }
          }

          const taskId = await taskQueueManager.addToQueue(
            item.id,
            'video',
            mapping,
            {
              firstFrame: firstFrameData,
              lastFrame: lastFrameData,
              text: finalPrompt,
              duration: item.duration,
            },
            (progress, message) => {
              const state = useAppStore.getState()
              const currentItem = state.workItems.find(i => i.id === item.id)
              if (currentItem && currentItem.currentTaskId === taskId) {
                updateWorkItem(item.id, {
                  generationState: {
                    status: 'processing',
                    progress: 20 + progress * 0.7,
                    message
                  },
                })
              }
            }
          )

          updateWorkItem(item.id, { currentTaskId: taskId })
          console.log(`[Generate] 视频任务已加入队列: ${taskId}`)
        }
      } else if (apiProvider === 'gemini12ai') {
        const config = apiConfigs.gemini12ai
        if (!config.apiKey) {
          throw new Error('请先在设置中配置 12AI API Key')
        }

        if (isImage) {
          updateWorkItem(item.id, {
            generationState: { status: 'processing', progress: 10, message: '正在生成图片...' },
          })

          const service = new Gemini12AIService(config)

        const shouldCompress = useAppStore.getState().settings.compressReferenceImages

        // 将所有参考图片转换为 Base64
        const referenceImages: string[] = []
        const orderedRefImages = reorderReferenceImages(item.referenceImages, finalPrompt)
        for (const refImg of orderedRefImages) {
          const imagePath = refImg.path || refImg.preview
          if (imagePath) {
            try {
              // 使用 Tauri 的 fs API 读取文件并转换为 Base64
              const { readFile } = await import('@tauri-apps/plugin-fs')
              const fileData = await readFile(imagePath)
              const base64 = btoa(
                new Uint8Array(fileData).reduce(
                  (data, byte) => data + String.fromCharCode(byte),
                  ''
                )
              )
              // 检测 MIME 类型
              const ext = imagePath.split('.').pop()?.toLowerCase() || 'png'
              const mimeTypeMap: Record<string, string> = {
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif',
                'webp': 'image/webp',
                'bmp': 'image/bmp',
              }
              const mimeType = mimeTypeMap[ext] || 'image/png'
              const rawDataUrl = `data:${mimeType};base64,${base64}`
              if (shouldCompress) {
                const compressed = await compressImage(rawDataUrl)
                referenceImages.push(compressed)
                console.log(`[Gemini12AI] 参考图片 ${referenceImages.length} 已压缩, 大小: ${Math.round(compressed.length / 1024)}KB`)
              } else {
                referenceImages.push(rawDataUrl)
                console.log(`[Gemini12AI] 参考图片 ${referenceImages.length} 未压缩, 大小: ${Math.round(rawDataUrl.length / 1024)}KB`)
              }
            } catch (readError) {
              console.warn('[Gemini12AI] 读取参考图片失败:', readError)
            }
          }
        }

        const aspectRatioMap: Record<string, string> = {
          '9:16': '9:16',
          '16:9': '16:9',
          '4:3': '4:3',
          '3:4': '3:4',
          '1:1': '1:1',
        }

        const imageSizeMap: Record<string, string> = {
          '2k': '2K',
          '4k': '4K',
          '1k': '1K',
          '1K': '1K',
          '2K': '2K',
          '4K': '4K',
        }

        const result = await withTimeout(
          service.generateImage({
            prompt: finalPrompt,
            aspectRatio: aspectRatioMap[item.aspectRatio] || '16:9',
            imageSize: imageSizeMap[item.resolution] || '1K',
            referenceImages,
          }),
          IMAGE_GENERATION_TIMEOUT_MS,
          '图片生成超时（10分钟），已自动取消'
        )

        if (!result.success) {
          throw new Error(result.error || '生成失败')
        }

        if (!result.imageData || !result.mimeType) {
          throw new Error('未返回图片数据')
        }

        updateWorkItem(item.id, {
          generationState: { status: 'processing', progress: 80, message: '正在保存图片...' },
        })

        const base64Data = `data:${result.mimeType};base64,${result.imageData}`
        const saveResult = await saveImageToTaskFolder(
          base64Data,
          activeTask.path,
          item.shotNumber,
          Date.now()
        )

        if (!saveResult.success || !saveResult.path) {
          throw new Error(saveResult.error || '保存图片失败')
        }

        const generatedImage: GeneratedImage = {
          id: `img-${Date.now()}`,
          url: saveResult.path,
          thumbnailUrl: saveResult.thumbnailPath,
          timestamp: Date.now(),
          prompt: currentPrompt,
          referenceImages: item.referenceImages.map(img => img.preview),
        }

        const currentState = useAppStore.getState()
        const videoItem = currentState.workItems.find(
          (workItem) => workItem.type === 'video' && String(workItem.shotNumber) === String(item.shotNumber)
        )
        const lipsyncItem = currentState.workItems.find(
          (workItem) => workItem.type === 'lipsync' && String(workItem.shotNumber) === String(item.shotNumber)
        )

        console.log(`[Generate] Gemini12AI: 查找关联项目 - 当前镜头: ${item.shotNumber}, videoItem: ${videoItem?.id}, lipsyncItem: ${lipsyncItem?.id}`)

        const timestamp = Date.now()

        const newFirstFrame: ReferenceImage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file: null,
          preview: saveResult.path,
          path: saveResult.path,
          thumbnailUrl: saveResult.thumbnailPath,
          name: `镜头${item.shotNumber}_首帧`,
          order: 0,
          slotIndex: 0,
          timestamp,
        }

        console.log(`[Generate] Gemini12AI: newFirstFrame =`, newFirstFrame)

        // 批量更新图片项、视频项和对口型项
        const updates: Array<{ id: string; updates: Record<string, unknown> }> = [
          {
            id: item.id,
            updates: {
              generatedImage,
              generationState: { status: 'completed', progress: 100, message: '生成完成' },
              currentTaskId: undefined,
            }
          }
        ]

        if (videoItem) {
          updates.push({
            id: videoItem.id,
            updates: { firstFrame: newFirstFrame }
          })
          console.log(`[Generate] Gemini12AI: 关联视频首帧 - videoItem.id: ${videoItem.id}`)
        }

        if (lipsyncItem) {
          updates.push({
            id: lipsyncItem.id,
            updates: { firstFrame: newFirstFrame }
          })
          console.log(`[Generate] Gemini12AI: 关联对口型首帧 - lipsyncItem.id: ${lipsyncItem.id}`)
        }

        console.log(`[Generate] Gemini12AI: 准备批量更新 ${updates.length} 个项目`)
        updates.forEach((u, i) => console.log(`  [${i}] id: ${u.id}, updates:`, u.updates))

        if (updates.length > 1) {
          batchUpdateWorkItems(updates)
          console.log(`[Generate] Gemini12AI: 批量更新完成`)
        } else {
          updateWorkItem(item.id, {
            generatedImage,
            generationState: { status: 'completed', progress: 100, message: '生成完成' },
            currentTaskId: undefined,
          })
        }

        const successTitle = `镜头 #${item.shotNumber} 图片生成成功`
        const successMsg = 'Gemini12AI 图像已生成'
        addToast({
          type: 'success',
          title: successTitle,
          message: successMsg,
          shotNumber: String(item.shotNumber),
        })
        notificationHistoryService.addRecord({
          type: 'success',
          title: successTitle,
          message: successMsg,
          shotNumber: String(item.shotNumber),
        })

        console.log(`[Generate] Gemini12AI 图片生成完成: ${saveResult.path}`)
        } else {
          updateWorkItem(item.id, {
            generationState: { status: 'processing', progress: 10, message: '正在创建视频任务...' },
          })

          const { Seedance12AIService } = await import('../../services/seedance12aiService')
          const videoService = new Seedance12AIService(config)

          const filePaths: string[] = []
          if (item.firstFrame) {
            const firstFramePath = item.firstFrame.path || item.firstFrame.preview
            if (firstFramePath) {
              filePaths.push(firstFramePath)
            }
          }
          if (item.lastFrame) {
            const lastFramePath = item.lastFrame.path || item.lastFrame.preview
            if (lastFramePath) {
              filePaths.push(lastFramePath)
            }
          }

          const ratioMap: Record<string, '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16'> = {
            '9:16': '9:16',
            '16:9': '16:9',
          }

          const createResult = await videoService.createVideoTask({
            prompt: finalPrompt,
            duration: item.duration as 5 | 10 | 15,
            ratio: item.enableFullReferenceMode ? ratioMap[item.aspectRatio] : undefined,
            filePaths: filePaths.length > 0 ? filePaths : undefined,
            enableFullReferenceMode: item.enableFullReferenceMode,
          })

          if (!createResult.success || !createResult.taskId) {
            throw new Error(createResult.error || '创建视频任务失败')
          }

          updateWorkItem(item.id, {
            currentTaskId: createResult.taskId,
            generationState: { status: 'processing', progress: 20, message: '视频任务已创建，等待处理...' },
          })

          const result = await videoService.waitForCompletion(
            createResult.taskId,
            (progress, _status, message) => {
              updateWorkItem(item.id, {
                generationState: {
                  status: 'processing',
                  progress: 20 + progress * 0.6,
                  message,
                },
              })
            }
          )

          if (!result.success || !result.videoUrl) {
            throw new Error(result.error || '视频生成失败')
          }

          updateWorkItem(item.id, {
            generationState: { status: 'processing', progress: 90, message: '正在保存视频...' },
          })

          let finalVideoUrl = result.videoUrl
          let saveMessage = '生成完成！'

          if (activeTask?.path) {
            try {
              const saveResult = await saveVideoToTaskFolder(
                result.videoUrl,
                activeTask.path,
                item.shotNumber,
                Date.now()
              )
              if (saveResult.success && saveResult.path) {
                finalVideoUrl = saveResult.path
                clearImageCache(finalVideoUrl)
                saveMessage = '生成完成！视频已保存'
              } else {
                saveMessage = `生成完成！保存失败: ${saveResult.error}`
              }
            } catch (saveError) {
              saveMessage = `生成完成！保存异常: ${saveError instanceof Error ? saveError.message : '未知错误'}`
            }
          }

          const generatedVideo: GeneratedVideo = {
            id: `video-${Date.now()}`,
            url: finalVideoUrl,
            timestamp: Date.now(),
            prompt: currentPrompt,
            firstFrame: item.firstFrame?.preview || '',
            lastFrame: item.lastFrame?.preview || '',
            duration: item.duration,
          }

          updateWorkItem(item.id, {
            generatedVideo,
            generationState: { status: 'completed', progress: 100, message: saveMessage },
            currentTaskId: undefined,
          })

          const successTitle = `镜头 #${item.shotNumber} 视频生成成功`
          const successMsg = 'Seedance12AI 视频已生成'
          addToast({
            type: 'success',
            title: successTitle,
            message: successMsg,
            shotNumber: String(item.shotNumber),
          })
          notificationHistoryService.addRecord({
            type: 'success',
            title: successTitle,
            message: successMsg,
            shotNumber: String(item.shotNumber),
          })

          console.log(`[Generate] Seedance12AI 视频生成完成: ${finalVideoUrl}`)
        }
      } else if (apiProvider === 'yunwu') {
        const config = apiConfigs.yunwu
        if (!config.apiKey) {
          throw new Error('请先在设置中配置云雾 API Key')
        }

        if (isImage) {
          updateWorkItem(item.id, {
            generationState: { status: 'processing', progress: 10, message: '正在生成图片...' },
          })

          const service = new YunwuImageService(config)

          const shouldCompress = useAppStore.getState().settings.compressReferenceImages

          const referenceImages: string[] = []
          const orderedRefImages = reorderReferenceImages(item.referenceImages, finalPrompt)
          for (const refImg of orderedRefImages) {
            const imagePath = refImg.path || refImg.preview
            if (imagePath) {
              try {
                const { readFile } = await import('@tauri-apps/plugin-fs')
                const fileData = await readFile(imagePath)
                const base64 = btoa(
                  new Uint8Array(fileData).reduce(
                    (data, byte) => data + String.fromCharCode(byte),
                    ''
                  )
                )
                const ext = imagePath.split('.').pop()?.toLowerCase() || 'png'
                const mimeTypeMap: Record<string, string> = {
                  'png': 'image/png',
                  'jpg': 'image/jpeg',
                  'jpeg': 'image/jpeg',
                  'gif': 'image/gif',
                  'webp': 'image/webp',
                  'bmp': 'image/bmp',
                }
                const mimeType = mimeTypeMap[ext] || 'image/png'
                const rawDataUrl = `data:${mimeType};base64,${base64}`
                if (shouldCompress) {
                  const compressed = await compressImage(rawDataUrl)
                  referenceImages.push(compressed)
                  console.log(`[Yunwu] 参考图片 ${referenceImages.length} 已压缩, 大小: ${Math.round(compressed.length / 1024)}KB`)
                } else {
                  referenceImages.push(rawDataUrl)
                  console.log(`[Yunwu] 参考图片 ${referenceImages.length} 未压缩, 大小: ${Math.round(rawDataUrl.length / 1024)}KB`)
                }
              } catch (readError) {
                console.warn('[Yunwu] 读取参考图片失败:', readError)
              }
            }
          }

          const aspectRatioMap: Record<string, string> = {
            '9:16': '9:16',
            '16:9': '16:9',
            '4:3': '4:3',
            '3:4': '3:4',
            '1:1': '1:1',
          }

          const imageSizeMap: Record<string, string> = {
            '2k': '2K',
            '4k': '4K',
            '1k': '1K',
            '1K': '1K',
            '2K': '2K',
            '4K': '4K',
          }

          const result = await withTimeout(
            service.generateImage({
              prompt: finalPrompt,
              aspectRatio: aspectRatioMap[item.aspectRatio] || '16:9',
              imageSize: imageSizeMap[item.resolution] || '1K',
              referenceImages,
            }),
            IMAGE_GENERATION_TIMEOUT_MS,
            '图片生成超时（10分钟），已自动取消'
          )

          if (!result.success) {
            throw new Error(result.error || '生成失败')
          }

          if (!result.imageData || !result.mimeType) {
            throw new Error('未返回图片数据')
          }

          updateWorkItem(item.id, {
            generationState: { status: 'processing', progress: 80, message: '正在保存图片...' },
          })

          const base64Data = `data:${result.mimeType};base64,${result.imageData}`
          const saveResult = await saveImageToTaskFolder(
            base64Data,
            activeTask.path,
            item.shotNumber,
            Date.now()
          )

          if (!saveResult.success || !saveResult.path) {
            throw new Error(saveResult.error || '保存图片失败')
          }

          const generatedImage: GeneratedImage = {
            id: `img-${Date.now()}`,
            url: saveResult.path,
            thumbnailUrl: saveResult.thumbnailPath,
            timestamp: Date.now(),
            prompt: currentPrompt,
            referenceImages: item.referenceImages.map(img => img.preview),
          }

          const currentState = useAppStore.getState()
          const videoItem = currentState.workItems.find(
            (workItem) => workItem.type === 'video' && String(workItem.shotNumber) === String(item.shotNumber)
          )
          const lipsyncItem = currentState.workItems.find(
            (workItem) => workItem.type === 'lipsync' && String(workItem.shotNumber) === String(item.shotNumber)
          )

          console.log(`[Generate] Yunwu: 查找关联项目 - 当前镜头: ${item.shotNumber}, videoItem: ${videoItem?.id}, lipsyncItem: ${lipsyncItem?.id}`)

          const timestamp = Date.now()

          const newFirstFrame: ReferenceImage = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file: null,
            preview: saveResult.path,
            path: saveResult.path,
            thumbnailUrl: saveResult.thumbnailPath,
            name: `镜头${item.shotNumber}_首帧`,
            order: 0,
            slotIndex: 0,
            timestamp,
          }

          console.log(`[Generate] Yunwu: newFirstFrame =`, newFirstFrame)

          const updates: Array<{ id: string; updates: Record<string, unknown> }> = [
            {
              id: item.id,
              updates: {
                generatedImage,
                generationState: { status: 'completed', progress: 100, message: '生成完成' },
                currentTaskId: undefined,
              }
            }
          ]

          if (videoItem) {
            updates.push({
              id: videoItem.id,
              updates: { firstFrame: newFirstFrame }
            })
            console.log(`[Generate] Yunwu: 关联视频首帧 - videoItem.id: ${videoItem.id}`)
          }

          if (lipsyncItem) {
            updates.push({
              id: lipsyncItem.id,
              updates: { firstFrame: newFirstFrame }
            })
            console.log(`[Generate] Yunwu: 关联对口型首帧 - lipsyncItem.id: ${lipsyncItem.id}`)
          }

          console.log(`[Generate] Yunwu: 准备批量更新 ${updates.length} 个项目`)
          updates.forEach((u, i) => console.log(`  [${i}] id: ${u.id}, updates:`, u.updates))

          if (updates.length > 1) {
            batchUpdateWorkItems(updates)
            console.log(`[Generate] Yunwu: 批量更新完成`)
          } else {
            updateWorkItem(item.id, {
              generatedImage,
              generationState: { status: 'completed', progress: 100, message: '生成完成' },
              currentTaskId: undefined,
            })
          }

          const successTitle = `镜头 #${item.shotNumber} 图片生成成功`
          const successMsg = '云雾图像已生成'
          addToast({
            type: 'success',
            title: successTitle,
            message: successMsg,
            shotNumber: String(item.shotNumber),
          })
          notificationHistoryService.addRecord({
            type: 'success',
            title: successTitle,
            message: successMsg,
            shotNumber: String(item.shotNumber),
          })

          console.log(`[Generate] Yunwu 图片生成完成: ${saveResult.path}`)
        } else {
          // 判断是否使用 Veo 模型
          const videoModel = config.videoModel || 'viduq3-turbo'
          const isVeoModel = videoModel.startsWith('veo') || videoModel.startsWith('grok')

          if (isVeoModel) {
            // Veo 视频生成（云雾统一格式）
            updateWorkItem(item.id, {
              generationState: { status: 'processing', progress: 10, message: '正在准备 Veo 视频任务...' },
            })

            const { YunwuVeoService } = await import('../../services/yunwuVeoService')
            const veoService = new YunwuVeoService(config)

            // Veo 支持图片 URL，需要上传到 TOS
            const images: string[] = []

             if (item.firstFrame || item.lastFrame) {
              const volcarkConfig = apiConfigs.volcark
              const hasTosConfig = volcarkConfig.accessKey && volcarkConfig.secretKey && volcarkConfig.bucket

              if (!hasTosConfig) {
                console.warn('[YunwuVeo] TOS 未配置，询问用户是否降级为文生视频模式')
                const accepted = await showFallbackConfirm(
                  '图片上传失败',
                  'TOS 存储未配置，无法上传参考图片。是否切换为文生视频模式继续生成？'
                )
                if (!accepted) {
                  updateWorkItem(item.id, {
                    generationState: { status: 'error', progress: 0, message: 'TOS 未配置，已取消生成', error: 'TOS 未配置' },
                  })
                  return
                }
              } else {
                const { TosService } = await import('../../services/jimengService')
                const tosService = new TosService({
                  accessKey: volcarkConfig.accessKey || '',
                  secretKey: volcarkConfig.secretKey || '',
                  bucket: volcarkConfig.bucket || '',
                  region: volcarkConfig.region || 'cn-beijing',
                  s3Endpoint: volcarkConfig.s3Endpoint,
                })

                const uploadImageToTos = async (imagePath: string, type: 'first' | 'last'): Promise<string | undefined> => {
                  try {
                    const ext = imagePath.split('.').pop()?.toLowerCase() || 'png'
                    const timestamp = Date.now()
                    const objectKey = `yunwu-veo/${item.shotNumber}/${type}_${timestamp}.${ext}`
                    const mimeTypeMap: Record<string, string> = {
                      'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                      'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp',
                    }
                    const contentType = mimeTypeMap[ext] || 'image/png'
                    console.log(`[YunwuVeo] 正在上传${type === 'first' ? '首帧' : '尾帧'}图片到 TOS...`)
                    const result = await tosService.uploadFile(imagePath, objectKey, contentType)
                    if (result.success && result.url) {
                      console.log(`[YunwuVeo] ${type === 'first' ? '首帧' : '尾帧'}图片上传成功:`, result.url)
                      return result.url
                    } else {
                      console.error(`[YunwuVeo] 上传${type === 'first' ? '首帧' : '尾帧'}图片失败:`, result.error)
                      return undefined
                    }
                  } catch (error) {
                    console.error(`[YunwuVeo] 上传图片异常:`, error)
                    return undefined
                  }
                }

                if (item.firstFrame) {
                  const firstFramePath = item.firstFrame.path || item.firstFrame.preview
                  if (firstFramePath) {
                    const url = await uploadImageToTos(firstFramePath, 'first')
                    if (url) images.push(url)
                  }
                }

                if (item.lastFrame) {
                  const lastFramePath = item.lastFrame.path || item.lastFrame.preview
                  if (lastFramePath) {
                    const url = await uploadImageToTos(lastFramePath, 'last')
                    if (url) images.push(url)
                  }
                }

                if (images.length === 0) {
                  console.warn('[YunwuVeo] 图片上传失败，询问用户是否降级为文生视频模式')
                  const accepted = await showFallbackConfirm(
                    '图片上传失败',
                    '首帧/尾帧图片上传到 TOS 失败，是否切换为文生视频模式继续生成？'
                  )
                  if (!accepted) {
                    updateWorkItem(item.id, {
                      generationState: { status: 'error', progress: 0, message: '图片上传失败，已取消生成', error: '图片上传失败' },
                    })
                    return
                  }
                }
              }
            }

            updateWorkItem(item.id, {
              generationState: { status: 'processing', progress: 15, message: '正在创建 Veo 视频任务...' },
            })

            const aspectRatioMap: Record<string, string> = {
              '9:16': '9:16',
              '16:9': '16:9',
              '4:3': '4:3',
              '3:4': '3:4',
            }

            if (cancelledRef.current) {
              updateWorkItem(item.id, {
                generationState: { status: 'idle', progress: 0, message: '已取消' },
                currentTaskId: undefined,
              })
              return
            }

            const createResult = await veoService.createVideoTask({
              prompt: finalPrompt,
              model: videoModel,
              images: images.length > 0 ? images : undefined,
              enhancePrompt: true,
              enableUpsample: true,
              aspectRatio: aspectRatioMap[item.aspectRatio],
            })

            if (!createResult.success || !createResult.taskId) {
              throw new Error('生成失败')
            }

            updateWorkItem(item.id, {
              currentTaskId: createResult.taskId,
              generationState: { status: 'processing', progress: 20, message: 'Veo 视频任务已创建，等待处理...' },
            })

            const veoResult = await veoService.waitForCompletion(
              createResult.taskId,
              (progress, _status, message) => {
                updateWorkItem(item.id, {
                  generationState: {
                    status: 'processing',
                    progress: 20 + progress * 0.6,
                    message,
                  },
                })
              },
              5000,
              600000,
              () => cancelledRef.current
            )

            if (cancelledRef.current) {
              updateWorkItem(item.id, {
                generationState: { status: 'idle', progress: 0, message: '已取消' },
                currentTaskId: undefined,
              })
              return
            }

            if (!veoResult.success || !veoResult.videoUrl) {
              throw new Error('生成失败')
            }

            const result = veoResult

            updateWorkItem(item.id, {
              generationState: { status: 'processing', progress: 90, message: '正在保存视频...' },
            })

            let finalVideoUrl = result.videoUrl!
            let saveMessage = '生成完成！'

            if (activeTask?.path) {
              try {
                const saveResult = await saveVideoToTaskFolder(
                  result.videoUrl!,
                  activeTask.path,
                  item.shotNumber,
                  Date.now()
                )
                if (saveResult.success && saveResult.path) {
                  finalVideoUrl = saveResult.path
                  clearImageCache(finalVideoUrl)
                  saveMessage = '生成完成！视频已保存'
                } else {
                  saveMessage = `生成完成！保存失败: ${saveResult.error}`
                }
              } catch (saveError) {
                saveMessage = `生成完成！保存异常: ${saveError instanceof Error ? saveError.message : '未知错误'}`
              }
            }

            const generatedVideo: GeneratedVideo = {
              id: `video-${Date.now()}`,
              url: finalVideoUrl,
              originalUrl: result.videoUrl!,
              timestamp: Date.now(),
              prompt: currentPrompt,
              firstFrame: item.firstFrame?.preview || '',
              lastFrame: item.lastFrame?.preview || '',
              duration: item.duration,
            }

            updateWorkItem(item.id, {
              generatedVideo,
              generationState: { status: 'completed', progress: 100, message: saveMessage },
              currentTaskId: undefined,
            })

            const successTitle = `镜头 #${item.shotNumber} 视频生成成功`
            const successMsg = `Veo (${videoModel}) 视频已生成`
            addToast({
              type: 'success',
              title: successTitle,
              message: successMsg,
              shotNumber: String(item.shotNumber),
            })
            notificationHistoryService.addRecord({
              type: 'success',
              title: successTitle,
              message: successMsg,
              shotNumber: String(item.shotNumber),
            })

            console.log(`[Generate] YunwuVeo 视频生成完成: ${finalVideoUrl}`)
          } else {
          // Vidu 视频生成（原有逻辑）
          updateWorkItem(item.id, {
            generationState: { status: 'processing', progress: 10, message: '正在上传图片...' },
          })

          const service = new YunwuVideoService(config)
          const { TosService } = await import('../../services/jimengService')

          // 使用火山引擎的 TOS 配置上传图片
          const volcarkConfig = apiConfigs.volcark
          const tosService = new TosService({
            accessKey: volcarkConfig.accessKey || '',
            secretKey: volcarkConfig.secretKey || '',
            bucket: volcarkConfig.bucket || '',
            region: volcarkConfig.region || 'cn-beijing',
            s3Endpoint: volcarkConfig.s3Endpoint,
          })

          // 上传图片到 TOS 并获取 URL
          const uploadImageToTos = async (imagePath: string, type: 'first' | 'last'): Promise<string | undefined> => {
            try {
              const ext = imagePath.split('.').pop()?.toLowerCase() || 'png'
              const timestamp = Date.now()
              const objectKey = `yunwu-video/${item.shotNumber}/${type}_${timestamp}.${ext}`
              
              const mimeTypeMap: Record<string, string> = {
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif',
                'webp': 'image/webp',
                'bmp': 'image/bmp',
              }
              const contentType = mimeTypeMap[ext] || 'image/png'
              
              console.log(`[Yunwu] 正在上传${type === 'first' ? '首帧' : '尾帧'}图片到 TOS...`)
              const result = await tosService.uploadFile(imagePath, objectKey, contentType)
              
              if (result.success && result.url) {
                console.log(`[Yunwu] ${type === 'first' ? '首帧' : '尾帧'}图片上传成功:`, result.url)
                return result.url
              } else {
                const errMsg = result.error || '未知原因'
                console.error(`[Yunwu] 上传${type === 'first' ? '首帧' : '尾帧'}图片失败:`, errMsg)
                videoLog.error(`TOS 上传${type === 'first' ? '首帧' : '尾帧'}图片失败`, {
                  shotNumber: item.shotNumber,
                  provider: 'yunwu-vidu',
                  errorMessage: errMsg,
                  extra: {
                    filePath: imagePath,
                    objectKey,
                    bucket: volcarkConfig.bucket || '(空)',
                    region: volcarkConfig.region || '(空)',
                    hasAccessKey: !!volcarkConfig.accessKey,
                    hasSecretKey: !!volcarkConfig.secretKey,
                  },
                })
                return undefined
              }
            } catch (error) {
              const errMsg = error instanceof Error ? error.message : '上传请求异常'
              console.error(`[Yunwu] 上传图片异常:`, error)
              videoLog.error(`TOS 上传图片异常`, {
                shotNumber: item.shotNumber,
                provider: 'yunwu-vidu',
                errorMessage: errMsg,
                errorStack: error instanceof Error ? error.stack : undefined,
                extra: {
                  filePath: imagePath,
                  type,
                  bucket: volcarkConfig.bucket || '(空)',
                  hasAccessKey: !!volcarkConfig.accessKey,
                  hasSecretKey: !!volcarkConfig.secretKey,
                },
              })
              return undefined
            }
          }

          let firstFrameUrl: string | undefined
          let lastFrameUrl: string | undefined

          if (item.firstFrame) {
            const firstFramePath = item.firstFrame.path || item.firstFrame.preview
            if (firstFramePath) {
              firstFrameUrl = await uploadImageToTos(firstFramePath, 'first')
            } else {
              videoLog.error('TOS 上传跳过: 首帧图片路径为空', {
                shotNumber: item.shotNumber,
                provider: 'yunwu-vidu',
                extra: {
                  hasFirstFrame: !!item.firstFrame,
                  firstFramePath: item.firstFrame?.path || '(空)',
                  firstFramePreview: item.firstFrame?.preview?.substring(0, 100) || '(空)',
                },
              })
            }
          } else {
            videoLog.error('TOS 上传跳过: 无首帧图片', {
              shotNumber: item.shotNumber,
              provider: 'yunwu-vidu',
            })
          }

          if (item.lastFrame) {
            const lastFramePath = item.lastFrame.path || item.lastFrame.preview
            if (lastFramePath) {
              lastFrameUrl = await uploadImageToTos(lastFramePath, 'last')
            }
          }

          if (!firstFrameUrl && !lastFrameUrl) {
            throw new Error('图片上传失败，请检查 TOS 配置')
          }

          updateWorkItem(item.id, {
            generationState: { status: 'processing', progress: 15, message: '正在创建视频任务...' },
          })

          const resolutionMap: Record<string, '540p' | '720p' | '1080p'> = {
            '2k': '1080p',
            '4k': '1080p',
          }

          const validResolutions = ['540p', '720p', '1080p']
          let resolution: '540p' | '720p' | '1080p' = '720p'
          
          if (config.resolution && validResolutions.includes(config.resolution)) {
            resolution = config.resolution as '540p' | '720p' | '1080p'
          } else if (resolutionMap[item.resolution]) {
            resolution = resolutionMap[item.resolution]
          }
          
          console.log('[Yunwu] 分辨率设置:', { configResolution: config.resolution, itemResolution: item.resolution, finalResolution: resolution })

          const yunwuPrompt = finalPrompt + ',不需要背景音乐'

          const createResult = await service.createVideoTask({
            prompt: yunwuPrompt,
            duration: item.duration,
            resolution,
            firstFrameImage: firstFrameUrl,
            lastFrameImage: lastFrameUrl,
          })

          if (!createResult.success || !createResult.taskId) {
            throw new Error(createResult.error || '创建视频任务失败')
          }

          updateWorkItem(item.id, {
            currentTaskId: createResult.taskId,
            generationState: { status: 'processing', progress: 20, message: '视频任务已创建，等待处理...' },
          })

          const result = await service.waitForCompletion(
            createResult.taskId,
            false,
            (progress, _status, message) => {
              updateWorkItem(item.id, {
                generationState: {
                  status: 'processing',
                  progress: 20 + progress * 0.6,
                  message,
                },
              })
            }
          )

          if (!result.success || !result.videoUrl) {
            throw new Error(result.error || '视频生成失败')
          }

          updateWorkItem(item.id, {
            generationState: { status: 'processing', progress: 90, message: '正在保存视频...' },
          })

          let finalVideoUrl = result.videoUrl
          let saveMessage = '生成完成！'

          if (activeTask?.path) {
            try {
              const saveResult = await saveVideoToTaskFolder(
                result.videoUrl,
                activeTask.path,
                item.shotNumber,
                Date.now()
              )
              if (saveResult.success && saveResult.path) {
                finalVideoUrl = saveResult.path
                clearImageCache(finalVideoUrl)
                saveMessage = '生成完成！视频已保存'
              } else {
                saveMessage = `生成完成！保存失败: ${saveResult.error}`
              }
            } catch (saveError) {
              saveMessage = `生成完成！保存异常: ${saveError instanceof Error ? saveError.message : '未知错误'}`
            }
          }

          const generatedVideo: GeneratedVideo = {
            id: `video-${Date.now()}`,
            url: finalVideoUrl,
            originalUrl: result.videoUrl,
            timestamp: Date.now(),
            prompt: currentPrompt,
            firstFrame: item.firstFrame?.preview || '',
            lastFrame: item.lastFrame?.preview || '',
            duration: item.duration,
          }

          updateWorkItem(item.id, {
            generatedVideo,
            generationState: { status: 'completed', progress: 100, message: saveMessage },
            currentTaskId: undefined,
          })

          const successTitle = `镜头 #${item.shotNumber} 视频生成成功`
          const successMsg = '云雾视频已生成'
          addToast({
            type: 'success',
            title: successTitle,
            message: successMsg,
            shotNumber: String(item.shotNumber),
          })
          notificationHistoryService.addRecord({
            type: 'success',
            title: successTitle,
            message: successMsg,
            shotNumber: String(item.shotNumber),
          })

          console.log(`[Generate] Yunwu 视频生成完成: ${finalVideoUrl}`)
        }
        } // end isVeoModel else (Vidu)
      } else if (apiProvider === 'jimeng') {
        // 即梦视频3.0 视频生成
        if (!isImage) {
          const config = apiConfigs.jimeng
          if (!config.apiKey || !config.apiSecret) {
            throw new Error('请先在设置中配置即梦 Access Key 和 Secret Key')
          }

          updateWorkItem(item.id, {
            generationState: { status: 'processing', progress: 10, message: '正在准备即梦视频3.0任务...' },
          })

          const { JimengVideoService } = await import('../../services/jimengVideoService')
          const jimengVideoService = new JimengVideoService(config)

          // 上传首尾帧到 TOS（使用火山引擎的 TOS 配置）
          const volcarkConfig = apiConfigs.volcark
          const hasTosConfig = volcarkConfig.accessKey && volcarkConfig.secretKey && volcarkConfig.bucket
          let firstFrameUrl: string | undefined
          let lastFrameUrl: string | undefined

          if ((item.firstFrame || item.lastFrame) && hasTosConfig) {
            const { TosService } = await import('../../services/jimengService')
            const tosService = new TosService({
              accessKey: volcarkConfig.accessKey || '',
              secretKey: volcarkConfig.secretKey || '',
              bucket: volcarkConfig.bucket || '',
              region: volcarkConfig.region || 'cn-beijing',
              s3Endpoint: volcarkConfig.s3Endpoint,
            })

            const uploadToTos = async (imagePath: string, type: 'first' | 'last'): Promise<string | undefined> => {
              try {
                const ext = imagePath.split('.').pop()?.toLowerCase() || 'png'
                const timestamp = Date.now()
                const objectKey = `jimeng-video/${item.shotNumber}/${type}_${timestamp}.${ext}`
                const mimeTypeMap: Record<string, string> = {
                  'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                  'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp',
                }
                const contentType = mimeTypeMap[ext] || 'image/png'
                const result = await tosService.uploadFile(imagePath, objectKey, contentType)
                if (result.success && result.url) {
                  console.log(`[JimengVideo] ${type} 帧上传成功:`, result.url)
                  return result.url
                }
                return undefined
              } catch (error) {
                console.error(`[JimengVideo] 上传${type}帧失败:`, error)
                return undefined
              }
            }

            if (item.firstFrame) {
              const path = item.firstFrame.path || item.firstFrame.preview
              if (path) firstFrameUrl = await uploadToTos(path, 'first')
            }
            if (item.lastFrame) {
              const path = item.lastFrame.path || item.lastFrame.preview
              if (path) lastFrameUrl = await uploadToTos(path, 'last')
            }
          } else if ((item.firstFrame || item.lastFrame) && !hasTosConfig) {
            console.warn('[JimengVideo] TOS 未配置，询问用户是否降级为文生视频模式')
            const accepted = await showFallbackConfirm(
              '图片上传失败',
              'TOS 存储未配置，无法上传参考图片。是否切换为文生视频模式继续生成？'
            )
            if (!accepted) {
              updateWorkItem(item.id, {
                generationState: { status: 'error', progress: 0, message: 'TOS 未配置，已取消生成', error: 'TOS 未配置' },
              })
              return
            }
          }

          if (cancelledRef.current) {
            updateWorkItem(item.id, {
              generationState: { status: 'idle', progress: 0, message: '已取消' },
              currentTaskId: undefined,
            })
            return
          }

          updateWorkItem(item.id, {
            generationState: { status: 'processing', progress: 15, message: '正在创建即梦视频3.0任务...' },
          })

          const videoModel = (config.videoModel || 'jimeng_v30_1080p') as import('../../services/jimengVideoService').JimengVideoModel
          const aspectRatioMap: Record<string, string> = {
            '9:16': '9:16', '16:9': '16:9', '4:3': '4:3', '3:4': '3:4', '1:1': '1:1', '21:9': '21:9',
          }

          const createResult = await jimengVideoService.createVideoTask({
            prompt: finalPrompt,
            model: videoModel,
            firstFrameUrl,
            lastFrameUrl,
            aspectRatio: aspectRatioMap[item.aspectRatio] || '16:9',
            duration: item.duration,
          })

          if (!createResult.success || !createResult.taskId || !createResult.reqKey) {
            throw new Error(createResult.error || '创建即梦视频3.0任务失败')
          }

          updateWorkItem(item.id, {
            currentTaskId: createResult.taskId,
            generationState: { status: 'processing', progress: 20, message: '即梦视频3.0任务已创建，等待处理...' },
          })

          const result = await jimengVideoService.waitForCompletion(
            createResult.reqKey,
            createResult.taskId,
            (progress, _status, message) => {
              updateWorkItem(item.id, {
                generationState: {
                  status: 'processing',
                  progress: 20 + progress * 0.6,
                  message,
                },
              })
            },
            5000,
            600000,
            () => cancelledRef.current
          )

          if (cancelledRef.current) {
            updateWorkItem(item.id, {
              generationState: { status: 'idle', progress: 0, message: '已取消' },
              currentTaskId: undefined,
            })
            return
          }

          if (!result.success || !result.videoUrl) {
            throw new Error(result.error || '即梦视频3.0生成失败')
          }

          updateWorkItem(item.id, {
            generationState: { status: 'processing', progress: 90, message: '正在保存视频...' },
          })

          let finalVideoUrl = result.videoUrl
          let saveMessage = '生成完成！'

          if (activeTask?.path) {
            try {
              const saveResult = await saveVideoToTaskFolder(
                result.videoUrl,
                activeTask.path,
                item.shotNumber,
                Date.now()
              )
              if (saveResult.success && saveResult.path) {
                finalVideoUrl = saveResult.path
                clearImageCache(finalVideoUrl)
                saveMessage = '生成完成！视频已保存'
              } else {
                saveMessage = `生成完成！保存失败: ${saveResult.error}`
              }
            } catch (saveError) {
              saveMessage = `生成完成！保存异常: ${saveError instanceof Error ? saveError.message : '未知错误'}`
            }
          }

          const generatedVideo: GeneratedVideo = {
            id: `video-${Date.now()}`,
            url: finalVideoUrl,
            originalUrl: result.videoUrl,
            timestamp: Date.now(),
            prompt: currentPrompt,
            firstFrame: item.firstFrame?.preview || '',
            lastFrame: item.lastFrame?.preview || '',
            duration: item.duration,
          }

          updateWorkItem(item.id, {
            generatedVideo,
            generationState: { status: 'completed', progress: 100, message: saveMessage },
            currentTaskId: undefined,
          })

          const modelLabel = videoModel === 'jimeng_v30_1080p' ? '1080P' : '720P'
          const successTitle = `镜头 #${item.shotNumber} 视频生成成功`
          const successMsg = `即梦3.0 ${modelLabel} 视频已生成`
          addToast({
            type: 'success',
            title: successTitle,
            message: successMsg,
            shotNumber: String(item.shotNumber),
          })
          notificationHistoryService.addRecord({
            type: 'success',
            title: successTitle,
            message: successMsg,
            shotNumber: String(item.shotNumber),
          })

          console.log(`[Generate] 即梦视频3.0 生成完成: ${finalVideoUrl}`)
        }
      } else if (apiProvider === 'volcark') {
        // 火山方舟 Seedance 视频生成
        if (!isImage) {
          const config = apiConfigs.volcark
          if (!config.apiKey) {
            throw new Error('请先在设置中配置火山方舟 API Key')
          }

          updateWorkItem(item.id, {
            generationState: { status: 'processing', progress: 10, message: '正在准备 Seedance 视频任务...' },
          })

          const seedanceService = new SeedanceService(config)

          // 上传首尾帧到 TOS（使用火山引擎的 TOS 配置）
          const volcarkConfig = apiConfigs.volcark
          const hasTosConfig = volcarkConfig.accessKey && volcarkConfig.secretKey && volcarkConfig.bucket
          let firstFrameUrl: string | undefined
          let lastFrameUrl: string | undefined

          if ((item.firstFrame || item.lastFrame) && hasTosConfig) {
            const { TosService } = await import('../../services/jimengService')
            const tosService = new TosService({
              accessKey: volcarkConfig.accessKey || '',
              secretKey: volcarkConfig.secretKey || '',
              bucket: volcarkConfig.bucket || '',
              region: volcarkConfig.region || 'cn-beijing',
              s3Endpoint: volcarkConfig.s3Endpoint,
            })

            const uploadToTos = async (imagePath: string, type: 'first' | 'last'): Promise<string | undefined> => {
              try {
                const ext = imagePath.split('.').pop()?.toLowerCase() || 'png'
                const timestamp = Date.now()
                const objectKey = `seedance/${item.shotNumber}/${type}_${timestamp}.${ext}`
                const mimeTypeMap: Record<string, string> = {
                  'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                  'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp',
                }
                const contentType = mimeTypeMap[ext] || 'image/png'
                const result = await tosService.uploadFile(imagePath, objectKey, contentType)
                if (result.success && result.url) {
                  console.log(`[Seedance] ${type} 帧上传成功:`, result.url)
                  return result.url
                }
                return undefined
              } catch (error) {
                console.error(`[Seedance] 上传${type}帧失败:`, error)
                return undefined
              }
            }

            if (item.firstFrame) {
              const path = item.firstFrame.path || item.firstFrame.preview
              if (path) firstFrameUrl = await uploadToTos(path, 'first')
            }
            if (item.lastFrame) {
              const path = item.lastFrame.path || item.lastFrame.preview
              if (path) lastFrameUrl = await uploadToTos(path, 'last')
            }
          } else if ((item.firstFrame || item.lastFrame) && !hasTosConfig) {
            console.warn('[Seedance] TOS 未配置，询问用户是否降级为文生视频模式')
            const accepted = await showFallbackConfirm(
              '图片上传失败',
              'TOS 存储未配置，无法上传参考图片。是否切换为文生视频模式继续生成？'
            )
            if (!accepted) {
              updateWorkItem(item.id, {
                generationState: { status: 'error', progress: 0, message: 'TOS 未配置，已取消生成', error: 'TOS 未配置' },
              })
              return
            }
          }

          if (cancelledRef.current) {
            updateWorkItem(item.id, {
              generationState: { status: 'idle', progress: 0, message: '已取消' },
              currentTaskId: undefined,
            })
            return
          }

          updateWorkItem(item.id, {
            generationState: { status: 'processing', progress: 15, message: '正在创建 Seedance 视频任务...' },
          })

          const videoModel = config.videoModel
          if (!videoModel) {
            throw new Error('请先在设置中配置火山方舟 Endpoint ID')
          }
          const aspectRatioMap: Record<string, string> = { '9:16': '9:16', '16:9': '16:9' }

          const materials: Array<{ id: string; preview: string; type: 'image' | 'audio' | 'video'; index: number; url?: string; path?: string }> = []
          if (firstFrameUrl) {
            materials.push({ id: 'first', preview: firstFrameUrl, type: 'image', index: 1, url: firstFrameUrl })
          }
          if (lastFrameUrl) {
            materials.push({ id: 'last', preview: lastFrameUrl, type: 'image', index: 2, url: lastFrameUrl })
          }

          const createResult = await seedanceService.createVideoTask({
            prompt: finalPrompt,
            model: videoModel,
            materials,
            aspectRatio: aspectRatioMap[item.aspectRatio],
            duration: item.duration,
          })

          if (!createResult.success || !createResult.taskId) {
            throw new Error(createResult.error || '创建 Seedance 视频任务失败')
          }

          updateWorkItem(item.id, {
            currentTaskId: createResult.taskId,
            generationState: { status: 'processing', progress: 20, message: 'Seedance 视频任务已创建，等待处理...' },
          })

          const result = await seedanceService.waitForCompletion(
            createResult.taskId,
            (progress, _status, message) => {
              updateWorkItem(item.id, {
                generationState: {
                  status: 'processing',
                  progress: 20 + progress * 0.6,
                  message,
                },
              })
            },
            5000,
            600000,
            () => cancelledRef.current
          )

          if (cancelledRef.current) {
            updateWorkItem(item.id, {
              generationState: { status: 'idle', progress: 0, message: '已取消' },
              currentTaskId: undefined,
            })
            return
          }

          if (!result.success || !result.videoUrl) {
            throw new Error(result.error || 'Seedance 视频生成失败')
          }

          updateWorkItem(item.id, {
            generationState: { status: 'processing', progress: 90, message: '正在保存视频...' },
          })

          let finalVideoUrl = result.videoUrl
          let saveMessage = '生成完成！'

          if (activeTask?.path) {
            try {
              const saveResult = await saveVideoToTaskFolder(
                result.videoUrl,
                activeTask.path,
                item.shotNumber,
                Date.now()
              )
              if (saveResult.success && saveResult.path) {
                finalVideoUrl = saveResult.path
                clearImageCache(finalVideoUrl)
                saveMessage = '生成完成！视频已保存'
              } else {
                saveMessage = `生成完成！保存失败: ${saveResult.error}`
              }
            } catch (saveError) {
              saveMessage = `生成完成！保存异常: ${saveError instanceof Error ? saveError.message : '未知错误'}`
            }
          }

          const generatedVideo: GeneratedVideo = {
            id: `video-${Date.now()}`,
            url: finalVideoUrl,
            originalUrl: result.videoUrl,
            timestamp: Date.now(),
            prompt: currentPrompt,
            firstFrame: item.firstFrame?.preview || '',
            lastFrame: item.lastFrame?.preview || '',
            duration: item.duration,
          }

          updateWorkItem(item.id, {
            generatedVideo,
            generationState: { status: 'completed', progress: 100, message: saveMessage },
            currentTaskId: undefined,
          })

          const successTitle = `镜头 #${item.shotNumber} 视频生成成功`
          const successMsg = `Seedance (${videoModel}) 视频已生成`
          addToast({
            type: 'success',
            title: successTitle,
            message: successMsg,
            shotNumber: String(item.shotNumber),
          })
          notificationHistoryService.addRecord({
            type: 'success',
            title: successTitle,
            message: successMsg,
            shotNumber: String(item.shotNumber),
          })

          console.log(`[Generate] Seedance 视频生成完成: ${finalVideoUrl}`)
        }
      }
    } catch (error) {
      console.error('生成失败:', error)
      const errorMessage = error instanceof Error ? error.message : '生成失败'
      updateWorkItem(item.id, {
        generationState: {
          status: 'error',
          progress: 0,
          message: errorMessage,
          error: errorMessage,
        },
        currentTaskId: undefined,
      })
      const errorTitle = `镜头 #${item.shotNumber} 生成失败`
      addToast({
        type: 'error',
        title: errorTitle,
        message: errorMessage,
        shotNumber: String(item.shotNumber),
      })
      notificationHistoryService.addRecord({
        type: 'error',
        title: errorTitle,
        message: errorMessage,
        shotNumber: String(item.shotNumber),
      })
    }
  }, [item, isImage, isGenerating, imageApiProvider, videoApiProvider, apiConfigs.runninghub, apiConfigs.gemini12ai, apiConfigs.yunwu, apiConfigs.volcark, apiConfigs.jimeng, runningHubMappings, runningHubImageMappingId, runningHubVideoMappingId, activeTask, updateWorkItem, settings.maxConcurrent, settings.demoMode, settings.demoScenario, batchUpdateWorkItems])

  const handleImagePreview = useCallback((e: React.MouseEvent, image: string) => {
    e.stopPropagation()
    const assetUrl = image.match(/^[A-Za-z]:[/\\]/) ? convertFileSrc(image) : image
    setPreviewImage(assetUrl)
  }, [])

  const closePreview = useCallback(() => {
    setPreviewImage(null)
  }, [])

  const handleAddShot = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    addWorkItemAfter(item.id, item.type)
  }, [item.id, item.type, addWorkItemAfter])

  const handleRemoveShot = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    removeWorkItem(item.id)
  }, [item.id, removeWorkItem])

  const handleNineGridClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (!isImage || isGenerating) {
      return
    }

    const sourceImage = item.generatedImage?.url
    if (!sourceImage) {
      addToast({
        type: 'error',
        title: `镜头 #${item.shotNumber} 缺少生成结果`,
        message: '请先完成图生图生成后再执行九宫格切割',
      })
      return
    }

    const config = apiConfigs.runninghub
    if (!config.apiKey) {
      addToast({
        type: 'error',
        title: '九宫格切割失败',
        message: '请先在设置中配置 RunningHub API Key',
      })
      return
    }

    if (!activeTask?.path) {
      addToast({
        type: 'error',
        title: '九宫格切割失败',
        message: '未找到当前任务文件夹',
      })
      return
    }

    cancelledRef.current = false
    nineGridCancelledRef.current = false
    isNineGridCuttingRef.current = true

    const runningHubService = new RunningHubService(config)
    nineGridServiceRef.current = runningHubService

    updateWorkItem(item.id, {
      generationState: {
        status: 'pending',
        progress: 0,
        message: '正在提交九宫格切割...',
      },
      currentTaskId: undefined,
    })

    try {
      const submitResult = await runningHubService.submitTask(
        NINE_GRID_MAPPING,
        {
          images: [{ nodeId: '203', base64Data: sourceImage }],
        },
        (progress, message) => {
          updateWorkItem(item.id, {
            generationState: {
              status: 'processing',
              progress: Math.min(30, Math.max(5, progress)),
              message: message || '正在上传切割源图...',
            },
          })
        }
      )

      if (!submitResult.success || !submitResult.taskId) {
        throw new Error(submitResult.error || '九宫格切割任务提交失败')
      }

      updateWorkItem(item.id, {
        generationState: {
          status: 'processing',
          progress: 35,
          message: '正在进行九宫格切割...',
        },
        currentTaskId: submitResult.taskId,
      })

      const result = await runningHubService.waitForCompletion(
        submitResult.taskId,
        (progress) => {
          updateWorkItem(item.id, {
            generationState: {
              status: 'processing',
              progress: Math.min(90, 35 + Math.max(0, progress) * 0.55),
              message: '正在进行九宫格切割...',
            },
          })
        },
        5000,
        600000,
        () => nineGridCancelledRef.current
      )

      if (!result.success) {
        if (result.cancelled) {
          updateWorkItem(item.id, {
            generationState: { status: 'idle', progress: 0, message: '已取消' },
            currentTaskId: undefined,
          })
          return
        }
        throw new Error(result.error || '九宫格切割失败')
      }

      const outputUrls = (result.outputUrls || []).filter(Boolean)
      if (outputUrls.length < 9) {
        throw new Error(`九宫格切割结果数量不足，期望9张，实际${outputUrls.length}张`)
      }

      updateWorkItem(item.id, {
        generationState: {
          status: 'processing',
          progress: 92,
          message: '正在保存九宫格切图...',
        },
      })

      const saveResult = await saveNineGridImagesToTaskFolder(
        outputUrls.slice(0, 9),
        activeTask.path,
        item.shotNumber
      )

      if (!saveResult.success || !saveResult.paths || saveResult.paths.length < 9) {
        throw new Error(saveResult.error || '九宫格切图保存失败')
      }

      updateWorkItem(item.id, {
        generationState: {
          status: 'completed',
          progress: 100,
          message: '九宫格切割完成，已保存到任务文件夹',
        },
        currentTaskId: undefined,
      })

      addToast({
        type: 'success',
        title: `镜头 #${item.shotNumber} 九宫格切割完成`,
        message: '9 张切图已保存到「九宫格」文件夹',
        shotNumber: String(item.shotNumber),
      })
      notificationHistoryService.addRecord({
        type: 'success',
        title: `镜头 #${item.shotNumber} 九宫格切割完成`,
        message: '9 张切图已保存到「九宫格」文件夹',
        shotNumber: String(item.shotNumber),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '九宫格切割失败'
      updateWorkItem(item.id, {
        generationState: {
          status: 'error',
          progress: 0,
          message,
          error: message,
        },
        currentTaskId: undefined,
      })
      addToast({
        type: 'error',
        title: `镜头 #${item.shotNumber} 九宫格切割失败`,
        message,
        shotNumber: String(item.shotNumber),
      })
      notificationHistoryService.addRecord({
        type: 'error',
        title: `镜头 #${item.shotNumber} 九宫格切割失败`,
        message,
        shotNumber: String(item.shotNumber),
      })
    } finally {
      isNineGridCuttingRef.current = false
      nineGridServiceRef.current = null
      nineGridCancelledRef.current = false
    }
  }, [isImage, isGenerating, item.generatedImage?.url, item.shotNumber, apiConfigs.runninghub, activeTask?.path, addToast, updateWorkItem, item.id])

  const resolutionOptions = useMemo(() => [
    { value: '2k', label: '2K' },
    { value: '4k', label: '4K' },
  ], [])

  const aspectRatioOptions = useMemo(() => [
    { value: '9:16', label: '9:16' },
    { value: '16:9', label: '16:9' },
    { value: '4:3', label: '4:3' },
    { value: '3:4', label: '3:4' },
  ], [])

  const handleResolutionChange = useCallback((value: string) => {
    updateWorkItem(item.id, { resolution: value as '2k' | '4k' })
  }, [item.id, updateWorkItem])

  const handleAspectRatioChange = useCallback((value: string) => {
    updateWorkItem(item.id, { aspectRatio: value as '9:16' | '16:9' | '4:3' | '3:4' })
  }, [item.id, updateWorkItem])

  const handleDurationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 5
    const clampedValue = Math.max(1, Math.min(60, value))
    updateWorkItem(item.id, { duration: clampedValue })
  }, [item.id, updateWorkItem])

  const handleRemoveFirstFrame = useCallback(() => {
    updateWorkItem(item.id, { firstFrame: undefined })
  }, [item.id, updateWorkItem])

  const handleRemoveLastFrame = useCallback(() => {
    updateWorkItem(item.id, { lastFrame: undefined })
  }, [item.id, updateWorkItem])

  const handleNineGridPreviewClick = useCallback(() => {
    setShowNineGridPreview(true)
  }, [])

  const handleNineGridPreviewClose = useCallback(() => {
    setShowNineGridPreview(false)
  }, [])

  const [enhanceMenuOpen, setEnhanceMenuOpen] = useState(false)

  const handleEnhanceVideo = useCallback(() => {
    setEnhanceMenuOpen(true)
  }, [])

  const handleDownloadFile = useCallback(async (srcPath: string, type: 'image' | 'video') => {
    try {
      const ext = srcPath.split('.').pop() || (type === 'image' ? 'png' : 'mp4')
      const defaultName = `镜头${item.shotNumber}_${type === 'image' ? 'Image' : 'Video'}.${ext}`
      const filters = type === 'image'
        ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
        : [{ name: '视频', extensions: ['mp4', 'webm', 'mov'] }]

      const destPath = await save({ defaultPath: defaultName, filters })
      if (!destPath) return

      const fs = await import('@tauri-apps/plugin-fs')
      await fs.copyFile(srcPath, destPath)
      addToast({ type: 'success', title: '保存成功' })
    } catch (err) {
      console.error('[WorkCard] 下载失败:', err)
      addToast({ type: 'error', title: '保存失败' })
    }
  }, [item.shotNumber, addToast])

  const handleEnhanceSelect = useCallback(async (resolution: '1080p' | '2k' | '4k') => {
    setEnhanceMenuOpen(false)

    const videoUrl = item.generatedVideo?.originalUrl
    if (!videoUrl || !amkApiKey) return

    cancelledRef.current = false

    updateWorkItem(item.id, {
      generationState: { status: 'processing', progress: 5, message: `正在提交画质增强 (${resolution})...` },
    })

    try {
      const service = new EnhanceVideoService(amkApiKey)

      const submitResult = await service.submitEnhance(videoUrl, resolution, settings.enhanceScene || 'short_series')
      if (!submitResult.success || !submitResult.taskId) {
        throw new Error(submitResult.error || '提交画质增强失败')
      }

      updateWorkItem(item.id, {
        generationState: { status: 'processing', progress: 10, message: '画质增强任务已提交，等待处理...' },
      })

      const result = await service.waitForCompletion(
        submitResult.taskId,
        (progress, message) => {
          updateWorkItem(item.id, {
            generationState: { status: 'processing', progress: 10 + progress * 0.8, message },
          })
        },
        () => cancelledRef.current
      )

      if (!result.success || !result.videoUrl) {
        if (cancelledRef.current) {
          updateWorkItem(item.id, {
            generationState: { status: 'idle', progress: 0, message: '已取消' },
          })
          return
        }
        throw new Error(result.error || '画质增强失败')
      }

      // 保存增强后的视频到本地
      let finalUrl = result.videoUrl
      let saveMessage = `画质增强完成 (${result.resolution || resolution})`

      if (activeTask?.path) {
        try {
          const saveResult = await saveVideoToTaskFolder(
            result.videoUrl,
            activeTask.path,
            item.shotNumber,
            Date.now()
          )
          if (saveResult.success && saveResult.path) {
            finalUrl = saveResult.path
            clearImageCache(finalUrl)
            saveMessage += '，已保存'
          }
        } catch {
          // 保存失败不影响
        }
      }

      // 更新视频 URL
      const updatedVideo = {
        ...item.generatedVideo!,
        url: finalUrl,
        originalUrl: result.videoUrl,
      }

      updateWorkItem(item.id, {
        generatedVideo: updatedVideo,
        generationState: { status: 'completed', progress: 100, message: saveMessage },
      })

      addToast({
        type: 'success',
        title: `镜头 #${item.shotNumber} 画质增强完成`,
        message: saveMessage,
        shotNumber: String(item.shotNumber),
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : '画质增强失败'
      updateWorkItem(item.id, {
        generationState: { status: 'error', progress: 0, message: msg, error: msg },
      })
      addToast({
        type: 'error',
        title: `镜头 #${item.shotNumber} 画质增强失败`,
        message: msg,
        shotNumber: String(item.shotNumber),
      })
    }
  }, [item.id, item.generatedVideo, item.shotNumber, amkApiKey, activeTask?.path, updateWorkItem, addToast])

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'NINEGRID_IMAGE_DRAG_START') {
        currentNineGridDragData = e.data.payload
        isNineGridDragging = true
      } else if (e.data?.type === 'NINEGRID_IMAGE_DRAG_END') {
        isNineGridDragging = false
        const { x, y, path, index } = e.data.payload || {}
        if (path && typeof x === 'number' && typeof y === 'number' && !isImage) {
          const elementsAtPoint = document.elementsFromPoint(x, y)
          const frameSlot = elementsAtPoint.find(el => {
            const className = el.getAttribute('class') || ''
            return className.includes('frameSlot')
          })
          if (frameSlot && frameSlot.closest('[data-item-id="' + item.id + '"]')) {
            const label = frameSlot.querySelector('[class*="frameLabel"]')?.textContent
            const frameType = label === '首帧' ? 'first' : 'last'

            const fileName = path.split(/[/\\]/).pop() || `九宫格切图${index}`
            const newFrame: ReferenceImage = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              file: null,
              preview: path,
              path: path,
              name: fileName,
              order: 0,
            }

            if (frameType === 'first') {
              updateWorkItem(item.id, { firstFrame: newFrame })
            } else {
              updateWorkItem(item.id, { lastFrame: newFrame })
            }

            addToast({
              type: 'success',
              title: `已设置${frameType === 'first' ? '首帧' : '尾帧'}`,
              message: `九宫格切图 ${index} 已设置为${frameType === 'first' ? '首帧' : '尾帧'}`,
              shotNumber: String(item.shotNumber),
            })
          }
        }
        currentNineGridDragData = null
        setIsDragOverFirstFrame(false)
        setIsDragOverLastFrame(false)
      } else if (e.data?.type === 'NINEGRID_DRAG_OVER') {
        const { frameType } = e.data.payload
        setIsDragOverFirstFrame(frameType === 'first')
        setIsDragOverLastFrame(frameType === 'last')
      } else if (e.data?.type === 'NINEGRID_IMAGE_DROP') {
        const { path, index, frameType } = e.data.payload

        const fileName = path.split(/[/\\]/).pop() || `九宫格切图${index}`
        const newFrame: ReferenceImage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file: null,
          preview: path,
          path: path,
          name: fileName,
          order: 0,
        }

        if (frameType === 'first') {
          updateWorkItem(item.id, { firstFrame: newFrame })
        } else {
          updateWorkItem(item.id, { lastFrame: newFrame })
        }

        addToast({
          type: 'success',
          title: `已设置${frameType === 'first' ? '首帧' : '尾帧'}`,
          message: `九宫格切图 ${index} 已设置为${frameType === 'first' ? '首帧' : '尾帧'}`,
          shotNumber: String(item.shotNumber),
        })

        currentNineGridDragData = null
      }
    }

    window.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [item.id, item.shotNumber, updateWorkItem, addToast])

  const handleFrameDrop = useCallback(async (e: React.DragEvent, frameType: 'first' | 'last') => {
    e.preventDefault()
    e.stopPropagation()

    setIsDragOverFirstFrame(false)
    setIsDragOverLastFrame(false)

    try {
      let imageData = null
      
      const data = e.dataTransfer.getData('application/x-ninegrid-image')
      if (data) {
        imageData = JSON.parse(data)
      } else if (currentNineGridDragData) {
        imageData = currentNineGridDragData
        currentNineGridDragData = null
      }

      if (!imageData) {
        console.log('[WorkCard] 非九宫格图片拖拽，忽略')
        return
      }

      const { path, index } = imageData

      console.log(`[WorkCard] 放置九宫格图片到${frameType}: index=${index}, path=${path}`)

      const fileName = path.split(/[/\\]/).pop() || `九宫格切图${index}`
      const newFrame: ReferenceImage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file: null,
        preview: path,
        path: path,
        name: fileName,
        order: 0,
      }

      if (frameType === 'first') {
        updateWorkItem(item.id, { firstFrame: newFrame })
      } else {
        updateWorkItem(item.id, { lastFrame: newFrame })
      }

      addToast({
        type: 'success',
        title: `已设置${frameType === 'first' ? '首帧' : '尾帧'}`,
        message: `九宫格切图 ${index} 已设置为${frameType === 'first' ? '首帧' : '尾帧'}`,
        shotNumber: String(item.shotNumber),
      })
    } catch (error) {
      console.error('[WorkCard] 处理九宫格图片放置失败:', error)
      addToast({
        type: 'error',
        title: '设置失败',
        message: error instanceof Error ? error.message : '设置帧图片失败',
        shotNumber: String(item.shotNumber),
      })
    }
  }, [item.id, item.shotNumber, updateWorkItem, addToast])

  const handleFrameDragOver = useCallback((e: React.DragEvent, frameType: 'first' | 'last') => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'

    if (frameType === 'first') {
      setIsDragOverFirstFrame(true)
      setIsDragOverLastFrame(false)
    } else {
      setIsDragOverFirstFrame(false)
      setIsDragOverLastFrame(true)
    }
  }, [])

  const handleFrameDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOverFirstFrame(false)
    setIsDragOverLastFrame(false)
  }, [])

  const handlePromptSelectorClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setPromptSelectorAnchor(e.currentTarget)
    setShowPromptSelector(true)
  }, [])

  const handlePromptSelect = useCallback((prompt: string) => {
    setLocalPrompt(prompt)
    updateWorkItem(item.id, { prompt })
  }, [item.id, updateWorkItem])

  return (
    <>
      <div
        className={`${styles.card} ${isActive ? styles.active : ''}`}
        onClick={onClick}
        data-item-id={item.id}
        data-shot-number={item.shotNumber}
      >
        <div className={styles.cardHeader}>
          <div className={styles.shotInfo}>
            <span className={styles.typeIcon}>
              {isImage ? <Image size={16} /> : <Video size={16} />}
            </span>
            <span className={styles.shotNumber}>#{displayShotNumber}</span>
            {settings.demoMode && <span className={styles.demoBadge}>本地演示</span>}
          </div>
          {item.excelData?.novelText && (
            <p className={styles.novelText}>{item.excelData.novelText}</p>
          )}
          <div className={styles.headerActions}>
            {isImage && (
              <button
                className={styles.nineGridBtn}
                onClick={handleNineGridClick}
                title="九宫格"
              >
                <LayoutGrid size={14} />
              </button>
            )}
            {!isImage && (
              <button
                className={styles.nineGridBtn}
                onClick={handleNineGridPreviewClick}
                title="九宫格预览"
              >
                <LayoutGrid size={14} />
              </button>
            )}
            <button 
              className={styles.addShotBtn}
              onClick={handleAddShot}
              title="添加镜头"
            >
              <Plus size={14} />
            </button>
            <button 
              className={styles.removeShotBtn}
              onClick={handleRemoveShot}
              title="删除镜头"
            >
              <Minus size={14} />
            </button>
          </div>
        </div>

        <div className={styles.cardBody}>
          <div className={styles.leftSection}>
            <div className={styles.sectionTitle}>
              提示词 <span className={styles.charCount}>{charCount}/{maxChars}</span>
            </div>
            <textarea
              ref={textareaRef}
              value={localPrompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              onBlur={handlePromptBlur}
              onInput={handlePromptInput}
              onKeyDown={handlePromptKeyDown}
              placeholder={isImage ? "输入生图提示词，输入@引用参考图..." : "输入视频提示词..."}
              className={styles.textarea}
              style={{ fontSize: `${settings.promptFontSize}px` }}
              rows={10}
              onClick={(e) => e.stopPropagation()}
            />
            {/* @ mention popup */}
            {isImage && mentionPopup.show && (() => {
              const refImages = getMentionRefImages().filter(img =>
                !mentionPopup.filterText || img.name.includes(mentionPopup.filterText) || img.mentionText.includes(mentionPopup.filterText)
              )
              return (
                <div
                  ref={mentionPopupRef}
                  className={styles.mentionPopup}
                  style={{
                    position: 'fixed',
                    left: mentionPopup.position.x,
                    top: mentionPopup.position.y - 8,
                    transform: 'translateY(-100%)',
                    zIndex: 1000,
                  }}
                >
                  <div className={styles.mentionHeader}>
                    <span>选择参考图</span>
                    <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>↑↓选择 Enter确认</span>
                  </div>
                  <div className={styles.mentionList}>
                    {refImages.length === 0 ? (
                      <div className={styles.mentionEmpty}>暂无参考图，请先添加</div>
                    ) : (
                      refImages.map((img, index) => (
                        <button
                          key={img.id}
                          className={`${styles.mentionItem} ${index === mentionPopup.selectedIndex ? styles.mentionItemSelected : ''}`}
                          onClick={() => handleMentionSelect(img)}
                        >
                          <div className={styles.mentionItemPreview}>
                            {img.preview ? (
                              <img src={img.preview.match(/^[A-Za-z]:[/\\]/) ? convertFileSrc(img.preview) : img.preview} alt={img.name} />
                            ) : (
                              <div className={styles.mentionItemIcon}>🖼️</div>
                            )}
                          </div>
                          <div className={styles.mentionItemInfo}>
                            <span className={styles.mentionItemText}>{img.mentionText}</span>
                            <span className={styles.mentionItemName}>{img.name}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )
            })()}
          </div>

          <div className={styles.optionsSection}>
            {isImage && (
              <>
                <CustomSelect
                  label="分辨率"
                  value={item.resolution}
                  options={resolutionOptions}
                  onChange={handleResolutionChange}
                />
                <CustomSelect
                  label="图像比例"
                  value={item.aspectRatio}
                  options={aspectRatioOptions}
                  onChange={handleAspectRatioChange}
                />
                <button
                  className={styles.promptSelectBtn}
                  onClick={handlePromptSelectorClick}
                  title="选择提示词"
                >
                  <BookOpen size={14} />
                  选择提示词
                </button>
              </>
            )}

            {!isImage && (
              <>
                <div className={styles.durationInput}>
                  <label className={styles.durationLabel}>时长（秒）</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={item.duration}
                    onChange={handleDurationChange}
                    onClick={(e) => e.stopPropagation()}
                    className={styles.durationField}
                    placeholder="输入秒数"
                  />
                </div>
                {videoApiProvider === 'gemini12ai' && (
                  <div className={styles.fullRefModeToggle}>
                    <label className={styles.toggleLabel}>
                      <input
                        type="checkbox"
                        checked={item.enableFullReferenceMode || false}
                        onChange={(e) => updateWorkItem(item.id, { enableFullReferenceMode: e.target.checked })}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className={styles.toggleText}>全能参考模式</span>
                    </label>
                    <span className={styles.toggleHint} title="开启后，首帧/尾帧图片将作为风格/内容参考，支持 @N 引用">?</span>
                  </div>
                )}
                <button
                  className={styles.promptSelectBtn}
                  onClick={handlePromptSelectorClick}
                  title="选择提示词"
                >
                  <BookOpen size={14} />
                  选择提示词
                </button>
              </>
            )}
          </div>

          <div className={styles.middleSection}>
            <div className={styles.sectionTitle}>
              {isImage ? '参考图片' : '帧图片'}
            </div>

            {isImage && (
              <div className={styles.imagesGrid}>
                {(() => {
                  const nameList: { name: string; type: 'character' | 'scene' | 'prop' }[] = []
                  
                  const characters = item.excelData?.characters || []
                  characters.forEach(c => {
                    if (c && c !== '无' && c !== '-') {
                      nameList.push({ name: c, type: 'character' })
                    }
                  })
                  
                  const scene = item.excelData?.scene
                  if (scene && scene !== '无' && scene !== '-') {
                    nameList.push({ name: scene, type: 'scene' })
                  }
                  
                  const props = item.excelData?.props
                  if (props && props !== '无' && props !== '-') {
                    nameList.push({ name: props, type: 'prop' })
                  }
                  
                  return [0, 1, 2, 3, 4, 5].map((slotIndex) => {
                    const img = item.referenceImages.find(img => img.slotIndex === slotIndex)
                    const hasImage = img && img.preview && img.preview.trim() !== ''
                    const nameInfo = nameList[slotIndex]
                    const characterName = nameInfo?.name || ''
                    
                    return (
                      <div key={slotIndex} className={styles.imageSlot}>
                        {characterName && (
                          <span className={styles.slotLabel} title={characterName}>
                            {characterName.length > 4 ? characterName.slice(0, 4) + '...' : characterName}
                          </span>
                        )}
                        {hasImage ? (
                          <div className={styles.imageItem} onDoubleClick={(e) => handleImagePreview(e, img.preview)}>
                            <LazyImage 
                              src={img.preview} 
                              thumbnailSrc={img.thumbnailUrl}
                              alt={img.name} 
                            />
                            <button
                              className={styles.removeBtn}
                              onClick={(e) => { e.stopPropagation(); handleRemoveImage(img.id) }}
                            >
                              <Plus size={10} style={{ transform: 'rotate(45deg)' }} />
                            </button>
                            {img.path && (
                              <button
                                className={styles.editBtn}
                                onClick={(e) => { e.stopPropagation(); setEditingImagePath({ path: img.path!, type: 'ref', refId: img.id }) }}
                                title="编辑图片"
                              >
                                <Pencil size={10} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            className={styles.addBtn}
                            onClick={(e) => handleShowImageMenu(e, slotIndex)}
                            title={characterName ? `添加: ${characterName}` : `添加参考图 ${slotIndex + 1}`}
                          >
                            <Plus size={16} />
                          </button>
                        )}
                      </div>
                    )
                  })
                })()}
              </div>
            )}

            {!isImage && (
              <div className={`${styles.framesGrid} ${isNineGridDragging ? styles.nineGridDragActive : ''}`}>
                <div className={styles.frameSlot}>
                  <span className={styles.frameLabel}>首帧</span>
                  {item.firstFrame ? (
                    <div
                      className={`${styles.framePreview} ${isDragOverFirstFrame ? styles.dragOver : ''}`}
                      onDragOver={(e) => handleFrameDragOver(e, 'first')}
                      onDragLeave={handleFrameDragLeave}
                      onDrop={(e) => handleFrameDrop(e, 'first')}
                      onDoubleClick={(e) => handleImagePreview(e, item.firstFrame!.preview)}
                    >
                      <LazyImage
                        src={item.firstFrame.preview}
                        thumbnailSrc={item.firstFrame.thumbnailUrl}
                        alt="首帧"
                        timestamp={item.firstFrame.timestamp}
                      />
                      <button
                        className={styles.removeBtn}
                        onClick={(e) => { e.stopPropagation(); handleRemoveFirstFrame() }}
                      >
                        <Plus size={10} style={{ transform: 'rotate(45deg)' }} />
                      </button>
                      {item.firstFrame?.path && (
                        <button
                          className={styles.editBtn}
                          onClick={(e) => { e.stopPropagation(); setEditingImagePath({ path: item.firstFrame!.path!, type: 'firstFrame' }) }}
                          title="编辑图片"
                        >
                          <Pencil size={10} />
                        </button>
                      )}
                      {isDragOverFirstFrame && (
                        <div className={styles.dropOverlay}>放置首帧</div>
                      )}
                    </div>
                  ) : (
                    <div
                      className={`${styles.frameAdd} ${isDragOverFirstFrame ? styles.dragOver : ''}`}
                      onClick={() => handleFrameSelect('first')}
                      onDragOver={(e) => handleFrameDragOver(e, 'first')}
                      onDragLeave={handleFrameDragLeave}
                      onDrop={(e) => handleFrameDrop(e, 'first')}
                    >
                      {isDragOverFirstFrame ? '放置首帧' : <Plus size={16} />}
                    </div>
                  )}
                </div>
                <div className={styles.frameSlot}>
                  <span className={styles.frameLabel}>尾帧</span>
                  {item.lastFrame ? (
                    <div
                      className={`${styles.framePreview} ${isDragOverLastFrame ? styles.dragOver : ''}`}
                      onDragOver={(e) => handleFrameDragOver(e, 'last')}
                      onDragLeave={handleFrameDragLeave}
                      onDrop={(e) => handleFrameDrop(e, 'last')}
                      onDoubleClick={(e) => handleImagePreview(e, item.lastFrame!.preview)}
                    >
                      <LazyImage
                        src={item.lastFrame.preview}
                        thumbnailSrc={item.lastFrame.thumbnailUrl}
                        alt="尾帧"
                        timestamp={item.lastFrame.timestamp}
                      />
                      <button
                        className={styles.removeBtn}
                        onClick={(e) => { e.stopPropagation(); handleRemoveLastFrame() }}
                      >
                        <Plus size={10} style={{ transform: 'rotate(45deg)' }} />
                      </button>
                      {item.lastFrame?.path && (
                        <button
                          className={styles.editBtn}
                          onClick={(e) => { e.stopPropagation(); setEditingImagePath({ path: item.lastFrame!.path!, type: 'lastFrame' }) }}
                          title="编辑图片"
                        >
                          <Pencil size={10} />
                        </button>
                      )}
                      {isDragOverLastFrame && (
                        <div className={styles.dropOverlay}>放置尾帧</div>
                      )}
                    </div>
                  ) : (
                    <div
                      className={`${styles.frameAdd} ${isDragOverLastFrame ? styles.dragOver : ''}`}
                      onClick={() => handleFrameSelect('last')}
                      onDragOver={(e) => handleFrameDragOver(e, 'last')}
                      onDragLeave={handleFrameDragLeave}
                      onDrop={(e) => handleFrameDrop(e, 'last')}
                    >
                      {isDragOverLastFrame ? '放置尾帧' : <Plus size={16} />}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className={styles.rightSection}>
            <div className={styles.sectionTitle}>生成结果</div>

            <div className={styles.resultArea}>
              {isImage ? (
                item.generatedImage ? (
                  isDemoResultUrl(item.generatedImage.url) ? (
                    <div className={styles.demoResult}>
                      <Image size={38} />
                      <strong>本地模拟图片结果</strong>
                      <span>未调用付费 API</span>
                    </div>
                  ) : (
                    <div className={styles.resultPreview} onDoubleClick={(e) => handleImagePreview(e, item.generatedImage!.url)}>
                      <LazyImage
                        src={item.generatedImage.url}
                        thumbnailSrc={item.generatedImage.thumbnailUrl}
                        alt="Generated"
                        timestamp={item.generatedImage.timestamp}
                      />
                      <div className={styles.resultActions}>
                        <button className={styles.resultBtn} title="保存" onClick={(e) => { e.stopPropagation(); handleDownloadFile(item.generatedImage!.url, 'image') }}>
                          <Download size={14} />
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className={styles.emptyResult}>
                    <Image size={32} />
                    <span>等待生成</span>
                  </div>
                )
              ) : (
                item.generatedVideo ? (
                  isDemoResultUrl(item.generatedVideo.url) ? (
                    <div className={styles.demoResult}>
                      <Video size={38} />
                      <strong>本地模拟视频结果</strong>
                      <span>未调用付费 API</span>
                    </div>
                  ) : (
                    <div className={styles.resultPreview}>
                      <video
                        key={item.generatedVideo.id}
                        src={item.generatedVideo.url.match(/^[A-Za-z]:[/\\]/) ? convertFileSrc(item.generatedVideo.url) : item.generatedVideo.url}
                        controls
                      />
                      <div className={styles.resultActions}>
                        {item.generatedVideo.originalUrl && amkApiKey && (
                          <button
                            className={styles.resultBtn}
                            title="画质增强"
                            onClick={(e) => { e.stopPropagation(); handleEnhanceVideo() }}
                          >
                            <Sparkles size={14} />
                          </button>
                        )}
                        <button className={styles.resultBtn} title="保存" onClick={(e) => { e.stopPropagation(); handleDownloadFile(item.generatedVideo!.url, 'video') }}>
                          <Download size={14} />
                        </button>
                      </div>
                      {enhanceMenuOpen && (
                        <div className={styles.enhanceMenu} onClick={(e) => e.stopPropagation()}>
                          <div className={styles.enhanceMenuTitle}>选择目标分辨率</div>
                          <button onClick={() => handleEnhanceSelect('1080p')}>1080p</button>
                          <button onClick={() => handleEnhanceSelect('2k')}>2K</button>
                          <button onClick={() => handleEnhanceSelect('4k')}>4K</button>
                          <button onClick={() => setEnhanceMenuOpen(false)} className={styles.enhanceMenuCancel}>取消</button>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className={styles.emptyResult}>
                    <Video size={32} />
                    <span>等待生成</span>
                  </div>
                )
              )}
            </div>

            <div className={styles.generateBtnWrapper}>
              <button
                className={styles.generateBtn}
                onClick={(e) => { e.stopPropagation(); handleGenerate() }}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <span className={styles.spinner} />
                    {item.generationState.message}
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    开始生成
                  </>
                )}
              </button>

              {isGenerating && (
                <button
                  className={styles.cancelBtn}
                  onClick={(e) => { e.stopPropagation(); handleCancel() }}
                >
                  <Square size={12} />
                  取消
                </button>
              )}
            </div>

            {item.generationState.status === 'processing' && (
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${item.generationState.progress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {previewImage && (
        <div className={styles.previewOverlay} onClick={closePreview}>
          <div className={styles.previewContent} onClick={(e) => e.stopPropagation()}>
            <img 
              src={previewImage.match(/^[A-Za-z]:[/\\]/) ? convertFileSrc(previewImage) : previewImage} 
              alt="Preview" 
            />
            <button className={styles.closePreviewBtn} onClick={closePreview}>
              <X size={24} />
            </button>
          </div>
        </div>
      )}

      <PromptSelector
        isOpen={showPromptSelector}
        onClose={() => setShowPromptSelector(false)}
        onSelect={handlePromptSelect}
        anchorEl={promptSelectorAnchor}
      />

      {showImageMenu && (
        <div 
          ref={imageMenuRef}
          className={styles.imageMenuOverlay}
          style={{ 
            position: 'fixed',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
          }}
          onClick={() => setShowImageMenu(false)}
        >
          <div 
            className={styles.imageMenuPopup}
            style={{
              position: 'fixed',
              left: imageMenuPosition.x,
              top: imageMenuPosition.y,
              transform: 'translate(-50%, -100%)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.imageMenuGrid}>
              <div 
                className={styles.imageMenuItem}
                onClick={() => handleImageMenuOption('character')}
              >
                <div className={styles.imageMenuIcon}>
                  <Users size={24} />
                </div>
                <span>角色库</span>
              </div>
              <div 
                className={styles.imageMenuItem}
                onClick={() => handleImageMenuOption('prop')}
              >
                <div className={styles.imageMenuIcon}>
                  <Package size={24} />
                </div>
                <span>道具库</span>
              </div>
              <div 
                className={styles.imageMenuItem}
                onClick={() => handleImageMenuOption('scene')}
              >
                <div className={styles.imageMenuIcon}>
                  <Mountain size={24} />
                </div>
                <span>场景库</span>
              </div>
              <div 
                className={styles.imageMenuItem}
                onClick={() => handleImageMenuOption('local')}
              >
                <div className={styles.imageMenuIcon}>
                  <FileImage size={24} />
                </div>
                <span>本地文件</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeLibrary && activeLibrary !== 'local' && (
        <div className={styles.libraryOverlay} onClick={handleCloseLibrary}>
          <div
            className={styles.libraryModal}
            style={libraryMaximized ? { width: '65vw', maxWidth: '65vw', height: '65vh', maxHeight: '65vh' } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.libraryHeader}>
              <h3>{getLibraryName(activeLibrary)}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {libraryMaximized && (
                  <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginRight: '8px' }}>
                    滚轮缩放 {libraryZoom}px
                  </span>
                )}
                <button
                  className={styles.libraryCloseBtn}
                  onClick={() => setLibraryMaximized(prev => !prev)}
                  title={libraryMaximized ? '还原' : '最大化'}
                >
                  {libraryMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button className={styles.libraryCloseBtn} onClick={handleCloseLibrary}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className={styles.libraryContent} onWheel={handleLibraryWheel}>
              {isLoadingLibrary ? (
                <div className={styles.libraryLoading}>
                  <Loader2 size={32} className={styles.spinning} />
                  <p>加载中...</p>
                </div>
              ) : !libraryPathsRef.current[activeLibrary] ? (
                <div className={styles.libraryEmpty}>
                  <p>请先设置任务保存路径</p>
                </div>
              ) : libraryImages.length === 0 ? (
                <div className={styles.libraryEmpty}>
                  <Image size={48} strokeWidth={1} />
                  <p>{getLibraryName(activeLibrary)}为空</p>
                  <span>请先在素材库中添加图片</span>
                </div>
              ) : (
                <div
                  className={styles.libraryGrid}
                  style={libraryMaximized ? { gridTemplateColumns: `repeat(auto-fill, minmax(${libraryZoom}px, 1fr))` } : undefined}
                >
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

      {!isImage && (
        <NineGridPreviewModal
          isOpen={showNineGridPreview}
          shotNumber={item.shotNumber}
          taskPath={basePath}
          onClose={handleNineGridPreviewClose}
        />
      )}

      {editingImagePath && (
        <ImageEditor
          imagePath={editingImagePath.path}
          imageName={editingImagePath.path.split(/[/\\]/).pop() || '素材'}
          onSave={(newPath) => {
            const { type, refId } = editingImagePath
            setEditingImagePath(null)
            if (type === 'ref' && refId) {
              updateWorkItem(item.id, {
                referenceImages: item.referenceImages.map(img =>
                  img.id === refId ? { ...img, path: newPath, preview: newPath, timestamp: Date.now() } : img
                ),
              })
            } else if (type === 'firstFrame' && item.firstFrame) {
              updateWorkItem(item.id, {
                firstFrame: { ...item.firstFrame, path: newPath, preview: newPath, timestamp: Date.now() },
              })
            } else if (type === 'lastFrame' && item.lastFrame) {
              updateWorkItem(item.id, {
                lastFrame: { ...item.lastFrame, path: newPath, preview: newPath, timestamp: Date.now() },
              })
            }
          }}
          onClose={() => setEditingImagePath(null)}
        />
      )}

      {fallbackConfirm.show && (
        <div className={styles.confirmOverlay} onClick={() => handleFallbackConfirmResponse(false)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmTitle}>{fallbackConfirm.title}</p>
            <p className={styles.confirmMessage}>{fallbackConfirm.message}</p>
            <div className={styles.confirmActions}>
              <button className={styles.confirmBtnNo} onClick={() => handleFallbackConfirmResponse(false)}>否</button>
              <button className={styles.confirmBtnYes} onClick={() => handleFallbackConfirmResponse(true)}>是</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

WorkCard.displayName = 'WorkCard'

export default WorkCard
