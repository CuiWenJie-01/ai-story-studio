import { invoke } from '@tauri-apps/api/core'
import type { ApiConfig } from '../types'

export interface JimengSubjectDetectionResult {
  success: boolean
  hasSubject?: boolean
  maskUrls?: string[]
  maskImages?: string[]
  error?: string
}

export interface JimengLipSyncResult {
  success: boolean
  taskId?: string
  status?: string
  videoUrl?: string
  error?: string
}

export interface TosUploadResult {
  success: boolean
  url?: string
  error?: string
}

export interface TosConfig {
  accessKey: string
  secretKey: string
  bucket: string
  region: string
  tosEndpoint?: string
  s3Endpoint?: string
}

export class TosService {
  private config: TosConfig

  constructor(config: TosConfig) {
    this.config = config
  }

  validateConfig(): { valid: boolean; error?: string } {
    if (!this.config.bucket) {
      return { valid: false, error: 'TOS Bucket 未配置' }
    }
    if (!this.config.region) {
      return { valid: false, error: 'TOS Region 未配置' }
    }
    return { valid: true }
  }

  isPublicBucket(): boolean {
    return !this.config.accessKey || !this.config.secretKey
  }

  async uploadFile(
    filePath: string,
    objectKey: string,
    contentType: string,
    _acl?: string
  ): Promise<TosUploadResult> {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    try {
      console.log('[TOS] 开始上传文件:', filePath, '->', objectKey)

      const result = await invoke<{
        success: boolean
        url: string | null
        error: string | null
      }>('tos_upload_file', {
        accessKey: this.config.accessKey,
        secretKey: this.config.secretKey,
        bucket: this.config.bucket,
        region: this.config.region,
        objectKey: objectKey,
        filePath: filePath,
        contentType: contentType,
        acl: null,  // 不传 ACL，简化上传
        tosEndpoint: this.config.tosEndpoint || null,
        s3Endpoint: this.config.s3Endpoint || null,
      })

      console.log('[TOS] 上传响应:', result)

      return {
        success: result.success,
        url: result.url ?? undefined,
        error: result.error ?? undefined,
      }
    } catch (error) {
      console.error('[TOS] 上传异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '上传请求失败',
      }
    }
  }

  async uploadBase64(
    base64Data: string,
    objectKey: string,
    contentType: string,
    _acl?: string
  ): Promise<TosUploadResult> {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    try {
      console.log('[TOS] 开始上传Base64数据 ->', objectKey)

      const result = await invoke<{
        success: boolean
        url: string | null
        error: string | null
      }>('tos_upload_base64', {
        accessKey: this.config.accessKey,
        secretKey: this.config.secretKey,
        bucket: this.config.bucket,
        region: this.config.region,
        objectKey: objectKey,
        base64Data: base64Data,
        contentType: contentType,
        acl: null,  // 不传 ACL，简化上传
        tosEndpoint: this.config.tosEndpoint || null,
        s3Endpoint: this.config.s3Endpoint || null,
      })

      console.log('[TOS] 上传响应:', result)

      return {
        success: result.success,
        url: result.url ?? undefined,
        error: result.error ?? undefined,
      }
    } catch (error) {
      console.error('[TOS] 上传异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '上传请求失败',
      }
    }
  }

  generateObjectKey(prefix: string, extension: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `${prefix}/${timestamp}_${random}.${extension}`
  }

  async listObjects(prefix: string): Promise<{
    success: boolean
    objects?: Array<{
      key: string
      lastModified: string
      size: number
    }>
    error?: string
  }> {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    try {
      console.log('[TOS] 列出对象, prefix:', prefix)

      const result = await invoke<{
        success: boolean
        objects: Array<{
          key: string
          last_modified: string
          size: number
        }> | null
        error: string | null
      }>('tos_list_objects', {
        bucket: this.config.bucket,
        region: this.config.region,
        prefix: prefix,
        tosEndpoint: this.config.tosEndpoint || null,
        s3Endpoint: this.config.s3Endpoint || null,
      })

      console.log('[TOS] 列出对象响应:', result)
      console.log('[TOS] 返回对象数量:', result.objects?.length || 0)
      if (result.objects) {
        result.objects.forEach((obj, i) => {
          console.log(`[TOS] 对象 ${i}: key=${obj.key}`)
        })
      }

      if (!result.success) {
        return { success: false, error: result.error ?? '列出对象失败' }
      }

      return {
        success: true,
        objects: result.objects?.map(obj => ({
          key: obj.key,
          lastModified: obj.last_modified,
          size: obj.size,
        })),
      }
    } catch (error) {
      console.error('[TOS] 列出对象异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '列出对象请求失败',
      }
    }
  }

