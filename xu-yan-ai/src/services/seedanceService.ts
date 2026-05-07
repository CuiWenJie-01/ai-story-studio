import type { ApiConfig } from '../types'
import { videoLog } from './videoLogService'
import { TosService } from './jimengService'

interface ContentItem {
  type: 'text' | 'image_url' | 'video_url' | 'audio_url'
  text?: string
  image_url?: { url: string }
  video_url?: { url: string }
  audio_url?: { url: string }
  role?: 'reference_image' | 'reference_video' | 'reference_audio' | 'first_frame' | 'last_frame'
}

interface SeedanceCreateRequest {
  model: string
  content: ContentItem[]
  ratio?: string
  resolution?: string
  duration?: number
  watermark?: boolean
  generate_audio?: boolean
}

interface SeedanceCreateResponse {
  id: string
  model: string
  status: string
  created_at: number
  updated_at: number
  error?: { code: string; message: string }
}

interface SeedanceQueryResponse {
  id: string
  model: string
  status: string
  created_at: number
  updated_at: number
  content?: Array<{
    type: string
    video_url?: { url: string }
  }>
  output?: { video_url?: string }
  error?: { code: string; message: string }
}

export interface Seedance2MaterialItem {
  id: string
  preview: string
  type: 'image' | 'audio' | 'video'
  index: number
  name?: string
  path?: string
  url?: string
  loadTime?: number
}

export interface SeedanceGenerateOptions {
  prompt: string
  model?: string
  materials?: Seedance2MaterialItem[]
  firstFrameUrl?: string
  lastFrameUrl?: string
  audioUrl?: string
  aspectRatio?: string
  resolution?: string
  duration?: number
  generateAudio?: boolean
}

interface ParsedPrompt {
  cleanPrompt: string
  imageUrls: Array<{ url: string; index: number }>
  videoUrls: Array<{ url: string; index: number }>
  audioUrls: Array<{ url: string; index: number }>
}

/**
 * 清理提示词中冗余的时长标记，保留原始绝对时间描述
 * 不再将秒数转换为百分比，避免整除精度问题导致视频时长异常
 * @param prompt 原始提示词
 * @returns 转换后的提示词
 */
function cleanPromptTimeMarkers(prompt: string): string {
  let converted = prompt

  // 移除单独的时长标记，支持 "秒" 和 "s"/"S"，支持整数和小数
  // 如 "时长3秒"、"时长 3.5 秒"、"时长3s"、"时长 13.5 s"
  converted = converted.replace(/时长(为)?\s*(\d+(?:\.\d+)?)\s*[秒sS]/g, '')

  // 移除中文数字时长，如 "时长三秒"
  converted = converted.replace(/时长(为)?\s*(一|二|三|四|五|六|七|八|九|十)\s*秒/g, '')

  return converted
}

// 场景时间天气关键词映射表
interface SceneEnhancementRule {
  keywords: string[]
  enhancement: string
}

