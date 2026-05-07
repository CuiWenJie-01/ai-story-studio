export interface ReferenceImage {
  id: string
  file: File | null
  preview: string
  thumbnailUrl?: string
  path?: string
  name: string
  order: number
  slotIndex?: number
  characterName?: string
  timestamp?: number
}

export interface User {
  id: number
  nickname: string
  account: string
  email?: string
  company: string
  department: string
  remaining_days: number
  login_limit: number
  online_count: number
  is_admin: boolean
  password_hash?: string // 存储密码哈希用于启动验证
}

export interface GeneratedImage {
  id: string
  url: string
  thumbnailUrl?: string
  timestamp: number
  prompt: string
  referenceImages: string[]
}

export interface GeneratedVideo {
  id: string
  url: string
  originalUrl?: string
  timestamp: number
  prompt: string
  firstFrame: string
  lastFrame: string
  duration: number
}

export interface PromptPreset {
  id: string
  name: string
  prompt: string
  category: string
}

export type ThemeMode = 'light' | 'dark' | 'system'

export type GenerationStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'error'

export interface GenerationState {
  status: GenerationStatus
  progress: number
  message: string
  error?: string
}

export interface AppSettings {
  theme: ThemeMode
  imageApiEndpoint: string
  videoApiEndpoint: string
  savePath: string
  maxConcurrent: number
  quality: 'standard' | 'high' | 'ultra'
  autoSave: boolean
  promptFontSize: number
  analysisApi: 'yunwu' | 'yunwu3' | 'deepseek' | 'deepseek-v3.2' | 'gemini-3.1-flash-lite' | 'gemini-3-flash' | 'gemini-3-pro' | 'doubao-seed-2-0-lite' | 'doubao-seed-2-0-mini'
  enhanceScene: 'common' | 'ugc' | 'short_series' | 'aigc'
  compressReferenceImages: boolean
}

export interface HistoryRecord {
  id: string
  prompt: string
  referenceImages: string[]
  generatedImages: string[]
  timestamp: number
}

export type WorkType = 'image' | 'video' | 'lipsync' | 'voice' | 'seedance2'

export interface ExcelRowData {
  shotNumber: number
  novelText: string
  scene: string
  imagePrompt: string
  videoPrompt: string
  characterCount: number
  characters: string[]
  props?: string
  resolution: string
  videoWidth: number
  videoHeight: number
  duration: number
}

export interface WorkItem {
  id: string
  type: WorkType
  shotNumber: number | string
  excelData?: ExcelRowData
  prompt: string
  referenceImages: ReferenceImage[]
  firstFrame?: ReferenceImage
  lastFrame?: ReferenceImage
  generatedImage: GeneratedImage | null
  generatedVideo: GeneratedVideo | null
  generatedAudio: GeneratedAudio | null
  generationState: GenerationState
  resolution: '2k' | '4k'
  aspectRatio: '9:16' | '16:9'
  duration: number
  currentTaskId?: string
  lipsyncState?: LipSyncItemState
  voiceState?: VoiceItemState
  enableFullReferenceMode?: boolean
}

export interface ExcelImportResult {
  fileName: string
  sheetName: string
  totalRows: number
  data: ExcelRowData[]
}

export interface CharacterImage {
  name: string
  path: string
}

export interface CharacterMatchResult {
  shotNumber: number | string
  characters: string[]
  matchedImages: Array<CharacterImage & { slotIndex: number; characterName: string }>
  unmatchedCharacters: string[]
  errors: string[]
}

export interface CharacterMatchLog {
  timestamp: number
  action: string
  details: string
  success: boolean
}

export interface ViewAngleSettings {
  horizontalAngle: number
  verticalAngle: number
  zoom: number
}

export interface ViewAngleTask {
  shotNumber: number | string
  settings: ViewAngleSettings
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress: number
  message: string
  resultUrl?: string
  error?: string
}

export interface TaskFolder {
  name: string
  path: string
  createdAt: number
  style?: string
  styleName?: string
}

export type ApiProvider = 'kling' | 'runninghub' | 'jimeng' | 'minimax' | 'gemini12ai' | 'yunwu' | 'volcark'

export interface ApiProviderConfig {
  id: ApiProvider
  name: string
  nameEn: string
  description: string
  website: string
  supportsImage: boolean
  supportsVideo: boolean
  supportsTts?: boolean
}

export interface ApiConfig {
  apiKey: string
  apiSecret?: string
  endpoint?: string
  model?: string
  videoModel?: string
  groupId?: string
  cookie?: string
  resolution?: string
  accessKey?: string
  secretKey?: string
  bucket?: string
  region?: string
  tosEndpoint?: string
  s3Endpoint?: string
}