  getPublicUrl(objectKey: string): string {
    if (this.config.s3Endpoint) {
      return `https://${this.config.bucket}.${this.config.s3Endpoint.replace('https://', '')}/${objectKey}`
    }
    if (this.config.tosEndpoint) {
      return `https://${this.config.bucket}.${this.config.tosEndpoint.replace('https://', '')}/${objectKey}`
    }
    return `https://${this.config.bucket}.tos-${this.config.region}.volces.com/${objectKey}`
  }

  async deleteObject(objectKey: string): Promise<{
    success: boolean
    error?: string
  }> {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    try {
      console.log('[TOS] 删除对象:', objectKey)

      const result = await invoke<{
        success: boolean
        error: string | null
      }>('tos_delete_object', {
        accessKey: this.config.accessKey,
        secretKey: this.config.secretKey,
        bucket: this.config.bucket,
        region: this.config.region,
        objectKey: objectKey,
        tosEndpoint: this.config.tosEndpoint || null,
        s3Endpoint: this.config.s3Endpoint || null,
      })

      console.log('[TOS] 删除响应:', result)

      return {
        success: result.success,
        error: result.error ?? undefined,
      }
    } catch (error) {
      console.error('[TOS] 删除异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除请求失败',
      }
    }
  }

  async generatePresignedUrl(objectKey: string, expiresIn?: number): Promise<{
    success: boolean
    url?: string
    error?: string
  }> {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    try {
      console.log('[TOS] 生成预签名URL:', objectKey)

      const result = await invoke<{
        success: boolean
        url: string | null
        error: string | null
      }>('tos_generate_presigned_url', {
        accessKey: this.config.accessKey,
        secretKey: this.config.secretKey,
        bucket: this.config.bucket,
        region: this.config.region,
        objectKey: objectKey,
        expiresIn: expiresIn || 3600,
        tosEndpoint: this.config.tosEndpoint || null,
        s3Endpoint: this.config.s3Endpoint || null,
      })

      console.log('[TOS] 预签名URL生成成功')

      return {
        success: result.success,
        url: result.url ?? undefined,
        error: result.error ?? undefined,
      }
    } catch (error) {
      console.error('[TOS] 生成预签名URL异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '生成预签名URL失败',
      }
    }
  }
}

export class JimengService {
  private accessKey: string
  private secretKey: string

  constructor(config: ApiConfig) {
    this.accessKey = config.apiKey || ''
    this.secretKey = config.apiSecret || ''
  }

  validateConfig(): { valid: boolean; error?: string } {
    if (!this.accessKey || !this.secretKey) {
      return { valid: false, error: 'Access Key 或 Secret Key 未配置' }
    }
    return { valid: true }
  }

  async detectSubjects(imageUrl: string, taskFolder?: string): Promise<JimengSubjectDetectionResult> {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    try {
      console.log('[Jimeng] 开始主体检测:', imageUrl)

      const result = await invoke<{
        success: boolean;
        has_subject: boolean | null;
        mask_urls: string[] | null;
        mask_images: string[] | null;
        error: string | null;
      }>('jimeng_detect_subjects', {
        accessKey: this.accessKey,
        secretKey: this.secretKey,
        imageUrl: imageUrl,
        taskFolder: taskFolder || null,
      })

      console.log('[Jimeng] 主体检测响应:', result)
      
      return {
        success: result.success,
        hasSubject: result.has_subject ?? undefined,
        maskUrls: result.mask_urls ?? undefined,
        maskImages: result.mask_images ?? undefined,
        error: result.error ?? undefined,
      }
    } catch (error) {
      console.error('[Jimeng] 主体检测异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '主体检测请求失败',
      }
    }
  }