const sceneEnhancementRules: SceneEnhancementRule[] = [
  {
    keywords: ['深夜', '黑夜', '深夜', '半夜', '午夜', '凌晨', '子时', '三更'],
    enhancement: '深夜场景，漆黑天幕，月光或星光为主要光源，环境昏暗但层次分明，阴影浓重，冷色调为主，远处微弱灯火点缀',
  },
  {
    keywords: ['夜晚', '晚上', '夜间', '夜幕', '夜色', '夜景', '暗夜', '黑天'],
    enhancement: '夜晚场景，天色完全暗下，人工光源（路灯/烛光/灯火）与自然环境光交织，明暗对比强烈，氛围静谧或神秘',
  },
  {
    keywords: ['黄昏', '傍晚', '暮色', '夕阳', '落日', '晚霞', '日落'],
    enhancement: '黄昏时刻，夕阳余晖洒落，天空呈现橙红到紫蓝的渐变，光线柔和温暖，长阴影拉伸，氛围浪漫而略带忧伤',
  },
  {
    keywords: ['雨天', '下雨', '雨中', '雨夜', '暴雨', '细雨', '阴雨', '淋雨', '雨景'],
    enhancement: '雨天场景，天空阴沉灰暗，雨滴清晰可见，地面湿润反光，空气中有水雾和潮湿感，光线柔和散射，氛围沉静或压抑',
  },
  {
    keywords: ['雪天', '下雪', '雪中', '雪地', '暴风雪', '大雪', '雪景', '白雪'],
    enhancement: '雪天场景，天地银装素裹，雪花纷飞，地面覆盖厚雪，光线明亮但清冷，空气纯净，反射光强烈，氛围宁静圣洁或凛冽',
  },
  {
    keywords: ['雾天', '大雾', '浓雾', '薄雾', '迷雾', '雾气', '雾霾', '雾中'],
    enhancement: '雾天场景，能见度低，景物朦胧若隐若现，光线被雾气柔化散射，色调偏白或灰蓝，氛围神秘梦幻或压抑不安',
  },
  {
    keywords: ['晴天', '晴朗', '阳光明媚', '烈日', '大太阳', '艳阳'],
    enhancement: '晴天场景，阳光直射，光线明亮强烈，阴影清晰锐利，天空湛蓝，色彩饱和度高，氛围明亮活力或炎热干燥',
  },
  {
    keywords: ['阴天', '多云', '乌云', '阴云', '天阴'],
    enhancement: '阴天场景，天空被云层覆盖，光线均匀柔和无直射，阴影淡化，色调偏灰冷，氛围沉静内敛或压抑沉闷',
  },
  {
    keywords: ['清晨', '早晨', '晨曦', '日出', '黎明', '拂晓', '晨光', '破晓'],
    enhancement: '清晨场景，天色微亮，晨曦柔和温暖，空气中可能有薄雾，光线从低角度照射，万物苏醒，氛围清新充满希望',
  },
  {
    keywords: ['室内', '屋里', '房间', '屋内', '室内场景'],
    enhancement: '室内场景，空间封闭，光线由窗户或人工光源提供，光影在墙面和家具上形成明确边界，氛围温馨私密或压抑封闭',
  },
  {
    keywords: ['室外', '户外', '外面', '野外', '露天'],
    enhancement: '室外场景，开阔空间，自然光线充足，天空可见，景物层次丰富，氛围自由开阔或荒凉孤寂',
  },
]

/**
 * 根据提示词内容自动检测场景时间天气关键词，生成强化前缀
 * 当用户上传的参考图与提示词描述的场景氛围冲突时（如白天图+夜晚描述），
 * 通过强指令要求AI优先遵循文本提示词的场景氛围，覆盖参考图的光照/时间特征
 * @param prompt 用户提示词
 * @returns 场景强化前缀，如果没有匹配则返回空字符串
 */
function generateSceneEnhancementPrefix(prompt: string): string {
  if (!prompt || prompt.trim().length === 0) {
    return ''
  }

  const matchedEnhancements: string[] = []

  for (const rule of sceneEnhancementRules) {
    const hasKeyword = rule.keywords.some(keyword => prompt.includes(keyword))
    if (hasKeyword) {
      matchedEnhancements.push(rule.enhancement)
    }
  }

  if (matchedEnhancements.length === 0) {
    return ''
  }

  const enhancementText = matchedEnhancements.join('，')

  return `【最高优先级指令：以下场景氛围必须严格遵循，若参考图/首帧图的光照、时间、天气特征与以下描述冲突，请完全忽略参考图的相关特征，优先按照以下文本描述生成】\n【场景氛围】${enhancementText}。\n`
}

export interface TosUploadConfig {
  accessKey?: string
  secretKey?: string
  bucket?: string
  region?: string
  s3Endpoint?: string
}

export class SeedanceService {
  private config: ApiConfig
  private tosService: TosService | null = null

