import type { ApiConfig } from '../types'

export interface SeedanceVideoResponse {
  id: string
  object: string
  model: string
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  progress: number
  created_at: number
  video_url?: string
  prompt?: string
  completed_at?: number
  expires_at?: number
  error?: {
    message: string
  }
}

export interface SeedanceGenerateOptions {
  prompt: string
  model?: string
  duration?: 5 | 10 | 15
  ratio?: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16'
  filePaths?: string[]
  videoFilePaths?: string[]
  audioFilePaths?: string[]
  enableFullReferenceMode?: boolean
}

export class Seedance12AIService {
  private config: ApiConfig

  constructor(config: ApiConfig) {
    this.config = config
  }

  private getBaseEndpoint(): string {
    return this.config.endpoint || 'https://cdn.12ai.org'
  }

  private getModelFromDuration(duration: number): string {
    const videoModel = this.config.videoModel || 'seedance2-5s'
    if (videoModel.startsWith('seedance2')) {
      if (duration <= 5) return 'seedance2-5s'
      if (duration <= 10) return 'seedance2-10s'
      return 'seedance2-15s'
    }
    if (videoModel.startsWith('sora')) {
      return videoModel
    }
    return 'seedance2-5s'
  }

  async createVideoTask(options: SeedanceGenerateOptions): Promise<{
    success: boolean
    taskId?: string
    error?: string
  }> {
    const {
      prompt,
      duration = 5,
      ratio,
      filePaths,
      videoFilePaths,
      audioFilePaths,
      enableFullReferenceMode,
    } = options

    if (!this.config.apiKey) {
      return { success: false, error: '请先配置 API Key' }
    }

    try {
      const model = this.getModelFromDuration(duration)
      
      const body: Record<string, unknown> = {
        model,
        prompt,
      }

      const hasImages = filePaths && filePaths.length > 0
      const hasVideos = videoFilePaths && videoFilePaths.length > 0
      const hasAudios = audioFilePaths && audioFilePaths.length > 0

      if (hasImages) {
        body.filePaths = filePaths
      }
      if (hasVideos) {
        body.videoFilePaths = videoFilePaths
      }
      if (hasAudios) {
        body.audioFilePaths = audioFilePaths
      }

      if (enableFullReferenceMode && (hasImages || hasVideos || hasAudios)) {
        if (ratio) {
          body.ratio = ratio
        }
      }

      console.log('[Seedance12AI] 创建视频任务:', JSON.stringify({
        model,
        prompt: prompt.substring(0, 100) + '...',
        hasImages,
        hasVideos,
        hasAudios,
        enableFullReferenceMode,
        ratio,
      }, null, 2))

      const response = await fetch(`${this.getBaseEndpoint()}/v1/videos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Seedance12AI] API Error:', errorText)
        try {
          const errorJson = JSON.parse(errorText)
          return {
            success: false,
            error: errorJson.error?.message || `API 请求失败: ${response.status}`,
          }
        } catch {
          return {
            success: false,
            error: `API 请求失败: ${response.status} ${response.statusText}`,
          }
        }
      }

      const data: SeedanceVideoResponse = await response.json()

      if (!data.id) {
        return { success: false, error: '未返回任务 ID' }
      }

      console.log('[Seedance12AI] 任务已创建:', data.id)

      return {
        success: true,
        taskId: data.id,
      }
    } catch (error) {
      console.error('[Seedance12AI] Create task error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '创建任务失败',
      }
    }
  }

  async queryTaskStatus(taskId: string): Promise<SeedanceVideoResponse> {
    const response = await fetch(`${this.getBaseEndpoint()}/v1/videos/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    })

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
    maxWaitMs: number = 600000
  ): Promise<{
    success: boolean
    videoUrl?: string
    error?: string
  }> {
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const status = await this.queryTaskStatus(taskId)

        const progressPercent = status.progress || 0
        const statusText = this.getStatusText(status.status)
        
        if (onProgress) {
          onProgress(progressPercent, status.status, statusText)
        }

        console.log(`[Seedance12AI] 任务 ${taskId}: ${status.status} (${progressPercent}%)`)

        if (status.status === 'completed') {
          return {
            success: true,
            videoUrl: status.video_url,
          }
        }

        if (status.status === 'failed') {
          return {
            success: false,
            error: status.error?.message || '视频生成失败',
          }
        }

        await this.sleep(pollIntervalMs)
      } catch (error) {
        console.error('[Seedance12AI] Poll error:', error)
        await this.sleep(pollIntervalMs)
      }
    }

    return {
      success: false,
      error: '任务超时',
    }
  }

  private getStatusText(status: string): string {
    switch (status) {
      case 'queued':
        return '任务排队中...'
      case 'in_progress':
        return '正在生成视频...'
      case 'completed':
        return '生成完成'
      case 'failed':
        return '生成失败'
      default:
        return '处理中...'
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async deleteTask(taskId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.getBaseEndpoint()}/v1/videos/${taskId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      })

      return response.ok
    } catch (error) {
      console.error('[Seedance12AI] Delete task error:', error)
      return false
    }
  }
}
