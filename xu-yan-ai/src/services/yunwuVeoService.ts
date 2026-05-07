import type { ApiConfig } from '../types'
import { videoLog } from './videoLogService'

export interface VeoVideoCreateResponse {
  id: string
  status: string
  status_update_time: number
}

export interface VeoVideoQueryResponse {
  id: string
  status: string
  video_url: string | null
  enhanced_prompt?: string
  status_update_time: number
  error?: string
  message?: string
  error_message?: string
}

export interface VeoVideoGenerateOptions {
  prompt: string
  model?: string
  images?: string[]
  enhancePrompt?: boolean
  enableUpsample?: boolean
  aspectRatio?: string
}

export class YunwuVeoService {
  private config: ApiConfig

  constructor(config: ApiConfig) {
    this.config = config
  }

  private getBaseEndpoint(): string {
    return this.config.endpoint || 'https://yunwu.ai'
  }

  private getModel(): string {
    return this.config.videoModel || 'veo3-fast'
  }

  // 判断是否是 OpenAI 格式的模型（带下划线的 veo_3_1-xxx）
  private isOpenAIFormat(model: string): boolean {
    return model.includes('_')
  }

  async createVideoTask(options: VeoVideoGenerateOptions): Promise<{
    success: boolean
    taskId?: string
    error?: string
  }> {
    const { prompt, model, images, enhancePrompt = true, enableUpsample = true, aspectRatio } = options

    if (!this.config.apiKey) {
      return { success: false, error: '请先配置 API Key' }
    }

    try {
      const finalModel = model || this.getModel()

      const body: Record<string, unknown> = {
        model: finalModel,
        prompt,
        enhance_prompt: enhancePrompt,
        enable_upsample: enableUpsample,
      }

      if (images && images.length > 0) {
        body.images = images
      }

      if (aspectRatio) {
        body.aspect_ratio = aspectRatio
      }

      console.log('[YunwuVeo] 创建视频任务:', JSON.stringify({
        model: finalModel,
        prompt: prompt.substring(0, 100) + '...',
        hasImages: !!images && images.length > 0,
        imageCount: images?.length || 0,
        enhancePrompt,
        enableUpsample,
        aspectRatio,
      }, null, 2))

      let response: Response

      if (this.isOpenAIFormat(finalModel)) {
        // OpenAI 格式：multipart/form-data
        const formData = new FormData()
        formData.append('model', finalModel)
        formData.append('prompt', prompt)
        if (aspectRatio) {
          formData.append('aspect_ratio', aspectRatio)
        }
        if (images && images.length > 0) {
          images.forEach(url => formData.append('image[]', url))
        }

        response = await fetch(`${this.getBaseEndpoint()}/v1/videos`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: formData,
        })
      } else {
        // 统一格式：JSON
        response = await fetch(`${this.getBaseEndpoint()}/v1/video/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
        })
      }

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[YunwuVeo] API Error:', errorText)
        let errorMessage = `API 请求失败: ${response.status} ${response.statusText}`
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.error?.message || errorJson.message || errorMessage
        } catch {
          // not JSON
        }
        videoLog.error('Veo 创建视频任务失败', {
          provider: 'yunwu-veo',
          model: finalModel,
          httpStatus: response.status,
          errorMessage,
          requestParams: { model: finalModel, prompt: prompt.substring(0, 200), hasImages: !!images && images.length > 0, aspectRatio },
          responseBody: errorText.substring(0, 1000),
        })
        return { success: false, error: errorMessage }
      }

      const data: VeoVideoCreateResponse = await response.json()
      console.log('[YunwuVeo] 创建任务响应:', JSON.stringify(data, null, 2))

      if (!data.id) {
        videoLog.error('Veo 创建任务未返回 ID', {
          provider: 'yunwu-veo',
          model: finalModel,
          responseBody: data,
        })
        return { success: false, error: '未返回任务 ID' }
      }

      videoLog.info('Veo 创建视频任务成功', {
        provider: 'yunwu-veo',
        model: finalModel,
        taskId: data.id,
      })

      console.log('[YunwuVeo] 任务已创建:', data.id)

      return {
        success: true,
        taskId: data.id,
      }
    } catch (error) {
      console.error('[YunwuVeo] Create task error:', error)
      const errorMessage = error instanceof Error ? error.message : '创建任务失败'
      videoLog.error('Veo 创建任务异常', {
        provider: 'yunwu-veo',
        model: model || this.getModel(),
        errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined,
        requestParams: { prompt: prompt.substring(0, 200), hasImages: !!images && images.length > 0 },
      })
      return { success: false, error: errorMessage }
    }
  }

  async queryTaskStatus(taskId: string): Promise<VeoVideoQueryResponse> {
    // OpenAI 格式的 taskId 以 "video_" 开头
    const isOpenAI = taskId.startsWith('video_')
    const url = isOpenAI
      ? `${this.getBaseEndpoint()}/v1/videos/${encodeURIComponent(taskId)}`
      : `${this.getBaseEndpoint()}/v1/video/query?id=${encodeURIComponent(taskId)}`

    const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
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
        console.log(`[YunwuVeo] 任务 ${taskId} 已被用户取消`)
        return { success: false, error: '已取消' }
      }

      try {
        const status = await this.queryTaskStatus(taskId)

        const statusText = this.getStatusText(status.status)
        const elapsed = Date.now() - startTime
        const progressPercent = Math.min(90, Math.floor((elapsed / maxWaitMs) * 100))

        if (onProgress) {
          onProgress(progressPercent, status.status, statusText)
        }

        console.log(`[YunwuVeo] 任务 ${taskId}: ${status.status} (${progressPercent}%)`)

        if (status.status === 'completed' || status.status === 'success') {
          videoLog.info('Veo 视频生成完成', {
            provider: 'yunwu-veo',
            taskId,
            duration: Date.now() - startTime,
            extra: { videoUrl: status.video_url },
          })
          return {
            success: true,
            videoUrl: status.video_url || undefined,
          }
        }

        if (status.status === 'failed' || status.status === 'error') {
          // error 可能是字符串或对象
          let failReason = '未知原因'
          if (typeof status.error === 'string') {
            failReason = status.error
          } else if (status.error && typeof status.error === 'object') {
            failReason = (status.error as { message?: string }).message || '未知原因'
          } else if (status.error_message) {
            failReason = status.error_message
          } else if (status.message) {
            failReason = status.message
          }

          videoLog.error('Veo 视频生成失败（服务端返回失败）', {
            provider: 'yunwu-veo',
            taskId,
            duration: Date.now() - startTime,
            errorMessage: failReason,
            responseBody: status,
          })
          console.error(`[YunwuVeo] 任务失败详情:`, JSON.stringify(status, null, 2))
          
          return {
            success: false,
            error: '生成失败',
          }
        }

        await this.sleep(pollIntervalMs)
      } catch (error) {
        console.error('[YunwuVeo] Poll error:', error)
        await this.sleep(pollIntervalMs)
      }
    }

    videoLog.error('Veo 视频生成超时', {
      provider: 'yunwu-veo',
      taskId,
      duration: Date.now() - startTime,
      extra: { maxWaitMs },
    })

    return {
      success: false,
      error: '任务超时',
    }
  }

  private getStatusText(status: string): string {
    switch (status) {
      case 'pending':
      case 'queued':
        return '任务排队中...'
      case 'processing':
      case 'in_progress':
        return '正在生成视频...'
      case 'completed':
      case 'success':
        return '生成完成'
      case 'failed':
      case 'error':
        return '生成失败'
      default:
        return '处理中...'
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