  constructor(config: ApiConfig, tosUploadConfig?: TosUploadConfig) {
    this.config = config
    console.log('[SeedanceService] 初始化TOS配置:', {
      hasAccessKey: !!tosUploadConfig?.accessKey,
      hasSecretKey: !!tosUploadConfig?.secretKey,
      hasBucket: !!tosUploadConfig?.bucket,
      region: tosUploadConfig?.region,
    })
    if (tosUploadConfig?.bucket && tosUploadConfig?.accessKey && tosUploadConfig?.secretKey) {
      this.tosService = new TosService({
        accessKey: tosUploadConfig.accessKey,
        secretKey: tosUploadConfig.secretKey,
        bucket: tosUploadConfig.bucket,
        region: tosUploadConfig.region || 'cn-beijing',
        s3Endpoint: tosUploadConfig.s3Endpoint,
      })
      console.log('[SeedanceService] TOS服务已创建', tosUploadConfig.s3Endpoint ? '(S3兼容模式)' : '(TOS原生模式)')
    } else {
      console.warn('[SeedanceService] TOS配置不完整，服务未创建')
    }
  }

  private getBaseEndpoint(): string {
    return this.config.endpoint || 'https://ark.cn-beijing.volces.com'
  }

  private parsePromptWithMentions(prompt: string, materials: Seedance2MaterialItem[]): ParsedPrompt {
    const imageUrls: Array<{ url: string; index: number }> = []
    const videoUrls: Array<{ url: string; index: number }> = []
    const audioUrls: Array<{ url: string; index: number }> = []

    const imageMap = new Map<number, Seedance2MaterialItem>()
    const videoMap = new Map<number, Seedance2MaterialItem>()
    const audioMap = new Map<number, Seedance2MaterialItem>()
    // URL 去重集合，防止同一文件重复上传
    const imageUrlSet = new Set<string>()
    const videoUrlSet = new Set<string>()
    const audioUrlSet = new Set<string>()

    materials.forEach(m => {
      const url = m.url || m.preview
      if (m.type === 'image') {
        // 去重：如果 URL 已存在，跳过
        if (!imageUrlSet.has(url)) {
          imageUrlSet.add(url)
          imageMap.set(m.index, m)
        }
      } else if (m.type === 'video') {
        if (!videoUrlSet.has(url)) {
          videoUrlSet.add(url)
          videoMap.set(m.index, m)
        }
      } else if (m.type === 'audio') {
        if (!audioUrlSet.has(url)) {
          audioUrlSet.add(url)
          audioMap.set(m.index, m)
        }
      }
    })

    const allImageIndexes = [...imageMap.keys()].sort((a, b) => a - b)
    for (const idx of allImageIndexes) {
      const material = imageMap.get(idx)!
      if (material) {
        imageUrls.push({ url: material.url || material.preview, index: idx })
      }
    }

    const allVideoIndexes = [...videoMap.keys()].sort((a, b) => a - b)
    for (const idx of allVideoIndexes) {
      const material = videoMap.get(idx)!
      if (material) {
        videoUrls.push({ url: material.url || material.preview, index: idx })
      }
    }

    const allAudioIndexes = [...audioMap.keys()].sort((a, b) => a - b)
    for (const idx of allAudioIndexes) {
      const material = audioMap.get(idx)!
      if (material) {
        audioUrls.push({ url: material.url || material.preview, index: idx })
      }
    }

    console.log(`[Seedance] 素材去重后: ${imageUrls.length} 图片, ${videoUrls.length} 视频, ${audioUrls.length} 音频`) // 添加日志

    let cleanPrompt = prompt
      .replace(/@(图|图片)(\d+)/g, '$1$2')
      .replace(/@视频(\d+)/g, '视频$1')
      .replace(/@音频(\d+)/g, '音频$1')
      .replace(/\s+/g, ' ')
      .trim()

    // 清理提示词中冗余的时长标记，保留用户原始的绝对秒数描述
    cleanPrompt = cleanPromptTimeMarkers(cleanPrompt)

    return { cleanPrompt, imageUrls, videoUrls, audioUrls }
  }