  async submitLipSyncTask(params: {
    imageUrl: string
    audioUrl: string
    maskUrls?: string[]
    prompt?: string
    resolution?: 720 | 1080
    fastMode?: boolean
  }): Promise<JimengLipSyncResult> {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    try {
      console.log('[Jimeng] 提交对口型任务:', params)

      const result = await invoke<{
        success: boolean;
        task_id: string | null;
        video_url: string | null;
        status: string | null;
        error: string | null;
      }>('jimeng_submit_task', {
        accessKey: this.accessKey,
        secretKey: this.secretKey,
        imageUrl: params.imageUrl,
        audioUrl: params.audioUrl,
        maskUrls: params.maskUrls || null,
        prompt: params.prompt || null,
        resolution: params.resolution || 720,
        fastMode: params.fastMode ?? true,
      })

      console.log('[Jimeng] 提交任务响应:', result)
      
      return {
        success: result.success,
        taskId: result.task_id ?? undefined,
        videoUrl: result.video_url ?? undefined,
        status: result.status ?? undefined,
        error: result.error ?? undefined,
      }
    } catch (error) {
      console.error('[Jimeng] 提交任务异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '提交任务请求失败',
      }
    }
  }

  async queryTaskStatus(taskId: string): Promise<JimengLipSyncResult> {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    try {
      const result = await invoke<{
        success: boolean;
        status: string | null;
        video_url: string | null;
        error: string | null;
      }>('jimeng_query_task', {
        accessKey: this.accessKey,
        secretKey: this.secretKey,
        taskId: taskId,
      })

      console.log('[Jimeng] 查询任务状态响应:', result)
      
      return {
        success: result.success,
        status: result.status ?? undefined,
        videoUrl: result.video_url ?? undefined,
        error: result.error ?? undefined,
      }
    } catch (error) {
      console.error('[Jimeng] 查询任务异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '查询任务请求失败',
      }
    }
  }

  async waitForCompletion(
    taskId: string,
    onProgress?: (status: string, message: string) => void,
    pollInterval: number = 5000,
    maxWaitTime: number = 600000,
    checkCancelled?: () => boolean
  ): Promise<JimengLipSyncResult> {
    const startTime = Date.now()

    const loop = async (): Promise<JimengLipSyncResult> => {
      if (Date.now() - startTime >= maxWaitTime) {
        return { success: false, error: '任务超时' }
      }

      if (checkCancelled?.()) {
        return {
          success: false,
          error: '任务已取消',
        }
      }

      try {
        const result = await this.queryTaskStatus(taskId)
        console.log('[Jimeng] 查询结果:', result)

        if (result.status === 'done') {
          console.log('[Jimeng] 任务完成, videoUrl:', result.videoUrl)
          return result
        }

        if (result.status === 'not_found' || result.status === 'expired') {
          return {
            success: false,
            error: '任务不存在或已过期',
          }
        }

        if (onProgress) {
          const message = result.status === 'generating' ? '正在生成视频...' : '等待处理...'
          onProgress(result.status || 'processing', message)
        }
      } catch {
        // 忽略查询错误，继续轮询
      }

      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(loop())
        }, pollInterval)
      })
    }

    return loop()
  }

  async generateLipSyncVideo(
    params: {
      imageUrl: string
      audioUrl: string
      maskUrls?: string[]
      prompt?: string
      resolution?: 720 | 1080
      fastMode?: boolean
    },
    onProgress?: (status: string, message: string) => void,
    checkCancelled?: () => boolean,
    onTaskSubmitted?: (taskId: string) => void
  ): Promise<JimengLipSyncResult> {
    const submitResult = await this.submitLipSyncTask(params)

    if (!submitResult.success || !submitResult.taskId) {
      return submitResult
    }

    onTaskSubmitted?.(submitResult.taskId)

    return this.waitForCompletion(submitResult.taskId, onProgress, 5000, 600000, checkCancelled)
  }
}

export default JimengService
