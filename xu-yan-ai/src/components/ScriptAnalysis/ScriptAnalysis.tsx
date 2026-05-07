import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Upload, Sparkles, Users, Package, Image, FileText, History, Trash2, Save, Plus, Edit3, RefreshCw, Pencil, ArrowRightToLine, Settings2, RotateCcw, Pause, Play, Square } from 'lucide-react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useAppStore } from '../../store/appStore'
import { YunwuService } from '../../services/yunwuService'
import { DeepSeekService } from '../../services/deepseekService'
import { YunwuImageService } from '../../services/yunwuImageService'
import { Gemini12AIService } from '../../services/gemini12aiService'
import { RunningHubService } from '../../services/runningHubService'
import { scanCharacterLibrary, matchCharactersForShot } from '../../utils/characterMatcher'
import { loadPrompts, savePrompts, resetPrompts, SHOT_PROMPT_PRESETS, NARRATION_PROMPT_PRESETS, type ScriptAnalysisPrompts, type ShotPromptType, type NarrationPromptType } from '../../utils/promptStorage'
import type {
  ScriptAnalysisRecord,
  ScriptAnalysisCharacter,
  ScriptAnalysisProp,
  ScriptAnalysisScene,
  ScriptAnalysisShot,
} from '../../utils/scriptAnalysisStorage'
import {
  loadScriptAnalysisHistory,
  addScriptAnalysisRecord,
  deleteScriptAnalysisRecord,
  renameScriptAnalysisRecord,
  createNewAnalysisRecord,
  saveAnalysisImage,
  copyImageFileToLibrary,
} from '../../utils/scriptAnalysisStorage'
import CustomSelect from '../CustomSelect/CustomSelect'
import styles from './ScriptAnalysis.module.css'

const STYLE_OPTIONS = [
  { value: '古风写实风格', label: '古风写实风格' },
  { value: '现代都市风', label: '现代都市风' },
  { value: '2D动漫风格', label: '2D动漫风格' },
  { value: 'AICG风格', label: 'AICG风格' },
  { value: '吉卜力风格', label: '吉卜力风格' },
  { value: '宫崎骏风格', label: '宫崎骏风格' },
  { value: '国风3D暗黑史诗', label: '国风3D暗黑史诗' },
]

const YUNWU_IMAGE_MODELS = [
  { value: 'gemini-3-pro-image-preview', label: '云雾 Gemini 3 Pro (推荐)' },
  { value: 'gemini-3.1-flash-image-preview', label: '云雾 Gemini 3.1 Flash (快速)' },
  { value: 'gpt-image-2', label: 'gpt-image-2 (文生图)' },
  { value: 'gpt-image-2-all', label: 'gpt-image-2-all (文生图)' },
]

const GEMINI_12AI_IMAGE_MODELS = [
  { value: 'gemini-3.1-flash-image-preview', label: 'gemini-3.1-flash-image-preview (推荐)' },
  { value: 'gemini-3-pro-image-preview', label: 'gemini-3-pro-image-preview (专业版)' },
  { value: 'gemini-2.5-flash-image', label: 'gemini-2.5-flash-image (快速)' },
]

const RESOLUTION_OPTIONS = [
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K (默认)' },
]

const ASPECT_RATIO_OPTIONS = [
  { value: '9:16', label: '9:16 (竖屏，默认)' },
  { value: '16:9', label: '16:9 (横屏)' },
]

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']

interface LibraryImage {
  id: string
  name: string
  path: string
  preview: string
}

type AnalysisApiType = 'yunwu' | 'yunwu3' | 'deepseek' | 'deepseek-v3.2' | 'gemini-3.1-flash-lite' | 'gemini-3-flash' | 'gemini-3-pro' | 'doubao-seed-2-0-lite' | 'doubao-seed-2-0-mini'
type ShotModeType = 'dialogue' | 'narration'
type ImageApiProviderType = 'yunwu' | 'gemini12ai' | 'runninghub'

const ANALYSIS_API_OPTIONS = [
  { value: 'yunwu', label: '云雾 (Gemini 3.1 Pro)' },
  { value: 'yunwu3', label: '云雾 (Gemini 3 Pro Thinking)' },
  { value: 'gemini-3.1-flash-lite', label: '云雾 (Gemini 3.1 Flash Lite)' },
  { value: 'gemini-3-flash', label: '云雾 (Gemini 3 Flash)' },
  { value: 'gemini-3-pro', label: '云雾 (Gemini 3 Pro)' },
  { value: 'deepseek', label: '云雾 (DeepSeek V3.2 Thinking)' },
  { value: 'deepseek-v3.2', label: '云雾 (DeepSeek V3.2)' },
  { value: 'doubao-seed-2-0-lite', label: '云雾 (Doubao Seed 2.0 Lite)' },
  { value: 'doubao-seed-2-0-mini', label: '云雾 (Doubao Seed 2.0 Pro)' },
]

const SHOT_MODE_OPTIONS = [
  { value: 'dialogue', label: '对话模式' },
  { value: 'narration', label: '解说模式' },
]

const IMAGE_API_PROVIDER_OPTIONS = [
  { value: 'yunwu', label: '云雾 (推荐)' },
  { value: 'gemini12ai', label: '12AI' },
  { value: 'runninghub', label: 'RunningHub' },
]

interface ScriptAnalysisProps {
  isOpen: boolean
  onClose: () => void
}