  public async processMediaUrl(url: string, type: 'image' | 'video' | 'audio'): Promise<{ success: boolean; url: string; error?: string }> {
    if (!url) return { success: true, url }

    console.log('[Seedance] processMediaUrl 检查URL:', url, 'type:', type)

    if (url.startsWith('asset://') || /^asset:[\\/]/.test(url) || /^[A-Za-z]:[/\\]/.test(url)) {
      if (!this.tosService) {
        console.warn('[Seedance] TOS未配置，无法上传本地文件')
        return { success: false, url, error: 'TOS未配置，无法上传本地文件' }
      }

      try {
        const filePath = url.startsWith('asset://') ? url.replace('asset://', '') : url
        const timestamp = Date.now()
        
        // 获取原始文件扩展名
        const extMatch = filePath.match(/\.([a-zA-Z0-9]+)$/)
        let extension: string
        let contentType: string
        
        if (type === 'image') {
          extension = extMatch ? extMatch[1].toLowerCase() : 'png'
          const imageMimeTypes: Record<string, string> = {
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
            'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp'
          }
          contentType = imageMimeTypes[extension] || 'image/png'
        } else if (type === 'video') {
          extension = extMatch ? extMatch[1].toLowerCase() : 'mp4'
          const videoMimeTypes: Record<string, string> = {
            'mp4': 'video/mp4', 'avi': 'video/x-msvideo', 'mov': 'video/quicktime',
            'webm': 'video/webm', 'mkv': 'video/x-matroska', 'wmv': 'video/x-ms-wmv'
          }
          contentType = videoMimeTypes[extension] || 'video/mp4'
        } else {
          // audio - 保留原始格式
          extension = extMatch ? extMatch[1].toLowerCase() : 'wav'
          const audioMimeTypes: Record<string, string> = {
            'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
            'm4a': 'audio/mp4', 'aac': 'audio/aac', 'flac': 'audio/flac'
          }
          contentType = audioMimeTypes[extension] || 'audio/wav'
        }
        
        const objectKey = `seedance/${timestamp}_${Math.random().toString(36).substring(7)}.${extension}`

        console.log(`[Seedance] 开始上传文件到TOS:`, filePath, '->', objectKey, '类型:', contentType)
        const result = await this.tosService.uploadFile(filePath, objectKey, contentType)

        if (result.success && result.url) {
          console.log('[Seedance] TOS上传成功:', result.url)
          return { success: true, url: result.url }
        } else {
          console.error('[Seedance] TOS上传失败:', result.error)
          return { success: false, url, error: result.error || '上传失败' }
        }
      } catch (error) {
        console.error('[Seedance] TOS上传异常:', error)
        return { success: false, url, error: error instanceof Error ? error.message : '上传异常' }
      }
    }

    if (url.startsWith('http://localhost') || url.startsWith('http://asset.localhost')) {
      if (!this.tosService) {
        console.warn('[Seedance] localhost URL但TOS未配置，直接返回')
        return { success: false, url, error: 'TOS未配置，无法上传localhost文件' }
      }

      try {
        console.log('[Seedance] 获取localhost文件:', url)
        const response = await fetch(url)
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        const base64 = btoa(
          Array.from(new Uint8Array(arrayBuffer))
            .map(byte => String.fromCharCode(byte))
            .join('')
        )
        
        // 从 URL 中提取扩展名
        const urlObj = new URL(url)
        const pathname = urlObj.pathname
        const extMatch = pathname.match(/\.([a-zA-Z0-9]+)$/)
        let extension: string
        let contentType: string
        
        if (type === 'image') {
          extension = extMatch ? extMatch[1].toLowerCase() : 'png'
          contentType = `image/${extension === 'jpg' ? 'jpeg' : extension}`
        } else if (type === 'video') {
          extension = extMatch ? extMatch[1].toLowerCase() : 'mp4'
          contentType = `video/${extension}`
        } else {
          extension = extMatch ? extMatch[1].toLowerCase() : 'wav'
          const audioMimeTypes: Record<string, string> = {
            'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
            'm4a': 'audio/mp4', 'aac': 'audio/aac', 'flac': 'audio/flac'
          }
          contentType = audioMimeTypes[extension] || 'audio/wav'
        }
        
        const timestamp = Date.now()
        const objectKey = `seedance/${timestamp}_${Math.random().toString(36).substring(7)}.${extension}`

        console.log('[Seedance] 开始上传localhost文件到TOS, 类型:', contentType)
        const result = await this.tosService.uploadBase64(base64, objectKey, contentType)

        if (result.success && result.url) {
          console.log('[Seedance] localhost文件TOS上传成功:', result.url)
          return { success: true, url: result.url }
        } else {
          console.error('[Seedance] localhost文件TOS上传失败:', result.error)
          return { success: false, url, error: result.error || 'localhost文件上传失败' }
        }
      } catch (error) {
        console.error('[Seedance] localhost文件处理异常:', error)
        return { success: false, url, error: error instanceof Error ? error.message : 'localhost文件处理异常' }
      }
    }

    console.log('[Seedance] URL无需处理，直接返回:', url)
    return { success: true, url }
  }

  async createVideoTask(options: SeedanceGenerateOptions): Promise<{
    success: boolean
    taskId?: string
    error?: string
  }> {
    const { prompt, model, materials = [], firstFrameUrl, lastFrameUrl, audioUrl, aspectRatio, resolution, duration, generateAudio = true } = options

    if (!this.config.apiKey) {
      return { success: false, error: '请先配置火山方舟 API Key' }
    }

    const finalModel = model
    if (!finalModel) {
      return { success: false, error: '请选择模型' }
    }

    try {
      const { cleanPrompt, imageUrls, videoUrls, audioUrls } = this.parsePromptWithMentions(prompt, materials)

      // 自动检测场景时间天气关键词，生成强化前缀并注入到提示词最前面
      const scenePrefix = generateSceneEnhancementPrefix(cleanPrompt)
      const finalPrompt = scenePrefix ? `${scenePrefix}\n${cleanPrompt}` : cleanPrompt

      if (audioUrls.length > 0 && imageUrls.length === 0 && videoUrls.length === 0 && !firstFrameUrl) {
        return {
          success: false,
          error: '音频不能作为唯一的参考素材，请同时添加图片或视频作为参考'
        }
      }

      const content: ContentItem[] = [
        { type: 'text', text: finalPrompt },
      ]

      // 直接传入的首帧/尾帧/音频（对口型模块使用）
      // 有音频时用参考模式（reference_image + reference_audio），无音频时用首帧模式（不设role）
      const hasDirectAudio = !!audioUrl

      if (firstFrameUrl) {
        const firstFrameResult = await this.processMediaUrl(firstFrameUrl, 'image')
        if (!firstFrameResult.success) {
          return { success: false, error: `首帧图片处理失败: ${firstFrameResult.error}` }
        }
        content.push({
          type: 'image_url',
          image_url: { url: firstFrameResult.url },
          ...(hasDirectAudio ? { role: 'reference_image' as const } : {}),
        })
      }

      if (lastFrameUrl && !hasDirectAudio) {
        const lastFrameResult = await this.processMediaUrl(lastFrameUrl, 'image')
        if (!lastFrameResult.success) {
          return { success: false, error: `尾帧图片处理失败: ${lastFrameResult.error}` }
        }
        content.push({
          type: 'image_url',
          image_url: { url: lastFrameResult.url },
          role: 'last_frame',
        })
      }

      if (audioUrl) {
        const audioResult = await this.processMediaUrl(audioUrl, 'audio')
        if (!audioResult.success) {
          return { success: false, error: `音频处理失败: ${audioResult.error}` }
        }
        content.push({
          type: 'audio_url',
          audio_url: { url: audioResult.url },
          role: 'reference_audio',
        })
      }

      // materials 解析出的素材 - 按 index 排序确保顺序正确
      // 图片素材
      const sortedImageUrls = [...imageUrls].sort((a, b) => a.index - b.index)
      const failedUploads: { type: string; index: number; error?: string }[] = []
      
      for (const img of sortedImageUrls) {
        const result = await this.processMediaUrl(img.url, 'image')
        if (!result.success) {
          failedUploads.push({ type: '图片', index: img.index, error: result.error })
          console.error(`[Seedance] 图片上传失败 (index: ${img.index}):`, result.error)
        } else {
          content.push({
            type: 'image_url',
            image_url: { url: result.url },
            role: 'reference_image',
          })
        }
      }

      // 视频素材
      const sortedVideoUrls = [...videoUrls].sort((a, b) => a.index - b.index)
      for (const vid of sortedVideoUrls) {
        const result = await this.processMediaUrl(vid.url, 'video')
        if (!result.success) {
          failedUploads.push({ type: '视频', index: vid.index, error: result.error })
          console.error(`[Seedance] 视频上传失败 (index: ${vid.index}):`, result.error)
        } else {
          content.push({
            type: 'video_url',
            video_url: { url: result.url },
            role: 'reference_video',
          })
        }
      }

      // 音频素材 - 按 index 排序确保顺序正确
      const sortedAudioUrls = [...audioUrls].sort((a, b) => a.index - b.index)
      for (const aud of sortedAudioUrls) {
        const result = await this.processMediaUrl(aud.url, 'audio')
        if (!result.success) {
          failedUploads.push({ type: '音频', index: aud.index, error: result.error })
          console.error(`[Seedance] 音频上传失败 (index: ${aud.index}):`, result.error)
        } else {
          content.push({
            type: 'audio_url',
            audio_url: { url: result.url },
            role: 'reference_audio',
          })
        }
      }
      
      // 检查是否有上传失败的素材
      if (failedUploads.length > 0) {
        const errorMessages = failedUploads.map(f => `${f.type}${f.index}: ${f.error || '上传失败'}`).join(', ')
        return {
          success: false,
          error: `${failedUploads.length} 个素材上传失败: ${errorMessages}`,
        }
      }
      
      console.log(`[Seedance] 素材上传顺序 - 图片: [${sortedImageUrls.map(i => i.index).join(',')}], 音频: [${sortedAudioUrls.map(a => a.index).join(',')}]`)

      const body: SeedanceCreateRequest = {
        model: finalModel,
        content,
        watermark: false,
        generate_audio: generateAudio,
      }

      if (aspectRatio) {
        body.ratio = aspectRatio
      }

      if (resolution) {
        body.resolution = resolution
      }

      if (duration) {
        body.duration = duration
      }

      console.log('[Seedance] 创建视频任务:', JSON.stringify({
        model: finalModel,
        prompt: finalPrompt.substring(0, 100) + '...',
        imageCount: imageUrls.length,
        videoCount: videoUrls.length,
        audioCount: audioUrls.length,
        ratio: aspectRatio,
        resolution,
        duration,
        contentItems: content.length,
        scenePrefix: scenePrefix || '(无)',
      }, null, 2))
      
      console.log('[Seedance] 请求体:', JSON.stringify(body, null, 2))

      const response = await fetch(
        `${this.getBaseEndpoint()}/api/v3/contents/generations/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Seedance] API Error:', errorText)
        let errorMessage = `API 请求失败: ${response.status} ${response.statusText}`
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.error?.message || errorJson.message || errorMessage
        } catch {
        }
        videoLog.error('Seedance 创建视频任务失败', {
          provider: 'volcark',
          model: finalModel,
          httpStatus: response.status,
          errorMessage,
        })
        return { success: false, error: errorMessage }
      }

      const data: SeedanceCreateResponse = await response.json()
      console.log('[Seedance] 创建任务响应:', JSON.stringify(data, null, 2))

      if (data.error) {
        videoLog.error('Seedance 创建任务返回错误', {
          provider: 'volcark',
          model: finalModel,
          errorMessage: data.error.message,
        })
        return { success: false, error: data.error.message }
      }

      if (!data.id) {
        return { success: false, error: '未返回任务 ID' }
      }

      videoLog.info('Seedance 创建视频任务成功', {
        provider: 'volcark',
        model: finalModel,
        taskId: data.id,
      })

      return { success: true, taskId: data.id }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '创建任务失败'
      videoLog.error('Seedance 创建任务异常', {
        provider: 'volcark',
        errorMessage,
      })
      return { success: false, error: errorMessage }
    }
  }

  async queryTaskStatus(taskId: string): Promise<SeedanceQueryResponse> {
    const response = await fetch(
      `${this.getBaseEndpoint()}/api/v3/contents/generations/tasks/${taskId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`查询任务失败: ${response.status} - ${errorText}`)
    }

    return response.json()
  }

  async waitForCompletion(
    taskId: string,
    onProgress?: (progress: number, status: string, message: string) => void,
    pollIntervalMs: number = 5000,
    maxWaitMs: number = 600000,
    isCancelled?: () => boolean
  ): Promise<{
    success: boolean
    videoUrl?: string
    error?: string
  }> {
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
      if (isCancelled?.()) {
        console.log(`[Seedance] 任务 ${taskId} 已被用户取消`)
        return { success: false, error: '已取消' }
      }

      try {
        const result = await this.queryTaskStatus(taskId)

        const elapsed = Date.now() - startTime
        const progressPercent = Math.min(90, Math.floor((elapsed / maxWaitMs) * 100))
        const statusText = this.getStatusText(result.status)

        if (onProgress) {
          onProgress(progressPercent, result.status, statusText)
        }

        console.log(`[Seedance] 任务 ${taskId}: ${result.status} (${progressPercent}%)`)

        if (result.status === 'succeeded') {
          console.log('[Seedance] 任务成功，完整响应:', JSON.stringify(result, null, 2))
          let videoUrl: string | undefined

          // content 可能是对象或数组
          const content = result.content as unknown
          if (content && typeof content === 'object' && !Array.isArray(content)) {
            // 对象格式: { video_url: "..." }
            const contentObj = content as Record<string, unknown>
            if (typeof contentObj.video_url === 'string') {
              videoUrl = contentObj.video_url
            }
          } else if (Array.isArray(content)) {
            // 数组格式: [{ type: "video_url", video_url: { url: "..." } }]
            for (const item of content) {
              if (item.type === 'video_url' && item.video_url?.url) {
                videoUrl = item.video_url.url
                break
              }
            }
          }
          if (!videoUrl && result.output?.video_url) {
            videoUrl = result.output.video_url
          }

          videoLog.info('Seedance 视频生成完成', {
            provider: 'volcark',
            taskId,
            duration: Date.now() - startTime,
            extra: { videoUrl },
          })

          return { success: true, videoUrl }
        }

        if (result.status === 'failed' || result.status === 'cancelled') {
          const failReason = result.error?.message || '未知原因'
          videoLog.error('Seedance 视频生成失败', {
            provider: 'volcark',
            taskId,
            duration: Date.now() - startTime,
            errorMessage: failReason,
          })
          return { success: false, error: failReason }
        }

        await this.sleep(pollIntervalMs)
      } catch (error) {
        console.error('[Seedance] Poll error:', error)
        await this.sleep(pollIntervalMs)
      }
    }

    videoLog.error('Seedance 视频生成超时', {
      provider: 'volcark',
      taskId,
      duration: Date.now() - startTime,
    })

    return { success: false, error: '任务超时' }
  }

  private getStatusText(status: string): string {
    switch (status) {
      case 'pending':
      case 'queued':
        return '任务排队中...'
      case 'running':
        return '正在生成视频...'
      case 'succeeded':
        return '生成完成'
      case 'failed':
        return '生成失败'
      case 'cancelled':
        return '已取消'
      default:
        return '处理中...'
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async cancelTask(taskId: string): Promise<{ success: boolean; error?: string; canRetry?: boolean }> {
    try {
      console.log(`[Seedance] 正在取消任务: ${taskId}`)

      // 先查询任务状态
      const taskStatus = await this.queryTaskStatus(taskId)
      console.log(`[Seedance] 任务 ${taskId} 当前状态:`, taskStatus.status)

      // 根据火山引擎 API 文档：https://www.volcengine.com/docs/82379/1521720
      // - queued: 可以取消，状态变为 cancelled
      // - running: 不能取消，会返回 409 错误
      // - succeeded/failed/cancelled/expired: 可以删除记录
      if (taskStatus.status === 'running') {
        const message = '任务正在运行中，无法取消。请等待任务完成或稍后重试。'
        console.warn(`[Seedance] ${message}`)
        videoLog.warn('Seedance 任务取消失败：任务正在运行中', {
          provider: 'volcark',
          taskId,
          errorMessage: `任务状态: ${taskStatus.status}`,
        })
        return { success: false, error: message, canRetry: false }
      }

      if (taskStatus.status === 'cancelled') {
        const message = '任务已经取消'
        console.log(`[Seedance] ${message}`)
        return { success: true, error: message }
      }

      if (taskStatus.status === 'succeeded' || taskStatus.status === 'failed' || taskStatus.status === 'expired') {
        const message = `任务已${taskStatus.status === 'succeeded' ? '完成' : taskStatus.status === 'failed' ? '失败' : '过期'}，无需取消`
        console.log(`[Seedance] ${message}`)
        return { success: true, error: message }
      }

      // 只有 queued 状态才尝试取消
      const response = await fetch(
        `${this.getBaseEndpoint()}/api/v3/contents/generations/tasks/${taskId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
        }
      )

      if (response.status === 204 || response.status === 200) {
        console.log(`[Seedance] 任务 ${taskId} 取消成功`)
        videoLog.info('Seedance 任务取消成功', {
          provider: 'volcark',
          taskId,
        })
        return { success: true }
      }

      const errorText = await response.text()
      console.error('[Seedance] 取消任务失败:', errorText)

      let errorMessage = `取消任务失败: ${response.status}`
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage
      } catch {
      }

      videoLog.error('Seedance 任务取消失败', {
        provider: 'volcark',
        taskId,
        httpStatus: response.status,
        errorMessage,
      })

      return { success: false, error: errorMessage, canRetry: response.status !== 409 }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '取消任务异常'
      console.error('[Seedance] 取消任务异常:', error)
      videoLog.error('Seedance 取消任务异常', {
        provider: 'volcark',
        taskId,
        errorMessage,
      })
      return { success: false, error: errorMessage, canRetry: true }
    }
  }

  /**
   * 查询视频生成任务列表
   * 根据火山引擎 API 文档: https://www.volcengine.com/docs/82379/1521675
   */
  async getTaskList(params?: {
    status?: string
    limit?: number
    offset?: number
  }): Promise<{
    success: boolean
    total?: number
    items?: Array<{
      id: string
      model: string
      status: string
      created_at: number
      updated_at: number
      resolution?: string
      ratio?: string
      duration?: number
    }>
    error?: string
  }> {
    try {
      const queryParams = new URLSearchParams()
      if (params?.status) queryParams.append('status', params.status)
      if (params?.limit) queryParams.append('limit', String(params.limit))
      if (params?.offset) queryParams.append('offset', String(params.offset))

      const url = `${this.getBaseEndpoint()}/api/v3/contents/generations/tasks?${queryParams.toString()}`

      console.log('[Seedance] 查询任务列表:', url)

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Seedance] 查询任务列表失败:', errorText)
        return {
          success: false,
          error: `查询任务列表失败: ${response.status}`,
        }
      }

      const data = await response.json()
      console.log('[Seedance] 任务列表响应:', JSON.stringify(data, null, 2))

      return {
        success: true,
        total: data.total,
        items: data.items,
      }
    } catch (error) {
      console.error('[Seedance] 查询任务列表异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '查询任务列表失败',
      }
    }
  }

  /**
   * 获取正在生成的任务数量
   */
  async getGeneratingTaskCount(): Promise<{
    success: boolean
    count?: number
    error?: string
  }> {
    // 查询所有任务（按时间倒序，最新的在前面）
    const result = await this.getTaskList({ limit: 100 })
    if (!result.success || !result.items) {
      return {
        success: false,
        error: result.error || '获取任务列表失败',
      }
    }

    // 遍历任务列表，统计进行中的任务
    // 规则：从最新的任务开始，遇到第一个 succeeded 就停止，前面的 queued/running 都算作进行中
    let generatingCount = 0
    const taskDetails: Array<{ id: string; status: string; model: string }> = []

    for (const item of result.items) {
      if (item.status === 'queued' || item.status === 'running') {
        generatingCount++
        taskDetails.push({ id: item.id, status: item.status, model: item.model })
      } else if (item.status === 'succeeded') {
        // 遇到第一个已完成的任务，停止统计
        console.log(`[Seedance] 遇到已完成的任务，停止统计。任务ID: ${item.id}`)
        break
      }
      // cancelled 和 failed 状态继续往后看
    }

    console.log(`[Seedance] 任务列表详情（共 ${result.items.length} 个任务）:`)
    console.log(`[Seedance] 进行中任务数量: ${generatingCount}`)
    if (taskDetails.length > 0) {
      console.log(`[Seedance] 进行中任务详情:`, taskDetails)
    }

    return {
      success: true,
      count: generatingCount,
    }
  }
}