export interface RunningHubApiMapping {
  id: string
  name: string
  appId: string
  type: 'image' | 'video' | 'viewAngle' | 'text2image'
  nodeInfoList: {
    nodeId: string
    fieldName: string
    description: string
  }[]
}

export const DEFAULT_RUNNINGHUB_MAPPINGS: RunningHubApiMapping[] = [
  {
    id: 'character-consistency',
    name: '人物一致性',
    appId: '2012390844355055618',
    type: 'image',
    nodeInfoList: [
      { nodeId: '6', fieldName: 'image', description: 'image' },
      { nodeId: '7', fieldName: 'image', description: 'image' },
      { nodeId: '8', fieldName: 'image', description: 'image' },
      { nodeId: '9', fieldName: 'image', description: 'image' },
      { nodeId: '10', fieldName: 'image', description: 'image' },
      { nodeId: '11', fieldName: 'image', description: 'image' },
      { nodeId: '4', fieldName: 'aspectRatio', description: 'aspectRatio' },
      { nodeId: '4', fieldName: 'channel', description: 'channel' },
      { nodeId: '4', fieldName: 'resolution', description: 'resolution' },
      { nodeId: '37', fieldName: 'Text', description: 'Text' },
    ],
  },
  {
    id: 'xynanopro',
    name: 'xynanopro',
    appId: '2002544104061976577',
    type: 'image',
    nodeInfoList: [
      { nodeId: '11', fieldName: 'image', description: 'image' },
      { nodeId: '12', fieldName: 'image', description: 'image' },
      { nodeId: '2', fieldName: 'aspectRatio', description: 'aspectRatio' },
      { nodeId: '2', fieldName: 'channel', description: 'channel' },
      { nodeId: '2', fieldName: 'prompt', description: 'prompt' },
      { nodeId: '2', fieldName: 'resolution', description: 'resolution' },
      { nodeId: '3', fieldName: 'image', description: 'image' },
      { nodeId: '7', fieldName: 'image', description: 'image' },
      { nodeId: '8', fieldName: 'image', description: 'image' },
      { nodeId: '13', fieldName: 'image', description: 'image' },
    ],
  },
  {
    id: 'first-frame-video',
    name: '万能视频',
    appId: '2029727049266503682',
    type: 'video',
    nodeInfoList: [
      { nodeId: '34', fieldName: 'image', description: 'firstFrame' },
      { nodeId: '29', fieldName: 'text', description: 'prompt' },
      { nodeId: '380', fieldName: 'value', description: 'duration' },
    ],
  },
  {
    id: 'view-angle-converter',
    name: '视角转换',
    appId: '2034135112249511937',
    type: 'viewAngle',
    nodeInfoList: [
      { nodeId: '41', fieldName: 'image', description: 'image' },
      { nodeId: '108', fieldName: 'horizontal_angle', description: 'horizontal_angle' },
      { nodeId: '108', fieldName: 'vertical_angle', description: 'vertical_angle' },
      { nodeId: '108', fieldName: 'zoom', description: 'zoom' },
    ],
  },
  {
    id: 'runninghub-seedance-2-0',
    name: 'Seedance 2.0',
    appId: '2043533785483976705',
    type: 'video',
    nodeInfoList: [
      { nodeId: '12', fieldName: 'image', description: 'image' },
      { nodeId: '17', fieldName: 'image', description: 'image' },
      { nodeId: '18', fieldName: 'image', description: 'image' },
      { nodeId: '26', fieldName: 'image', description: 'image' },
      { nodeId: '28', fieldName: 'image', description: 'image' },
      { nodeId: '30', fieldName: 'image', description: 'image' },
      { nodeId: '32', fieldName: 'image', description: 'image' },
      { nodeId: '34', fieldName: 'image', description: 'image' },
      { nodeId: '36', fieldName: 'image', description: 'image' },
      { nodeId: '16', fieldName: 'file', description: 'file' },
      { nodeId: '37', fieldName: 'file', description: 'file' },
      { nodeId: '38', fieldName: 'file', description: 'file' },
      { nodeId: '19', fieldName: 'audio', description: 'audio' },
      { nodeId: '39', fieldName: 'audio', description: 'audio' },
      { nodeId: '40', fieldName: 'audio', description: 'audio' },
      { nodeId: '48', fieldName: 'text', description: 'text' },
      { nodeId: '15', fieldName: 'resolution', description: 'resolution' },
      { nodeId: '15', fieldName: 'ratio', description: 'ratio' },
      { nodeId: '15', fieldName: 'duration', description: 'duration' },
    ],
  },
  {
    id: 'runninghub-seedance-2-0-fast',
    name: 'Seedance 2.0 Fast',
    appId: '2043537941061967874',
    type: 'video',
    nodeInfoList: [
      { nodeId: '12', fieldName: 'image', description: 'image' },
      { nodeId: '17', fieldName: 'image', description: 'image' },
      { nodeId: '18', fieldName: 'image', description: 'image' },
      { nodeId: '26', fieldName: 'image', description: 'image' },
      { nodeId: '28', fieldName: 'image', description: 'image' },
      { nodeId: '30', fieldName: 'image', description: 'image' },
      { nodeId: '32', fieldName: 'image', description: 'image' },
      { nodeId: '34', fieldName: 'image', description: 'image' },
      { nodeId: '36', fieldName: 'image', description: 'image' },
      { nodeId: '16', fieldName: 'file', description: 'file' },
      { nodeId: '37', fieldName: 'file', description: 'file' },
      { nodeId: '38', fieldName: 'file', description: 'file' },
      { nodeId: '19', fieldName: 'audio', description: 'audio' },
      { nodeId: '39', fieldName: 'audio', description: 'audio' },
      { nodeId: '40', fieldName: 'audio', description: 'audio' },
      { nodeId: '48', fieldName: 'text', description: 'text' },
      { nodeId: '41', fieldName: 'resolution', description: 'resolution' },
      { nodeId: '41', fieldName: 'ratio', description: 'ratio' },
      { nodeId: '41', fieldName: 'duration', description: 'duration' },
    ],
  },
]

export type ApiConfigs = Record<ApiProvider, ApiConfig>

export const DEFAULT_API_CONFIGS: ApiConfigs = {
  kling: {
    apiKey: '',
    apiSecret: '',
    endpoint: 'https://api.klingai.com',
    model: 'kling-v1',
  },
  runninghub: {
    apiKey: '',
    endpoint: 'https://www.runninghub.cn/openapi/v2',
  },
  jimeng: {
    apiKey: '',
    endpoint: 'https://api.jimeng.ai',
    videoModel: 'jimeng_v30_1080p',
  },
  minimax: {
    apiKey: '',
    groupId: '',
    endpoint: 'https://api.minimax.chat',
  },
  gemini12ai: {
    apiKey: '',
    endpoint: 'https://cdn.12ai.org',
    model: 'gemini-3.1-flash-image-preview',
    videoModel: 'seedance2-5s',
  },
  yunwu: {
    apiKey: '',
    endpoint: 'https://yunwu.ai',
    model: 'gemini-3-pro-image-preview',
    videoModel: 'viduq3-turbo',
  },
  volcark: {
    apiKey: '',
    endpoint: 'https://ark.cn-beijing.volces.com',
    videoModel: '',
    accessKey: '',
    secretKey: '',
    bucket: '',
    region: 'cn-beijing',
    tosEndpoint: 'https://tos-cn-beijing.volces.com',
    s3Endpoint: 'https://tos-s3-cn-beijing.volces.com',
  },
}

export const API_PROVIDERS: ApiProviderConfig[] = [
  {
    id: 'kling',
    name: '可灵',
    nameEn: 'Kling AI',
    description: '快手旗下AI',
    website: 'https://klingai.kuaishou.com',
    supportsImage: true,
    supportsVideo: true,
  },
  {
    id: 'runninghub',
    name: 'RunningHub',
    nameEn: 'RunningHub',
    description: '云端ComfyUI创作平台',
    website: 'https://www.runninghub.cn',
    supportsImage: true,
    supportsVideo: true,
  },
  {
    id: 'jimeng',
    name: '即梦',
    nameEn: 'Jimeng AI',
    description: '字节跳动AI创作平台',
    website: 'https://jimeng.jianying.com',
    supportsImage: true,
    supportsVideo: true,
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    nameEn: 'MiniMax',
    description: 'AI语音合成平台',
    website: 'https://www.minimaxi.com',
    supportsImage: false,
    supportsVideo: false,
    supportsTts: true,
  },
  {
    id: 'gemini12ai',
    name: '12AI',
    nameEn: '12AI',
    description: '12AI接入',
    website: 'https://doc.12ai.org',
    supportsImage: true,
    supportsVideo: true,
  },
  {
    id: 'yunwu',
    name: '云雾',
    nameEn: 'Yunwu',
    description: '云雾api接入',
    website: 'https://yunwu.ai',
    supportsImage: true,
    supportsVideo: true,
  },
  {
    id: 'volcark',
    name: '火山方舟',
    nameEn: 'Volcengine Ark',
    description: '火山引擎大模型平台',
    website: 'https://www.volcengine.com/product/ark',
    supportsImage: false,
    supportsVideo: true,
  },
]

export interface LipSyncAudio {
  id: string
  file: File | null
  url: string
  name: string
  duration: number
}

export interface LipSyncSubject {
  id: number
  maskUrl: string
  previewUrl?: string
  selected: boolean
}

export interface LipSyncState {
  imageFile: File | null
  imageUrl: string
  audioFile: File | null
  audioUrl: string
  audioName: string
  subjects: LipSyncSubject[]
  selectedSubjectIds: number[]
  prompt: string
  resolution: 720 | 1080
  status: 'idle' | 'detecting' | 'ready' | 'processing' | 'completed' | 'error'
  progress: number
  message: string
  error?: string
  taskId?: string
  resultVideoUrl?: string
}

export interface LipSyncItemState {
  audioPath: string
  audioName: string
  subjects: LipSyncSubject[]
  selectedSubjectIds: number[]
  prompt: string
  resolution: 720 | 1080
  duration?: number
  fastMode: boolean
  lipsyncApiProvider: 'jimeng' | 'volcark'
  status: 'idle' | 'uploading' | 'detecting' | 'ready' | 'processing' | 'completed' | 'error'
  progress: number
  message: string
  error?: string
  taskId?: string
  resultVideoUrl?: string
  uploadedImageUrl?: string
  uploadedAudioUrl?: string
}

export interface TosConfig {
  accessKey: string
  secretKey: string
  bucket: string
  region: string
}

export interface VoiceVoice {
  id: string
  name: string
  description: string
  gender: 'male' | 'female' | 'neutral'
  language?: string
}

export interface VoiceItemState {
  text: string
  voiceId: string
  speed: number
  volume: number
  pitch: number
  status: 'idle' | 'processing' | 'completed' | 'error'
  progress: number
  message: string
  error?: string
  taskId?: string
  resultAudioUrl?: string
  resultAudioPath?: string
  characterId?: string
  characterName?: string
  characterIndex?: number
}

export interface GeneratedAudio {
  id: string
  url: string
  path: string
  timestamp: number
  text: string
  voiceId: string
  voiceName: string
  duration: number
}

export interface VoiceCharacter {
  id: string
  name: string
  voiceId: string
  voiceName: string
  createdAt: number
}

export interface VoiceCharacterStorage {
  [taskId: string]: VoiceCharacter[]
}

export type MaterialCategory = 'character' | 'prop' | 'scene' | 'online'

export interface MaterialItem {
  id: string
  name: string
  category: MaterialCategory
  path: string
  thumbnailUrl?: string
  previewUrl?: string
  createdAt: number
  projectId: string
  projectName: string
  tags?: string[]
}

export interface SubjectMaterial {
  id: string
  projectId: string
  projectName: string
  projectPath: string
  characters: MaterialItem[]
  props: MaterialItem[]
  scenes: MaterialItem[]
  createdAt: number
  updatedAt: number
}

export interface ChangeItem {
  type: '新增' | '优化' | '修复' | '移除'
  content: string
}

export interface Changelog {
  id: number
  version: string
  content: ChangeItem[]
  created_at: string
  created_by: number
  creator_name: string
}

export type Seedance2TabType = 'novelToScript' | 'scriptToStoryboard' | 'videoGeneration'

export type Seedance2MaterialType = 'image' | 'audio' | 'video'

export interface Seedance2MaterialItem {
  id: string
  preview: string
  type: Seedance2MaterialType
  index: number
  name?: string
  path?: string
  url?: string
  loadTime?: number
}

export interface Seedance2VideoPrompt {
  id: string
  prompt: string
}

export interface Seedance2VideoItem {
  id: string
  prompt: string
  materials: Seedance2MaterialItem[]
  previewUrl?: string
  model?: 'seedance-2.0' | 'seedance-2.0-fast'
  aspectRatio?: '16:9' | '9:16' | '4:3' | '1:1' | '3:4' | '21:9'
  resolution?: '480p' | '720p'
  duration?: number
}

export type Seedance2Provider = 'volcengine' | 'runninghub' | 'runninghub-enterprise'

export type AssetLibraryType = 'characters' | 'props' | 'scenes' | 'others'

export interface CloudAssetLibrary {
  id: string
  name: string
  account_id: string
  createdAt: number
  updatedAt: number
}

export interface CloudAsset {
  id: string
  name: string
  fileName: string
  type: AssetLibraryType
  libraryId: string
  url: string
  cloudPath: string
  fileSize: number
  uploadedBy: string
  uploadedByNickname?: string
  uploadedAt: number
}

export type Seedance2QualityStyle = 'cg-anime' | 'ancient-realistic' | 'modern-urban'

export interface Seedance2Data {
  activeTab: Seedance2TabType
  novelText: string
  scriptText: string
  videoPrompts: Seedance2VideoPrompt[]
  videoItems: Seedance2VideoItem[]
  selectedProvider: Seedance2Provider
  selectedModel: 'seedance-2.0' | 'seedance-2.0-fast' | 'custom'
  customModelId: string
  selectedAspectRatio: '16:9' | '9:16' | '4:3' | '1:1' | '3:4' | '21:9'
  selectedResolution: '480p' | '720p'
  selectedQualityStyle: Seedance2QualityStyle
  globalPrompt: string
}