const ScriptAnalysis: React.FC<ScriptAnalysisProps> = ({ isOpen, onClose }) => {
  const { 
    runningHubMappings, 
    runningHubText2ImageMappingId,
    apiConfigs,
    activeTask,
    user,
    saveCurrentProject,
  } = useAppStore()

  const isAdmin = user?.is_admin ?? false
  
  const [analysisApi, setAnalysisApi] = useState<AnalysisApiType>('yunwu')
  const [characterApi, setCharacterApi] = useState<string>(runningHubText2ImageMappingId || '')
  const [characterApiProvider, setCharacterApiProvider] = useState<ImageApiProviderType>('yunwu')
  const [characterApiModel, setCharacterApiModel] = useState<string>('gemini-3-pro-image-preview')
  const [propApiProvider, setPropApiProvider] = useState<ImageApiProviderType>('yunwu')
  const [propApi, setPropApi] = useState<string>('gemini-3-pro-image-preview')
  const [sceneApiProvider, setSceneApiProvider] = useState<ImageApiProviderType>('yunwu')
  const [sceneApi, setSceneApi] = useState<string>('gemini-3-pro-image-preview')
  const [selectedStyle, setSelectedStyle] = useState<string>(STYLE_OPTIONS[0].value)
  const [resolution, setResolution] = useState<string>('4K')
  const [aspectRatio, setAspectRatio] = useState<string>('9:16')
  
  const [history, setHistory] = useState<ScriptAnalysisRecord[]>([])
  const [currentRecord, setCurrentRecord] = useState<ScriptAnalysisRecord | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  
  const [isConverting, setIsConverting] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatingItems, setGeneratingItems] = useState<Set<string>>(new Set())
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState<string>('')
  const [libraryImages, setLibraryImages] = useState<Map<string, LibraryImage>>(new Map())
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false)
  
  const [shotMode, setShotMode] = useState<ShotModeType>('dialogue')
  const [isGeneratingShots, setIsGeneratingShots] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [shotProgress, setShotProgress] = useState({ current: 0, total: 0 })
  const [shotItems, setShotItems] = useState<ScriptAnalysisShot[]>([])
  const [editingShotIndex, setEditingShotIndex] = useState<number | null>(null)

  // 暂停/取消控制
  const pauseRef = useRef(false)
  const cancelRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  // 暂停后继续需要的上下文
  const resumeContextRef = useRef<{
    batches: Array<{ systemPrompt: string; userMessage: string }>
    currentIndex: number
    globalShotIndex: number
    mode: 'dialogue' | 'narration'
    service: InstanceType<typeof YunwuService> | import('../../services/deepseekService').DeepSeekService
  } | null>(null)
  const [editedShotData, setEditedShotData] = useState<ScriptAnalysisShot | null>(null)

  const processImagePrompt = (prompt: string, isNarration: boolean = false): string => {
    let processed = prompt

    if (isNarration && !prompt.includes('拍摄景别:')) {
      const defaultShotPrompt = ''
      if (prompt.includes('+') || prompt.includes('<br>')) {
        processed = defaultShotPrompt + '+' + processed.replace(/<br>/gi, '+')
      } else if (processed.trim()) {
        processed = defaultShotPrompt + '+' + processed.trim()
      } else {
        processed = defaultShotPrompt
      }
    }

    if (!processed.includes('+') && !processed.includes('<br>')) return processed
    return processed
      .split('+')
      .map(part => part.replace(/<br>/gi, '\n').trim())
      .filter(Boolean)
      .join('\n')
  }

  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemName, setEditingItemName] = useState('')
  const [editingItemType, setEditingItemType] = useState<'character' | 'prop' | 'scene' | null>(null)
  
  const [showPromptModal, setShowPromptModal] = useState(false)
  const [promptTab, setPromptTab] = useState<'convert' | 'analyze' | 'shot' | 'narration'>('convert')
  const [prompts, setPrompts] = useState<ScriptAnalysisPrompts>(() => loadPrompts())
  
  const handleClose = useCallback(() => {
    savePrompts(prompts)
    saveCurrentProject().catch(err => {
      console.error('[ScriptAnalysis] 保存项目失败:', err)
    })
    onClose()
  }, [prompts, saveCurrentProject, onClose])
  
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({})
  
  const text2ImageMappings = runningHubMappings.filter(m => m.type === 'text2image')

  const loadLibraryImages = useCallback(async () => {
    if (!activeTask?.path) return
    
    setIsLoadingLibrary(true)
    const newLibraryImages = new Map<string, LibraryImage>()
    
    try {
      const fs = await import('@tauri-apps/plugin-fs')
      
      const libraries = [
        { type: 'character' as const, folder: '角色库' },
        { type: 'prop' as const, folder: '道具库' },
        { type: 'scene' as const, folder: '场景库' },
      ]
      
      for (const lib of libraries) {
        const libPath = `${activeTask.path}\\${lib.folder}`
        try {
          const exists = await fs.exists(libPath)
          if (!exists) continue
          
          const entries = await fs.readDir(libPath)
          for (const entry of entries) {
            if (entry.isFile && entry.name) {
              const ext = entry.name.toLowerCase()
              if (IMAGE_EXTENSIONS.some(e => ext.endsWith(e))) {
                const filePath = `${libPath}\\${entry.name}`
                const baseName = entry.name.replace(/\.[^.]+$/, '')
                newLibraryImages.set(`${lib.type}-${baseName}`, {
                  id: `${lib.type}-${entry.name}`,
                  name: baseName,
                  path: filePath,
                  preview: convertFileSrc(filePath),
                })
              }
            }
          }
        } catch (err) {
          console.warn(`[ScriptAnalysis] 加载${lib.folder}失败:`, err)
        }
      }
      
      setLibraryImages(newLibraryImages)
    } catch (err) {
      console.error('[ScriptAnalysis] 加载库图片失败:', err)
    } finally {
      setIsLoadingLibrary(false)
    }
  }, [activeTask?.path])

  const loadHistory = useCallback(async () => {
    if (!activeTask?.path) return
    const records = await loadScriptAnalysisHistory(activeTask.path)
    setHistory(records)
  }, [activeTask?.path])

  useEffect(() => {
    if (isOpen && activeTask?.path) {
      loadHistory()
      loadLibraryImages()
    }
  }, [isOpen, activeTask?.path, loadHistory, loadLibraryImages])

  if (!isOpen) return null

  const getServiceInstance = () => {
    if (analysisApi === 'deepseek') {
      return new DeepSeekService({
        apiKey: apiConfigs.yunwu?.apiKey || '',
        endpoint: apiConfigs.yunwu?.endpoint || 'https://yunwu.ai',
        model: 'deepseek-v3.2-thinking',
      })
    }
    
    if (analysisApi === 'deepseek-v3.2') {
      return new DeepSeekService({
        apiKey: apiConfigs.yunwu?.apiKey || '',
        endpoint: apiConfigs.yunwu?.endpoint || 'https://yunwu.ai',
        model: 'deepseek-v3.2',
      })
    }

    if (analysisApi === 'doubao-seed-2-0-lite') {
      return new DeepSeekService({
        apiKey: apiConfigs.yunwu?.apiKey || '',
        endpoint: apiConfigs.yunwu?.endpoint || 'https://yunwu.ai',
        model: 'doubao-seed-2-0-lite-260215',
      })
    }

    if (analysisApi === 'doubao-seed-2-0-mini') {
      return new DeepSeekService({
        apiKey: apiConfigs.yunwu?.apiKey || '',
        endpoint: apiConfigs.yunwu?.endpoint || 'https://yunwu.ai',
        model: 'doubao-seed-2-0-pro-260215',
      })
    }

    let model: string
    if (analysisApi === 'yunwu3') {
      model = 'gemini-3-pro-preview-thinking'
    } else if (analysisApi === 'gemini-3.1-flash-lite') {
      model = 'gemini-3.1-flash-lite-preview'
    } else if (analysisApi === 'gemini-3-flash') {
      model = 'gemini-3-flash-preview'
    } else if (analysisApi === 'gemini-3-pro') {
      model = 'gemini-3-pro-preview'
    } else {
      model = 'gemini-3.1-pro-preview'
    }

    return new YunwuService({
      apiKey: apiConfigs.yunwu?.apiKey || '',
      endpoint: apiConfigs.yunwu?.endpoint || 'https://yunwu.ai',
      model,
    })
  }

  const handleNewRecord = () => {
    const record = createNewAnalysisRecord()
    setCurrentRecord(record)
    setShotItems([])  // 清空镜头生成数据
    setEditingShotIndex(null)  // 清空编辑状态
    setEditedShotData(null)  // 清空编辑数据
    setShotProgress({ current: 0, total: 0 })  // 重置进度
    setIsGeneratingShots(false)  // 重置生成状态
    setIsPaused(false)  // 重置暂停状态
    setError(null)
    // 重置暂停/取消控制
    pauseRef.current = false
    cancelRef.current = false
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    resumeContextRef.current = null
  }

  const handleSelectRecord = (record: ScriptAnalysisRecord) => {
    setCurrentRecord(record)
    setSelectedStyle(record.style)
    setShotItems(record.shots || [])
    setShowHistory(false)
    setError(null)
  }

  const handleDeleteRecord = async (e: React.MouseEvent, recordId: string) => {
    e.stopPropagation()
    if (!activeTask?.path) return
    
    if (confirm('确定要删除这条剧本解析记录吗？相关图片也会被删除。')) {
      await deleteScriptAnalysisRecord(activeTask.path, recordId)
      await loadHistory()
      if (currentRecord?.id === recordId) {
        setCurrentRecord(null)
      }
    }
  }

  const handleStartRename = (e: React.MouseEvent, record: ScriptAnalysisRecord) => {
    e.stopPropagation()
    setEditingRecordId(record.id)
    setEditingName(record.name)
  }

  const handleRenameSubmit = async (recordId: string) => {
    if (!activeTask?.path || !editingName.trim()) return
    
    await renameScriptAnalysisRecord(activeTask.path, recordId, editingName.trim())
    await loadHistory()
    setEditingRecordId(null)
    setEditingName('')
    
    if (currentRecord?.id === recordId) {
      setCurrentRecord(prev => prev ? { ...prev, name: editingName.trim() } : null)
    }
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent, recordId: string) => {
    if (e.key === 'Enter') {
      handleRenameSubmit(recordId)
    } else if (e.key === 'Escape') {
      setEditingRecordId(null)
      setEditingName('')
    }
  }

  const handleSaveRecord = useCallback(async (recordToSave?: ScriptAnalysisRecord) => {
    if (!activeTask?.path) return
    const record = recordToSave || currentRecord
    if (!record) return
    setIsSaving(true)
    try {
      const saveData: ScriptAnalysisRecord = {
        ...record,
        style: selectedStyle,
        updatedAt: Date.now(),
      }
      await addScriptAnalysisRecord(activeTask.path, saveData)
      await loadHistory()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }, [activeTask?.path, currentRecord, selectedStyle, loadHistory])

  const autoSave = useCallback(async (updatedRecord: ScriptAnalysisRecord) => {
    if (!activeTask?.path) return
    try {
      await addScriptAnalysisRecord(activeTask.path, {
        ...updatedRecord,
        updatedAt: Date.now(),
      })
      await loadHistory()
    } catch (err) {
      console.error('[ScriptAnalysis] 自动保存失败:', err)
    }
  }, [activeTask?.path, loadHistory])

  const handleConvert = async () => {
    if (!currentRecord?.novelText?.trim()) return
    setIsConverting(true)
    setError(null)
    try {
      const service = getServiceInstance()
      const result = await service.convertNovelToScript(
        currentRecord.novelText, 
        prompts.convertPrompt
      )
      
      if (result.success && result.script) {
        const updatedRecord = { ...currentRecord, scriptText: result.script }
        setCurrentRecord(updatedRecord)
        await autoSave(updatedRecord)
      } else {
        setError('剧本转换失败，请稍后重试')
      }
    } catch (err) {
      setError('剧本转换失败，请检查网络连接后重试')
    } finally {
      setIsConverting(false)
    }
  }

  const handleAnalyze = async () => {
    if (!currentRecord?.scriptText?.trim()) return
    setIsAnalyzing(true)
    setError(null)
    try {
      const service = getServiceInstance()
      console.log('[ScriptAnalysis] 开始分析剧本...')
      const result = await service.analyzeScript(
        currentRecord.scriptText, 
        selectedStyle, 
        prompts.analyzePrompt
      )
      console.log('[ScriptAnalysis] 分析结果:', result)
      
      if (result.success) {
        console.log('[ScriptAnalysis] 角色:', result.characters?.length || 0)
        console.log('[ScriptAnalysis] 道具:', result.props?.length || 0)
        console.log('[ScriptAnalysis] 场景:', result.scenes?.length || 0)
        
        const cleanName = (name: string): string => {
          let cleaned = name
            .replace(/^[a-zA-Z]\.\s*/i, '')
            .replace(/^[a-zA-Z]\s*/i, '')
            .replace(/\s*\([^)]*\)\s*$/g, '')
            .replace(/\s*（[^）]*）\s*$/g, '')
            .trim()
          return cleaned || name
        }
        
        const toAnalysisItems = <T extends ScriptAnalysisCharacter | ScriptAnalysisProp | ScriptAnalysisScene>(
          items: Array<{ name: string; prompt: string }> = [],
          type: 'character' | 'prop' | 'scene'
        ): T[] =>
          items.map((item, index) => {
            const cleanedName = cleanName(item.name)
            const libraryKey = `${type}-${cleanedName}`
            const libraryImage = libraryImages.get(libraryKey)
            return {
              id: `item-${Date.now()}-${index}`,
              name: cleanedName,
              image: libraryImage?.path || null,
              prompt: item.prompt,
            } as T
          })
        
        const updatedRecord: ScriptAnalysisRecord = {
          ...currentRecord,
          style: selectedStyle,
          characters: toAnalysisItems<ScriptAnalysisCharacter>(result.characters, 'character'),
          props: toAnalysisItems<ScriptAnalysisProp>(result.props, 'prop'),
          scenes: toAnalysisItems<ScriptAnalysisScene>(result.scenes, 'scene'),
        }
        console.log('[ScriptAnalysis] 更新记录:', updatedRecord)
        setCurrentRecord(updatedRecord)
        await autoSave(updatedRecord)
      } else {
        setError('剧本分析失败，请稍后重试')
      }
    } catch (err) {
      console.error('[ScriptAnalysis] 分析错误:', err)
      setError('剧本分析失败，请检查网络连接后重试')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleImageUpload = async (
    itemId: string, 
    type: 'character' | 'prop' | 'scene',
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    if (!file || !currentRecord || !activeTask?.path) return
    
    const items = type === 'character' ? currentRecord.characters 
      : type === 'prop' ? currentRecord.props 
      : currentRecord.scenes
    const item = items.find(i => i.id === itemId)
    const itemName = item?.name || itemId
    
    const savedPath = await copyImageFileToLibrary(activeTask.path, type, file, itemName)
    const imagePath = savedPath
    
    if (imagePath) {
      const updateItems = <T extends { id: string; image: string | null }>(items: T[]) =>
        items.map(item => 
          item.id === itemId ? { ...item, image: imagePath } : item
        )
      
      const updatedRecord: ScriptAnalysisRecord = {
        ...currentRecord,
        characters: type === 'character' ? updateItems(currentRecord.characters) : currentRecord.characters,
        props: type === 'prop' ? updateItems(currentRecord.props) : currentRecord.props,
        scenes: type === 'scene' ? updateItems(currentRecord.scenes) : currentRecord.scenes,
      }
      
      setCurrentRecord(updatedRecord)
      await autoSave(updatedRecord)
    }
    
    event.target.value = ''
  }

  const handleGenerate = async (itemId: string, type: 'character' | 'prop' | 'scene') => {
    if (!activeTask?.path) return
    
    const generatingKey = `${type}-${itemId}`
    
    if (!currentRecord) {
      setError('记录不存在')
      return
    }
    
    const items = type === 'character' ? currentRecord.characters 
      : type === 'prop' ? currentRecord.props 
      : currentRecord.scenes
    const item = items.find(i => i.id === itemId)
    
    if (!item) {
      setError('找不到该元素')
      return
    }
    
    const prompt = item.prompt || ''
    const itemName = item.name
    
    if (!prompt.trim()) {
      setError('请先填写提示词')
      return
    }
    
    setGeneratingItems(prev => new Set(prev).add(generatingKey))
    setError(null)

    setCurrentRecord(prevRecord => {
      if (!prevRecord) return prevRecord
      
      const updateItems = <T extends { id: string; image: string | null }>(items: T[]) =>
        items.map(i => i.id === itemId ? { ...i, image: null } : i)
      
      return {
        ...prevRecord,
        characters: type === 'character' ? updateItems(prevRecord.characters) : prevRecord.characters,
        props: type === 'prop' ? updateItems(prevRecord.props) : prevRecord.props,
        scenes: type === 'scene' ? updateItems(prevRecord.scenes) : prevRecord.scenes,
      }
    })

    try {
      let imageData: string | null = null

      if (type === 'character') {
        if (characterApiProvider === 'runninghub') {
          const mapping = text2ImageMappings.find(m => m.id === characterApi)
          if (!mapping) {
            throw new Error('请先在设置中配置角色文生图API')
          }
          
          const service = new RunningHubService(apiConfigs.runninghub || {})
          const result = await service.generateImage(mapping, { text: prompt })
          
          if (!result.success) {
            throw new Error(result.error || '生成失败')
          }
          
          if (result.outputUrl) {
            const response = await fetch(result.outputUrl)
            const blob = await response.blob()
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result as string)
              reader.readAsDataURL(blob)
            })
            imageData = base64
          }
        } else if (characterApiProvider === 'yunwu') {
          const service = new YunwuImageService({
            apiKey: apiConfigs.yunwu?.apiKey || '',
            endpoint: apiConfigs.yunwu?.endpoint || 'https://yunwu.ai',
            model: characterApiModel,
          })
          const result = await service.generateImage({
            prompt,
            aspectRatio,
            imageSize: resolution,
          })
          if (!result.success) throw new Error(result.error || '生成失败')
          if (result.imageData && result.mimeType) {
            imageData = `data:${result.mimeType};base64,${result.imageData}`
          }
        } else if (characterApiProvider === 'gemini12ai') {
          const service = new Gemini12AIService({
            apiKey: apiConfigs.gemini12ai?.apiKey || '',
            endpoint: apiConfigs.gemini12ai?.endpoint || 'https://cdn.12ai.org',
            model: characterApiModel,
          })
          const result = await service.generateImage({
            prompt,
            aspectRatio,
            imageSize: resolution,
          })
          if (!result.success) throw new Error(result.error || '生成失败')
          if (result.imageData && result.mimeType) {
            imageData = `data:${result.mimeType};base64,${result.imageData}`
          }
        }
      } else {
        const model = type === 'prop' ? propApi : sceneApi
        const provider = type === 'prop' ? propApiProvider : sceneApiProvider
        
        if (provider === 'yunwu') {
          const service = new YunwuImageService({
            apiKey: apiConfigs.yunwu?.apiKey || '',
            endpoint: apiConfigs.yunwu?.endpoint || 'https://yunwu.ai',
            model,
          })
          
          const result = await service.generateImage({
            prompt,
            aspectRatio,
            imageSize: resolution,
          })
          
          if (!result.success) {
            throw new Error(result.error || '生成失败')
          }
          
          if (result.imageData && result.mimeType) {
            imageData = `data:${result.mimeType};base64,${result.imageData}`
          }
        } else if (provider === 'gemini12ai') {
          const service = new Gemini12AIService({
            apiKey: apiConfigs.gemini12ai?.apiKey || '',
            endpoint: apiConfigs.gemini12ai?.endpoint || 'https://cdn.12ai.org',
            model,
          })
          
          const result = await service.generateImage({
            prompt,
            aspectRatio,
            imageSize: resolution,
          })
          
          if (!result.success) {
            throw new Error(result.error || '生成失败')
          }
          
          if (result.imageData && result.mimeType) {
            imageData = `data:${result.mimeType};base64,${result.imageData}`
          }
        } else if (provider === 'runninghub') {
          const mapping = text2ImageMappings.find(m => m.id === model)
          if (!mapping) {
            throw new Error('请先在设置中配置文生图API')
          }
          
          const service = new RunningHubService(apiConfigs.runninghub || {})
          const result = await service.generateImage(mapping, { text: prompt })
          
          if (!result.success) {
            throw new Error(result.error || '生成失败')
          }
          
          if (result.outputUrl) {
            const response = await fetch(result.outputUrl)
            const blob = await response.blob()
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result as string)
              reader.readAsDataURL(blob)
            })
            imageData = base64
          }
        }
      }

      if (imageData) {
        const savedPath = await saveAnalysisImage(
          activeTask.path, 
          '', 
          type, 
          itemId, 
          imageData, 
          itemName
        )
        
        const imagePath = savedPath || imageData
        
        setCurrentRecord(prevRecord => {
          if (!prevRecord) return prevRecord
          
          const updateItems = <T extends { id: string; image: string | null }>(items: T[]) =>
            items.map(i => i.id === itemId ? { ...i, image: imagePath } : i)
          
          const updatedRecord: ScriptAnalysisRecord = {
            ...prevRecord,
            characters: type === 'character' ? updateItems(prevRecord.characters) : prevRecord.characters,
            props: type === 'prop' ? updateItems(prevRecord.props) : prevRecord.props,
            scenes: type === 'scene' ? updateItems(prevRecord.scenes) : prevRecord.scenes,
          }
          
          autoSave(updatedRecord)
          return updatedRecord
        })
      }
    } catch (err) {
      console.error('[ScriptAnalysis] 生成图片失败:', err)
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setGeneratingItems(prev => {
        const next = new Set(prev)
        next.delete(generatingKey)
        return next
      })
    }
  }

  const handlePromptChange = async (itemId: string, type: 'character' | 'prop' | 'scene', prompt: string) => {
    const updateItems = <T extends { id: string; prompt: string }>(items: T[]) =>
      items.map(item => item.id === itemId ? { ...item, prompt } : item)
    
    const updatedRecord = currentRecord ? {
      ...currentRecord,
      characters: type === 'character' ? updateItems(currentRecord.characters) : currentRecord.characters,
      props: type === 'prop' ? updateItems(currentRecord.props) : currentRecord.props,
      scenes: type === 'scene' ? updateItems(currentRecord.scenes) : currentRecord.scenes,
    } : null
    
    setCurrentRecord(updatedRecord)
    if (updatedRecord) {
      await autoSave(updatedRecord)
    }
  }

  const handleStartEditItemName = (itemId: string, type: 'character' | 'prop' | 'scene', currentName: string) => {
    setEditingItemId(itemId)
    setEditingItemType(type)
    setEditingItemName(currentName)
  }

  const handleSaveItemName = async () => {
    if (!editingItemId || !editingItemType || !editingItemName.trim()) return
    
    const updateItems = <T extends { id: string; name: string }>(items: T[]) =>
      items.map(item => item.id === editingItemId ? { ...item, name: editingItemName.trim() } : item)
    
    const updatedRecord = currentRecord ? {
      ...currentRecord,
      characters: editingItemType === 'character' ? updateItems(currentRecord.characters) : currentRecord.characters,
      props: editingItemType === 'prop' ? updateItems(currentRecord.props) : currentRecord.props,
      scenes: editingItemType === 'scene' ? updateItems(currentRecord.scenes) : currentRecord.scenes,
    } : null
    
    setCurrentRecord(updatedRecord)
    if (updatedRecord) {
      await autoSave(updatedRecord)
    }
    
    setEditingItemId(null)
    setEditingItemType(null)
    setEditingItemName('')
  }

  const handleCancelEditItemName = () => {
    setEditingItemId(null)
    setEditingItemType(null)
    setEditingItemName('')
  }

  const handleDeleteItem = async (itemId: string, type: 'character' | 'prop' | 'scene') => {
    const updateItems = <T extends { id: string }>(items: T[]) =>
      items.filter(item => item.id !== itemId)
    
    const updatedRecord = currentRecord ? {
      ...currentRecord,
      characters: type === 'character' ? updateItems(currentRecord.characters) : currentRecord.characters,
      props: type === 'prop' ? updateItems(currentRecord.props) : currentRecord.props,
      scenes: type === 'scene' ? updateItems(currentRecord.scenes) : currentRecord.scenes,
    } : null
    
    setCurrentRecord(updatedRecord)
    if (updatedRecord) {
      await autoSave(updatedRecord)
    }
  }

  const handleAddItem = async (type: 'character' | 'prop' | 'scene') => {
    const newItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: type === 'character' ? '新角色' : type === 'prop' ? '新道具' : '新场景',
      image: null,
      prompt: '',
    }
    
    const updatedRecord = currentRecord ? {
      ...currentRecord,
      characters: type === 'character' ? [...currentRecord.characters, newItem] : currentRecord.characters,
      props: type === 'prop' ? [...currentRecord.props, newItem] : currentRecord.props,
      scenes: type === 'scene' ? [...currentRecord.scenes, newItem] : currentRecord.scenes,
      updatedAt: Date.now(),
    } : null
    
    setCurrentRecord(updatedRecord)
    if (updatedRecord) {
      await autoSave(updatedRecord)
    }
  }

  const runBatchLoop = useCallback(async (
    batches: Array<{ systemPrompt: string; userMessage: string }>,
    startIndex: number,
    startShotIndex: number,
    mode: 'dialogue' | 'narration',
    service: ReturnType<typeof getServiceInstance>,
  ) => {
    void startShotIndex // 保留参数兼容性

    for (let i = startIndex; i < batches.length; i++) {
      // 检查取消
      if (cancelRef.current) {
        setShotItems([])
        setIsGeneratingShots(false)
        setIsPaused(false)
        setShotProgress({ current: 0, total: 0 })
        resumeContextRef.current = null
        return
      }

      // 检查暂停
      if (pauseRef.current) {
        resumeContextRef.current = {
          batches,
          currentIndex: i,
          globalShotIndex: 0, // 不再使用，恢复时从 shotItems.length 获取
          mode,
          service,
        }
        setIsPaused(true)
        setIsGeneratingShots(false)
        return
      }

      setShotProgress({ current: i + 1, total: batches.length })
      const batch = batches[i]

      try {
        const controller = new AbortController()
        abortControllerRef.current = controller

        const result = await service.generateContent(batch.systemPrompt, batch.userMessage, { signal: controller.signal })
        abortControllerRef.current = null

        if (!result.success) {
          console.error(`[ScriptAnalysis] 第 ${i + 1} 批生成失败:`, result.error)
          continue
        }

        const batchShots = service.parseShotsResult(result.text || '', mode)
        const newShots: ScriptAnalysisShot[] = batchShots.map(shot => ({
          shotNumber: '00', // 会在 setShotItems 中重新编号
          novelText: shot.novelText,
          scene: shot.scene,
          imagePrompt: shot.imagePrompt,
          videoPrompt: shot.videoPrompt,
          characters: shot.characters,
          props: shot.props,
        }))

        setShotItems(prev => {
          // 去重：检查新镜头的文案是否和已有镜头重复
          const existingTexts = new Set(prev.map(s => s.novelText.trim()))
          const deduped = newShots.filter(shot => {
            const text = shot.novelText.trim()
            if (!text) return false
            if (existingTexts.has(text)) {
              console.log(`[ScriptAnalysis] 去重: 跳过重复镜头 "${text.substring(0, 30)}..."`)
              return false
            }
            return true
          })

          // 重新编号
          const updated = [...prev]
          for (const shot of deduped) {
            shot.shotNumber = String(updated.length + 1).padStart(2, '0')
            updated.push(shot)
          }

          if (deduped.length < newShots.length) {
            console.log(`[ScriptAnalysis] 去重: 本批 ${newShots.length} 个镜头，去重后 ${deduped.length} 个`)
          }

          // 自动保存
          setCurrentRecord(prevRecord => {
            if (!prevRecord) return prevRecord
            const updatedRecord: ScriptAnalysisRecord = { ...prevRecord, shots: updated, updatedAt: Date.now() }
            autoSave(updatedRecord)
            return updatedRecord
          })
          return updated
        })

        console.log(`[ScriptAnalysis] 第 ${i + 1}/${batches.length} 批完成，本批 ${batchShots.length} 个镜头`)
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          console.log('[ScriptAnalysis] 请求被中断')
          // 暂停或取消导致的中断，不继续
          if (pauseRef.current) {
            resumeContextRef.current = {
              batches,
              currentIndex: i,
              globalShotIndex: 0,
              mode,
              service,
            }
            setIsPaused(true)
            setIsGeneratingShots(false)
          }
          return
        }
        console.error(`[ScriptAnalysis] 第 ${i + 1} 批异常:`, err)
      }
    }

    // 全部完成
    setIsGeneratingShots(false)
    setShotProgress({ current: 0, total: 0 })
    resumeContextRef.current = null
  }, [autoSave])

  const handleGenerateShots = async () => {
    // 解说模式下，优先用剧本内容，剧本为空时自动用小说内容
    const rawText = currentRecord?.scriptText?.trim() 
      || (shotMode === 'narration' && currentRecord?.novelText?.trim()) 
      || ''

    if (!rawText) {
      setError(shotMode === 'narration' ? '请先输入小说或剧本内容' : '请先输入剧本')
      return
    }
    
    if (shotItems.length > 0) {
      if (!confirm('重新生成将清空当前所有镜头，是否继续？')) {
        return
      }
    }
    
    pauseRef.current = false
    cancelRef.current = false
    resumeContextRef.current = null
    setIsGeneratingShots(true)
    setIsPaused(false)
    setError(null)
    setShotItems([])
    
    try {
      const service = getServiceInstance()
      const isUsingNovel = !currentRecord?.scriptText?.trim() && !!currentRecord?.novelText?.trim()
      
      let shotPrompt: string
      if (shotMode === 'narration') {
        shotPrompt = isUsingNovel ? prompts.novelNarrationPrompt || prompts.narrationPrompt : prompts.narrationPrompt
      } else {
        shotPrompt = prompts.shotPrompt
      }

      // 小说解说模式：预处理文本，分离角色定义区和文案区
      let textToProcess = rawText
      if (isUsingNovel && shotMode === 'narration') {
        const lines = rawText.split('\n')
        
        // 优先查找"文案XX"标记（如"文案二十三"、"文案23"等）
        const wananIndex = lines.findIndex(line => /^文案[一二三四五六七八九十\d]+[：:]?\s*$/.test(line.trim()))
        
        if (wananIndex >= 0) {
          // 有"文案"标记：标记前是角色区，标记及之后是文案区
          const characterLines = lines.slice(0, wananIndex).filter(l => l.trim())
          const contentLines = lines.slice(wananIndex).filter(l => l.trim()) // 包含"文案XX"这一行
          
          if (characterLines.length > 0) {
            shotPrompt = shotPrompt + '\n\n【角色参考信息（仅供理解人物关系，不要为这些内容生成镜头）】\n' + characterLines.join('\n')
            console.log(`[ScriptAnalysis] 小说预处理(文案标记): 角色定义 ${characterLines.length} 行, 文案 ${contentLines.length} 行`)
          }
          textToProcess = contentLines.join('\n')
        } else {
          // 没有"文案"标记：用"角色名+冒号+描述"格式识别角色描述区
          // 角色描述行格式：锦素：青年女性，... / 姜杰盔甲：青年男性，...
          const charDescPattern = /^[\u4e00-\u9fff]{1,10}[：:].{5,}/
          
          let lastCharLineIndex = -1
          for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim()
            if (trimmed && charDescPattern.test(trimmed)) {
              lastCharLineIndex = i
            }
          }
          
          if (lastCharLineIndex >= 0 && lastCharLineIndex < lines.length - 1) {
            const characterLines = lines.slice(0, lastCharLineIndex + 1).filter(l => l.trim())
            const contentLines = lines.slice(lastCharLineIndex + 1).filter(l => l.trim())
            
            if (characterLines.length > 0 && contentLines.length > 0) {
              shotPrompt = shotPrompt + '\n\n【角色参考信息（仅供理解人物关系，不要为这些内容生成镜头）】\n' + characterLines.join('\n')
              textToProcess = contentLines.join('\n')
              console.log(`[ScriptAnalysis] 小说预处理(角色冒号格式): 角色描述 ${characterLines.length} 行, 文案 ${contentLines.length} 行`)
            }
          }
        }
      }

      const { getStyleInfo } = await import('../../config/stylePresets')
      const { preprocessScript, splitByStyleMarkers } = await import('../../utils/scriptPreprocessor')
      const styleInfo = getStyleInfo(selectedStyle)
      const systemPrompt = shotPrompt + styleInfo
      const preprocessed = preprocessScript(textToProcess)

      // 构建批次
      const batches: Array<{ systemPrompt: string; userMessage: string }> = []

      // 尝试形象段落分批
      const styleSegments = shotMode === 'narration' ? splitByStyleMarkers(textToProcess) : null

      if (styleSegments && styleSegments.length > 1) {
        let prevLastLines = ''
        for (let i = 0; i < styleSegments.length; i++) {
          const seg = styleSegments[i]
          const charInfoPrefix = preprocessed.characterInfo ? `${preprocessed.characterInfo}\n\n` : ''
          const stylePrefix = seg.styleContext ? `【当前形象设定】${seg.styleContext}\n\n` : ''
          
          if (i === 0) {
            batches.push({ systemPrompt, userMessage: `${charInfoPrefix}${stylePrefix}剧本如下：\n${seg.content}` })
          } else {
            const overlapHint = prevLastLines
              ? `（请继续编号。以下是上一段的结尾供参考，不要为这部分重复生成镜头：\n${prevLastLines}\n\n从这里开始生成新镜头：）\n\n`
              : '（请继续编号）\n\n'
            batches.push({ systemPrompt, userMessage: `${charInfoPrefix}${stylePrefix}${overlapHint}剧本如下：\n${seg.content}` })
          }
          
          // 记录本段最后3行供下一批参考
          const segLines = seg.content.split('\n').filter(l => l.trim())
          prevLastLines = segLines.slice(-3).join('\n')
        }
      } else {
        // 按行数分批
        const contentLines = preprocessed.scriptContent.split('\n').map(l => l.trim()).filter(l => l.length > 0)
        const LINES_PER_BATCH = shotMode === 'narration' ? 15 : 20
        const OVERLAP_LINES = 3 // 上下文重叠行数
        
        if (contentLines.length <= LINES_PER_BATCH) {
          const charInfoPrefix = preprocessed.characterInfo ? `${preprocessed.characterInfo}\n\n` : ''
          batches.push({ systemPrompt, userMessage: `${charInfoPrefix}剧本如下：\n${textToProcess}` })
        } else {
          let i = 0
          let batchIndex = 0
          while (i < contentLines.length) {
            const end = Math.min(i + LINES_PER_BATCH, contentLines.length)
            const chunk = contentLines.slice(i, end).join('\n')
            const charInfoPrefix = preprocessed.characterInfo ? `${preprocessed.characterInfo}\n\n` : ''
            
            if (batchIndex === 0) {
              batches.push({ systemPrompt, userMessage: `${charInfoPrefix}剧本如下：\n${chunk}` })
            } else {
              // 加上前一批最后几行作为上下文
              const overlapStart = Math.max(0, i - OVERLAP_LINES)
              const overlapLines = contentLines.slice(overlapStart, i).join('\n')
              const contextHint = `${charInfoPrefix}（请继续编号。以下是上一段的结尾供参考，不要为这部分重复生成镜头：\n${overlapLines}\n\n从这里开始生成新镜头：）\n\n剧本如下：\n${chunk}`
              batches.push({ systemPrompt, userMessage: contextHint })
            }
            
            batchIndex++
            i = end
          }
        }
      }

      console.log(`[ScriptAnalysis] 共 ${batches.length} 批`)
      setShotProgress({ current: 0, total: batches.length })
      await runBatchLoop(batches, 0, 0, shotMode, service)
    } catch (err) {
      console.error('[ScriptAnalysis] 生成镜头失败:', err)
      setError('镜头生成失败，请检查网络连接后重试')
      setIsGeneratingShots(false)
    }
  }

  const handlePauseShots = useCallback(() => {
    pauseRef.current = true
    // 中断当前请求
    abortControllerRef.current?.abort()
  }, [])

  const handleResumeShots = useCallback(() => {
    const ctx = resumeContextRef.current
    if (!ctx) return
    pauseRef.current = false
    cancelRef.current = false
    setIsPaused(false)
    setIsGeneratingShots(true)
    runBatchLoop(ctx.batches, ctx.currentIndex, ctx.globalShotIndex, ctx.mode, ctx.service)
  }, [runBatchLoop])

  const handleCancelShots = useCallback(() => {
    cancelRef.current = true
    pauseRef.current = false
    abortControllerRef.current?.abort()
    setShotItems([])
    setIsGeneratingShots(false)
    setIsPaused(false)
    setShotProgress({ current: 0, total: 0 })
    resumeContextRef.current = null
  }, [])

  const handleAddShotsToProject = useCallback(async () => {
    if (shotItems.length === 0) {
      setError('没有镜头可添加')
      return
    }

    const { importFromShots, batchUpdateWorkItems } = useAppStore.getState()

    const shotData = shotItems.map((shot, index) => ({
      shotNumber: index + 1,
      novelText: shot.novelText,
      scene: shot.scene,
      imagePrompt: processImagePrompt(shot.imagePrompt, shotMode === 'narration'),
      videoPrompt: shot.videoPrompt,
      characterCount: shot.characters.length,
      characters: shot.characters,
      props: shot.props,
      resolution: '',
      videoWidth: 0,
      videoHeight: 0,
      duration: 5,
    }))

    importFromShots({
      data: shotData,
      totalRows: shotData.length,
      replace: true,
    })

    if (activeTask?.path) {
      try {
        const characterImages = await scanCharacterLibrary(activeTask.path)
        const startShotNumber = 1

        if (characterImages.length > 0) {
          const batchUpdates: Array<{ id: string; updates: Partial<import('../../types').WorkItem> }> = []

          for (const shot of shotItems) {
            const shotNumber = startShotNumber + shotItems.indexOf(shot)
            const matchResult = matchCharactersForShot(shotNumber, shot.characters, characterImages)

            if (matchResult.matchedImages.length > 0) {
              const currentState = useAppStore.getState()
              const targetItem = currentState.workItems.find(
                (item) => item.type === 'image' && item.shotNumber === shotNumber
              )

              if (targetItem) {
                const existingImages = [...targetItem.referenceImages]

                matchResult.matchedImages.forEach((img) => {
                  const newImage = {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${img.slotIndex}`,
                    file: null as File | null,
                    preview: img.path,
                    path: img.path,
                    name: img.name,
                    order: img.slotIndex,
                    slotIndex: img.slotIndex,
                    characterName: img.characterName,
                  }

                  const existingSlotIndex = existingImages.findIndex(i => i.slotIndex === img.slotIndex)
                  if (existingSlotIndex >= 0) {
                    existingImages[existingSlotIndex] = newImage
                  } else {
                    existingImages.push(newImage)
                  }
                })

                batchUpdates.push({
                  id: targetItem.id,
                  updates: {
                    referenceImages: existingImages.slice(0, 6)
                  }
                })
              }
            }
          }

          if (batchUpdates.length > 0) {
            batchUpdateWorkItems(batchUpdates)
          }
        }
      } catch (err) {
        console.error('[ScriptAnalysis] 匹配参考图失败:', err)
      }
    }

    setError(null)
  }, [shotItems, activeTask?.path])

  const handleDeleteShot = async (index: number) => {
    if (!confirm('确定要删除这个镜头吗？')) return
    
    const newShots = shotItems.filter((_, i) => i !== index)
    setShotItems(newShots)
    
    if (currentRecord) {
      const updatedRecord = {
        ...currentRecord,
        shots: newShots,
        updatedAt: Date.now(),
      }
      setCurrentRecord(updatedRecord)
      await autoSave(updatedRecord)
    }
  }

  const handleStartEditShot = (index: number) => {
    setEditingShotIndex(index)
    setEditedShotData({ ...shotItems[index] })
  }

  const handleCancelEditShot = () => {
    setEditingShotIndex(null)
    setEditedShotData(null)
  }

  const handleSaveEditShot = async () => {
    if (editingShotIndex === null || !editedShotData) return
    
    const newShots = [...shotItems]
    newShots[editingShotIndex] = editedShotData
    setShotItems(newShots)
    
    if (currentRecord) {
      const updatedRecord = {
        ...currentRecord,
        shots: newShots,
        updatedAt: Date.now(),
      }
      setCurrentRecord(updatedRecord)
      await autoSave(updatedRecord)
    }
    
    setEditingShotIndex(null)
    setEditedShotData(null)
  }

  const handleEditShotFieldChange = (field: keyof ScriptAnalysisShot, value: string | string[]) => {
    if (!editedShotData) return
    setEditedShotData({
      ...editedShotData,
      [field]: value,
    })
  }

  const renderApiSelector = (
    label: string,
    value: string,
    options: { value: string; label: string }[],
    onChange: (value: string) => void,
    icon: React.ReactNode
  ) => (
    <div className={styles.apiSelector}>
      <div className={styles.apiSelectorLabel}>
        {icon}
        <span>{label}</span>
      </div>
      <CustomSelect
        value={value}
        options={options}
        onChange={onChange}
      />
    </div>
  )

  const renderAnalysisSection = (
    title: string,
    icon: React.ReactNode,
    items: Array<{ id: string; name: string; image: string | null; prompt: string }>,
    type: 'character' | 'prop' | 'scene'
  ) => {
    const getImageSrc = (imagePath: string | null): string | null => {
      if (!imagePath) return null
      if (imagePath.startsWith('data:') || imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        return imagePath
      }
      try {
        return convertFileSrc(imagePath)
      } catch {
        return imagePath
      }
    }

    return (
    <div className={styles.analysisSection}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          {icon}
          <h3>{title}</h3>
          <span className={styles.itemCount}>{items.length}</span>
        </div>
        <button 
          className={styles.addItemBtn}
          onClick={() => handleAddItem(type)}
          title="添加卡片"
        >
          <Plus size={16} />
          <span>添加</span>
        </button>
      </div>
      <div className={styles.sectionContent}>
        {items.length === 0 ? (
          <div className={styles.emptySection}>
            <FileText size={32} />
            <p>暂无{title}</p>
            <span>请先输入剧本并点击"分析"，或点击上方"添加"按钮手动添加</span>
          </div>
        ) : (
          <div className={styles.itemsGrid}>
            {items.map(item => {
              const isGenerating = generatingItems.has(`${type}-${item.id}`)
              const imageSrc = getImageSrc(item.image)
              const isEditingThis = editingItemId === item.id && editingItemType === type
              return (
              <div key={item.id} className={styles.itemCard}>
                <div className={styles.itemHeader}>
                  {isEditingThis ? (
                    <div className={styles.editNameInput}>
                      <input
                        type="text"
                        value={editingItemName}
                        onChange={(e) => setEditingItemName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveItemName()
                          if (e.key === 'Escape') handleCancelEditItemName()
                        }}
                      />
                      <button onClick={handleSaveItemName} title="保存">
                        <Save size={14} />
                      </button>
                      <button onClick={handleCancelEditItemName} title="取消">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <h4>{item.name}</h4>
                      <div className={styles.itemHeaderActions}>
                        <button 
                          className={styles.iconBtn}
                          onClick={() => handleStartEditItemName(item.id, type, item.name)}
                          title="修改名称"
                        >
                          <Pencil size={14} />
                        </button>
                        <button 
                          className={`${styles.iconBtn} ${styles.deleteBtn}`}
                          onClick={() => handleDeleteItem(item.id, type)}
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div 
                  className={styles.itemImage}
                  onMouseEnter={(e) => {
                    const btn = e.currentTarget.querySelector(`.${styles.uploadOverlay}`) as HTMLElement
                    if (btn) btn.style.opacity = '1'
                  }}
                  onMouseLeave={(e) => {
                    const btn = e.currentTarget.querySelector(`.${styles.uploadOverlay}`) as HTMLElement
                    if (btn) btn.style.opacity = '0'
                  }}
                  onClick={() => {
                    if (imageSrc) {
                      setPreviewImage(imageSrc)
                      setPreviewName(item.name)
                    }
                  }}
                >
                  {imageSrc ? (
                    <img src={imageSrc} alt={item.name} />
                  ) : (
                    <div className={styles.imagePlaceholder}>
                      <Image size={32} />
                      <span>暂无图片</span>
                    </div>
                  )}
                  <div className={styles.uploadOverlay}>
                    <input
                      type="file"
                      accept="image/*"
                      ref={el => { fileInputRefs.current[`${type}-${item.id}`] = el }}
                      onChange={(e) => handleImageUpload(item.id, type, e)}
                      style={{ display: 'none' }}
                    />
                    <button 
                      className={styles.uploadBtn}
                      onClick={() => fileInputRefs.current[`${type}-${item.id}`]?.click()}
                    >
                      <Upload size={16} />
                      <span>上传</span>
                    </button>
                  </div>
                </div>
                <div className={styles.itemActions}>
                  <button 
                    className={styles.generateBtn}
                    onClick={() => handleGenerate(item.id, type)}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <span className={styles.spinner} />
                        生成中...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        生成
                      </>
                    )}
                  </button>
                </div>
                <div className={styles.itemPrompt}>
                  <label>提示词</label>
                  <textarea 
                    value={item.prompt}
                    onChange={(e) => handlePromptChange(item.id, type, e.target.value)}
                    placeholder="输入提示词..."
                    rows={3}
                  />
                </div>
              </div>
            )})}
          </div>
        )}
      </div>
    </div>
  )}

  const characterApiOptions = text2ImageMappings.length > 0
    ? text2ImageMappings.map(m => ({ value: m.id, label: m.name }))
    : [{ value: '', label: '请先在设置中配置文生图API' }]

  return (
    <div className={styles.overlay}>
      <div className={styles.window}>
        <div className={styles.header}>
          <h2>剧本分析</h2>
          <div className={styles.headerActions}>
            {(
              <button 
                className={styles.promptBtn}
                onClick={() => setShowPromptModal(true)}
                title="提示词设置"
              >
                <Settings2 size={18} />
                <span>提示词</span>
              </button>
            )}
            <button 
              className={styles.historyToggle}
              onClick={() => setShowHistory(!showHistory)}
              title="历史记录"
            >
              <History size={18} />
              {history.length > 0 && <span className={styles.historyBadge}>{history.length}</span>}
            </button>
            <button className={styles.closeBtn} onClick={handleClose}>
              <X size={20} />
            </button>
          </div>
        </div>
        
        {showHistory && (
          <div className={styles.historyPanel}>
            <div className={styles.historyHeader}>
              <span>历史记录</span>
              <button className={styles.newBtn} onClick={handleNewRecord}>
                <Plus size={14} />
                新建
              </button>
            </div>
            <div className={styles.historyList}>
              {history.length === 0 ? (
                <div className={styles.historyEmpty}>暂无历史记录</div>
              ) : (
                history.map(record => (
                  <div 
                    key={record.id} 
                    className={`${styles.historyItem} ${currentRecord?.id === record.id ? styles.historyItemActive : ''}`}
                    onClick={() => handleSelectRecord(record)}
                  >
                    <div className={styles.historyItemInfo}>
                      {editingRecordId === record.id ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => handleRenameKeyDown(e, record.id)}
                          onBlur={() => handleRenameSubmit(record.id)}
                          onClick={(e) => e.stopPropagation()}
                          className={styles.renameInput}
                          autoFocus
                        />
                      ) : (
                        <span className={styles.historyItemName}>{record.name}</span>
                      )}
                      <span className={styles.historyItemMeta}>
                        {record.style} · {new Date(record.updatedAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <div className={styles.historyItemActions}>
                      <button 
                        className={styles.historyRenameBtn}
                        onClick={(e) => handleStartRename(e, record)}
                        title="重命名"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button 
                        className={styles.historyDeleteBtn}
                        onClick={(e) => handleDeleteRecord(e, record.id)}
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        <div className={styles.apiBar}>
          {renderApiSelector(
            '分析API',
            analysisApi,
            ANALYSIS_API_OPTIONS,
            (v) => setAnalysisApi(v as AnalysisApiType),
            <Sparkles size={16} />
          )}
          {renderApiSelector(
            '风格',
            selectedStyle,
            STYLE_OPTIONS,
            setSelectedStyle,
            <FileText size={16} />
          )}
          <div className={styles.apiSelector}>
            <div className={styles.apiSelectorLabel}>
              <Users size={16} />
              <span>角色API</span>
            </div>
            <CustomSelect
              value={characterApiProvider}
              options={IMAGE_API_PROVIDER_OPTIONS}
              onChange={(v) => setCharacterApiProvider(v as ImageApiProviderType)}
            />
            {characterApiProvider === 'yunwu' ? (
              <CustomSelect
                value={characterApiModel}
                options={YUNWU_IMAGE_MODELS}
                onChange={setCharacterApiModel}
              />
            ) : characterApiProvider === 'gemini12ai' ? (
              <CustomSelect
                value={characterApiModel}
                options={GEMINI_12AI_IMAGE_MODELS}
                onChange={setCharacterApiModel}
              />
            ) : characterApiProvider === 'runninghub' ? (
              <CustomSelect
                value={characterApi}
                options={characterApiOptions}
                onChange={setCharacterApi}
              />
            ) : null}
          </div>
          <div className={styles.apiSelector}>
            <div className={styles.apiSelectorLabel}>
              <Package size={16} />
              <span>道具API</span>
            </div>
            <CustomSelect
              value={propApiProvider}
              options={IMAGE_API_PROVIDER_OPTIONS}
              onChange={(v) => setPropApiProvider(v as ImageApiProviderType)}
            />
            {propApiProvider === 'yunwu' ? (
              <CustomSelect
                value={propApi}
                options={YUNWU_IMAGE_MODELS}
                onChange={setPropApi}
              />
            ) : propApiProvider === 'gemini12ai' ? (
              <CustomSelect
                value={propApi}
                options={GEMINI_12AI_IMAGE_MODELS}
                onChange={setPropApi}
              />
            ) : null}
          </div>
          <div className={styles.apiSelector}>
            <div className={styles.apiSelectorLabel}>
              <Image size={16} />
              <span>场景API</span>
            </div>
            <CustomSelect
              value={sceneApiProvider}
              options={IMAGE_API_PROVIDER_OPTIONS}
              onChange={(v) => setSceneApiProvider(v as ImageApiProviderType)}
            />
            {sceneApiProvider === 'yunwu' ? (
              <CustomSelect
                value={sceneApi}
                options={YUNWU_IMAGE_MODELS}
                onChange={setSceneApi}
              />
            ) : sceneApiProvider === 'gemini12ai' ? (
              <CustomSelect
                value={sceneApi}
                options={GEMINI_12AI_IMAGE_MODELS}
                onChange={setSceneApi}
              />
            ) : null}
          </div>
          {renderApiSelector(
            '分辨率',
            resolution,
            RESOLUTION_OPTIONS,
            setResolution,
            <Image size={16} />
          )}
          {renderApiSelector(
            '比例',
            aspectRatio,
            ASPECT_RATIO_OPTIONS,
            setAspectRatio,
            <Image size={16} />
          )}
        </div>

        {error && (
          <div className={styles.errorBar}>
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {!currentRecord ? (
          <div className={styles.emptyState}>
            <FileText size={48} />
            <p>请选择历史记录或创建新的剧本解析</p>
            <button className={styles.newRecordBtn} onClick={handleNewRecord}>
              <Plus size={16} />
              新建剧本解析
            </button>
          </div>
        ) : (
          <div className={styles.mainContent}>
            <div className={styles.leftPanel}>
              <div className={styles.inputSection}>
                <div className={styles.inputHeader}>
                  <FileText size={16} />
                  <span>小说内容</span>
                  <span className={styles.charCount}>{currentRecord.novelText?.length || 0} 字</span>
                </div>
                <textarea
                  className={styles.textInput}
                  value={currentRecord.novelText}
                  onChange={(e) => setCurrentRecord(prev => prev ? { ...prev, novelText: e.target.value } : null)}
                  placeholder="请输入小说内容..."
                  rows={6}
                />
                <button 
                  className={styles.actionBtn}
                  onClick={handleConvert}
                  disabled={isConverting || !currentRecord.novelText?.trim()}
                >
                  {isConverting ? (
                    <>
                      <span className={styles.spinner} />
                      转换中...
                    </>
                  ) : (
                    '转为剧本'
                  )}
                </button>
              </div>
              
              <div className={styles.inputSection}>
                <div className={styles.inputHeader}>
                  <Sparkles size={16} />
                  <span>剧本内容</span>
                  <span className={styles.charCount}>{currentRecord.scriptText?.length || 0} 字</span>
                </div>
                <textarea
                  className={styles.textInput}
                  value={currentRecord.scriptText}
                  onChange={(e) => setCurrentRecord(prev => prev ? { ...prev, scriptText: e.target.value } : null)}
                  placeholder="转换后的剧本将显示在这里，也可以手动编辑..."
                  rows={8}
                />
                <div className={styles.actionBtnGroup}>
                  <button 
                    className={styles.actionBtn}
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || !currentRecord.scriptText?.trim()}
                  >
                    {isAnalyzing ? (
                      <>
                        <span className={styles.spinner} />
                        分析中...
                      </>
                    ) : (
                      '分析'
                    )}
                  </button>
                  <button 
                    className={`${styles.actionBtn} ${styles.saveBtn}`}
                    onClick={() => handleSaveRecord()}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <span className={styles.spinner} />
                        保存中...
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        保存
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.rightPanel}>
              <div className={styles.libraryRefreshBar}>
                <button 
                  className={styles.refreshLibraryBtn}
                  onClick={loadLibraryImages}
                  disabled={isLoadingLibrary}
                  title="从库中重新加载图片"
                >
                  <RefreshCw size={14} className={isLoadingLibrary ? styles.spinning : ''} />
                  <span>刷新库图片</span>
                </button>
              </div>
              {renderAnalysisSection('角色分析', <Users size={18} />, currentRecord.characters, 'character')}
              {renderAnalysisSection('道具分析', <Package size={18} />, currentRecord.props, 'prop')}
              {renderAnalysisSection('场景分析', <Image size={18} />, currentRecord.scenes, 'scene')}
              
              <div className={styles.shotGeneration}>
                <div className={styles.shotGenerationHeader}>
                  <h3>镜头生成</h3>
                  <div className={styles.shotControls}>
                    <CustomSelect
                      value={shotMode}
                      options={SHOT_MODE_OPTIONS}
                      onChange={(v) => setShotMode(v as ShotModeType)}
                    />
                    <button 
                      className={styles.generateShotBtn}
                      onClick={isPaused ? handleResumeShots : handleGenerateShots}
                      disabled={(isGeneratingShots && !isPaused) || !(currentRecord.scriptText?.trim() || (shotMode === 'narration' && currentRecord.novelText?.trim()))}
                    >
                      {isGeneratingShots ? (
                        <>
                          <span className={styles.spinner} />
                          生成中 ({shotProgress.current}/{shotProgress.total})...
                        </>
                      ) : isPaused ? (
                        <>
                          <Play size={14} />
                          继续生成 ({shotProgress.current}/{shotProgress.total})
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} />
                          开始生成镜头
                        </>
                      )}
                    </button>
                    {(isGeneratingShots || isPaused) && (
                      <>
                        {isGeneratingShots && (
                          <button className={styles.pauseShotBtn} onClick={handlePauseShots} title="终止当前批次，保留已生成镜头">
                            <Pause size={14} />
                            终止
                          </button>
                        )}
                        <button className={styles.cancelShotBtn} onClick={handleCancelShots} title="取消全部，清空镜头">
                          <Square size={14} />
                          取消
                        </button>
                      </>
                    )}
                    {shotItems.length > 0 && (
                      <button 
                        className={styles.addToProjectBtn}
                        onClick={handleAddShotsToProject}
                        title="将镜头添加到项目"
                      >
                        <ArrowRightToLine size={14} />
                        一键添加到镜头
                      </button>
                    )}
                  </div>
                </div>
                
                {shotItems.length > 0 && (
                  <div className={styles.shotList}>
                    {shotItems.map((shot, index) => {
                      const isEditing = editingShotIndex === index
                      const data = isEditing && editedShotData ? editedShotData : shot
                      
                      return (
                        <div key={index} className={styles.shotItem}>
                          <div className={styles.shotHeader}>
                            <span className={styles.shotNumber}>镜头 {shot.shotNumber}</span>
                            <div className={styles.shotActions}>
                              {isEditing ? (
                                <>
                                  <button 
                                    className={styles.shotEditBtn}
                                    onClick={handleCancelEditShot}
                                    title="取消"
                                  >
                                    <X size={14} />
                                  </button>
                                  <button 
                                    className={styles.shotSaveBtn}
                                    onClick={handleSaveEditShot}
                                    title="保存"
                                  >
                                    <Save size={14} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button 
                                    className={styles.shotEditBtn}
                                    onClick={() => handleStartEditShot(index)}
                                    title="编辑"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button 
                                    className={styles.shotDeleteBtn}
                                    onClick={() => handleDeleteShot(index)}
                                    title="删除"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          <div className={styles.shotContent}>
                            <div className={styles.shotInfoRow}>
                              <div className={styles.shotFieldInline}>
                                <label>小说文案</label>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={data.novelText}
                                    onChange={(e) => handleEditShotFieldChange('novelText', e.target.value)}
                                    className={styles.shotEditInput}
                                  />
                                ) : (
                                  <span>{shot.novelText}</span>
                                )}
                              </div>
                              <div className={styles.shotFieldInline}>
                                <label>场景</label>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={data.scene}
                                    onChange={(e) => handleEditShotFieldChange('scene', e.target.value)}
                                    className={styles.shotEditInput}
                                  />
                                ) : (
                                  <span>{shot.scene}</span>
                                )}
                              </div>
                              <div className={styles.shotFieldInline}>
                                <label>参与人物</label>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={data.characters.join('、')}
                                    onChange={(e) => handleEditShotFieldChange('characters', e.target.value.split('、').map(s => s.trim()).filter(Boolean))}
                                    className={styles.shotEditInput}
                                    placeholder="用顿号分隔"
                                  />
                                ) : (
                                  <span>{shot.characters.join('、') || '无'}</span>
                                )}
                              </div>
                              <div className={styles.shotFieldInline}>
                                <label>道具</label>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={data.props || ''}
                                    onChange={(e) => handleEditShotFieldChange('props', e.target.value)}
                                    className={styles.shotEditInput}
                                  />
                                ) : (
                                  <span>{shot.props || '无'}</span>
                                )}
                              </div>
                            </div>
                            <div className={styles.shotField}>
                              <label>生图提示词：</label>
                              <textarea 
                                readOnly={!isEditing}
                                value={data.imagePrompt}
                                onChange={(e) => handleEditShotFieldChange('imagePrompt', e.target.value)}
                                rows={1}
                                style={{ height: 'auto', minHeight: '80px' }}
                                ref={el => {
                                  if (el) {
                                    el.style.height = 'auto'
                                    el.style.height = el.scrollHeight + 'px'
                                  }
                                }}
                              />
                            </div>
                            <div className={styles.shotField}>
                              <label>视频提示词：</label>
                              <textarea 
                                readOnly={!isEditing}
                                value={data.videoPrompt}
                                onChange={(e) => handleEditShotFieldChange('videoPrompt', e.target.value)}
                                rows={1}
                                style={{ height: 'auto', minHeight: '80px' }}
                                ref={el => {
                                  if (el) {
                                    el.style.height = 'auto'
                                    el.style.height = el.scrollHeight + 'px'
                                  }
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showPromptModal && (
        <div className={styles.promptModalOverlay} onClick={() => {
          savePrompts(prompts)
          setShowPromptModal(false)
        }}>
          <div className={styles.promptModal} onClick={e => e.stopPropagation()}>
            <div className={styles.promptModalHeader}>
              <h3>提示词设置</h3>
              <button onClick={() => {
                savePrompts(prompts)
                setShowPromptModal(false)
              }}>
                <X size={20} />
              </button>
            </div>
            
            <div className={styles.promptTabs}>
              <button
                className={`${styles.promptTab} ${promptTab === 'convert' ? styles.promptTabActive : ''}`}
                onClick={() => setPromptTab('convert')}
              >
                转剧本提示词
              </button>
              <button
                className={`${styles.promptTab} ${promptTab === 'analyze' ? styles.promptTabActive : ''}`}
                onClick={() => setPromptTab('analyze')}
              >
                分析提示词
              </button>
              <button
                className={`${styles.promptTab} ${promptTab === 'shot' ? styles.promptTabActive : ''}`}
                onClick={() => setPromptTab('shot')}
              >
                分镜提示词
              </button>
              <button
                className={`${styles.promptTab} ${promptTab === 'narration' ? styles.promptTabActive : ''}`}
                onClick={() => setPromptTab('narration')}
              >
                解说分镜提示词
              </button>
            </div>

            <div className={styles.promptContent}>
              {promptTab === 'shot' && (
                <div className={styles.shotPromptSelector}>
                  <label>提示词模板：</label>
                  <select
                    value={prompts.shotPromptType || 'imageVideo'}
                    onChange={(e) => {
                      const newType = e.target.value as ShotPromptType
                      const preset = SHOT_PROMPT_PRESETS.find(p => p.value === newType)
                      if (preset) {
                        const newPrompts = { ...prompts, shotPromptType: newType, shotPrompt: preset.getDefault() }
                        setPrompts(newPrompts)
                      }
                    }}
                  >
                    {SHOT_PROMPT_PRESETS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {promptTab === 'narration' && (
                <div className={styles.shotPromptSelector}>
                  <label>提示词模板：</label>
                  <select
                    value={prompts.narrationPromptType || 'imageVideo'}
                    onChange={(e) => {
                      const newType = e.target.value as NarrationPromptType
                      const preset = NARRATION_PROMPT_PRESETS.find(p => p.value === newType)
                      if (preset) {
                        const newPrompts = { ...prompts, narrationPromptType: newType, narrationPrompt: preset.getDefault() }
                        setPrompts(newPrompts)
                      }
                    }}
                  >
                    {NARRATION_PROMPT_PRESETS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {isAdmin ? (
                <textarea
                  value={
                    promptTab === 'convert' ? prompts.convertPrompt :
                    promptTab === 'analyze' ? prompts.analyzePrompt :
                    promptTab === 'shot' ? prompts.shotPrompt :
                    prompts.narrationPrompt
                  }
                  onChange={(e) => {
                    const newPrompts = { ...prompts }
                    if (promptTab === 'convert') {
                      newPrompts.convertPrompt = e.target.value
                    } else if (promptTab === 'analyze') {
                      newPrompts.analyzePrompt = e.target.value
                    } else if (promptTab === 'shot') {
                      newPrompts.shotPrompt = e.target.value
                    } else {
                      newPrompts.narrationPrompt = e.target.value
                    }
                    setPrompts(newPrompts)
                  }}
                  placeholder="输入提示词..."
                />
              ) : (
                <div className={styles.promptHidden}>
                  <span>提示词内容仅管理员可查看和编辑</span>
                </div>
              )}
            </div>
            
            {isAdmin && (
            <div className={styles.promptModalFooter}>
              <button 
                className={styles.resetBtn}
                onClick={() => {
                  const defaults = resetPrompts()
                  setPrompts(defaults)
                }}
              >
                <RotateCcw size={14} />
                重置为默认
              </button>
              <button 
                className={styles.saveBtn}
                onClick={() => {
                  savePrompts(prompts)
                  setShowPromptModal(false)
                }}
              >
                <Save size={14} />
                保存
              </button>
            </div>
            )}
          </div>
        </div>
      )}

      {previewImage && (
        <div className={styles.previewOverlay} onClick={() => { setPreviewImage(null); setPreviewName('') }}>
          <div className={styles.previewModal} onClick={e => e.stopPropagation()}>
            <button className={styles.previewCloseBtn} onClick={() => { setPreviewImage(null); setPreviewName('') }}>
              <X size={24} />
            </button>
            <img src={previewImage} alt={previewName} />
            <div className={styles.previewInfo}>
              <span>{previewName}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScriptAnalysis
