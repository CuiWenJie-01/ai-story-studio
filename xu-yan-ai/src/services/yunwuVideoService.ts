import type { ApiConfig } from '../types'
import { videoLog } from './videoLogService'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

export interface YunwuVideoCreation {
  id: string
  url: string
  video?: {
    fps: number
    duration: number
    resolution: string | null
  }
}

export interface YunwuVideoCreateResponse {
  task_id: string
  id?: string
  type: string
  state?: string
  status?: string
  model: string
  style?: string
  prompt?: string
  progress?: number
  created_at?: number
  video_url?: string
  creations?: YunwuVideoCreation[]
  completed_at?: number
  expires_at?: number
  error?: {
    message: string
  }
  Response?: {
    Status: string
    TaskType: string
    RequestId?: string
    CreateTime?: string
    FinishTime?: string
    BeginProcessTime?: string
    AigcImageTask?: {
      Input?: {
        Prompt?: string
        ModelName?: string
        ModelVersion?: string
        OutputConfig?: {
          StorageMode?: string
        }
        EnhancePrompt?: string
        NegativePrompt?: string
      }
      Output?: {
        FileInfos?: Array<{
          FileUrl: string
          ExpireTime?: string
          StorageMode?: string
        }>
      }
      Status?: string
      TaskId?: string
      Progress?: number
    }
    AigcVideoTask?: {
      Input?: {
        Prompt?: string
        ModelName?: string
        ModelVersion?: string
        Duration?: number
        AspectRatio?: string
      }
      Output?: {
        FileInfos?: Array<{
          FileUrl: string
          ExpireTime?: string
          StorageMode?: string
        }>
      }
      Status?: string
      TaskId?: string
      Progress?: number
    }
  }
}

export interface YunwuVideoGenerateOptions {
  prompt: string
  model?: string
  duration?: number
  resolution?: '540p' | '720p' | '1080p'
  firstFrameImage?: string
  lastFrameImage?: string
}

export class YunwuVideoService {
  private config: ApiConfig

  constructor(config: ApiConfig) {
    this.config = config
  }

  private getBaseEndpoint(): string {
    return this.config.endpoint || 'https://yunwu.ai'
  }

  private getModel(): string {
    const videoModel = this.config.videoModel || 'viduq3-turbo'
    if (videoModel.startsWith('viduq3')) {
      return 'viduq3-turbo'
    }
    if (videoModel.startsWith('viduq2')) {
      return 'viduq2'
    }
    if (videoModel.startsWith('viduq1')) {
      return 'viduq1'
    }
    return 'viduq3-turbo'
  }

  async createVideoTask(options: YunwuVideoGenerateOptions): Promise<{
    success: boolean
    taskId?: string
    error?: string
  }> {
    const {
      prompt,
      duration = 5,
      resolution,
      firstFrameImage,
      lastFrameImage,
    } = options

    const finalResolution = resolution || this.config.resolution || '720p'

    if (!this.config.apiKey) {
      return { success: false, error: '请先配置 API Key' }
    }

    if (!firstFrameImage) {
      return { success: false, error: '请提供首帧图片' }
    }

    try {
      const model = this.getModel()
      const hasLastFrame = !!lastFrameImage
      
      const body: Record<string, unknown> = {
        model,
        prompt,
        duration,
        resolution: finalResolution,
        watermark: false,
      }

      let endpoint: string
      
      if (hasLastFrame) {
        endpoint = `${this.getBaseEndpoint()}/ent/v2/start-end2video`
        body.images = [firstFrameImage, lastFrameImage]
      } else {
        endpoint = `${this.getBaseEndpoint()}/ent/v2/img2video`
        body.images = [firstFrameImage]
      }

      console.log('[YunwuVideo] 创建视频任务:', JSON.stringify({
        endpoint,
        model,
        prompt: prompt.substring(0, 100) + '...',
        duration,
        resolution,
        hasFirstFrame: !!firstFrameImage,
        hasLastFrame,
      }, null, 2))

      // 发送请求并解析响应的核心逻辑
      const doRequest = async (fetchFn: typeof fetch, method: string): Promise<{
        success: boolean
        taskId?: string
        error?: string
        bodyReadFailed?: boolean
      }> => {
        const resp = await fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        console.log(`[YunwuVideo] Response status: ${resp.status} ${resp.statusText} (via ${method})`)

        if (!resp.ok) {
          let errorText = ''
          try { errorText = await resp.text() } catch { errorText = '无法读取错误响应' }
          console.error('[YunwuVideo] API Error:', errorText)
          let errorMessage = `API 请求失败: ${resp.status} ${resp.statusText}`
          try {
            const errorJson = JSON.parse(errorText)
            errorMessage = errorJson.error?.message || errorJson.message || errorMessage
          } catch { /* not JSON */ }
          videoLog.error('Vidu 创建视频任务失败', {
            provider: 'yunwu-vidu',
            model: model,
            httpStatus: resp.status,
            errorMessage,
            requestParams: { model, prompt: prompt.substring(0, 200), duration, resolution: finalResolution, hasFirstFrame: !!firstFrameImage, hasLastFrame: !!lastFrameImage },
            responseBody: errorText.substring(0, 1000),
          })
          return { success: false, error: errorMessage }
        }

        // 尝试多种方式读取响应体
        let data: YunwuVideoCreateResponse | null = null

        // 方式1: 直接 response.json()
        try {
          data = await resp.json() as YunwuVideoCreateResponse
          console.log(`[YunwuVideo] (${method}) json() 成功:`, JSON.stringify(data, null, 2))
        } catch (jsonErr) {
          console.warn(`[YunwuVideo] (${method}) json() 失败:`, jsonErr)
        }

        // 方式2: response.text() + JSON.parse
        if (!data) {
          try {
            const text = await resp.text()
            console.log(`[YunwuVideo] (${method}) text() 成功:`, text.substring(0, 500))
            if (text && !text.startsWith('<!DOCTYPE') && !text.startsWith('<html')) {
              data = JSON.parse(text) as YunwuVideoCreateResponse
            }
          } catch (textErr) {
            console.warn(`[YunwuVideo] (${method}) text() 也失败:`, textErr)
          }
        }

        // 方式3: arrayBuffer -> 手动解码
        if (!data) {
          try {
            const buffer = await resp.arrayBuffer()
            const decoder = new TextDecoder('utf-8')
            const decoded = decoder.decode(buffer)
            console.log(`[YunwuVideo] (${method}) arrayBuffer() 成功:`, decoded.substring(0, 500))
            if (decoded && !decoded.startsWith('<!DOCTYPE') && !decoded.startsWith('<html')) {
              data = JSON.parse(decoded) as YunwuVideoCreateResponse
            }
          } catch (bufErr) {
            console.warn(`[YunwuVideo] (${method}) arrayBuffer() 也失败:`, bufErr)
          }
        }

        if (!data) {
          console.error(`[YunwuVideo] (${method}) 200 OK 但所有方式均无法读取响应体`)
          return { success: false, bodyReadFailed: true, error: `(${method}) 响应体读取失败` }
        }

        const taskId = data.task_id || data.id
        if (!taskId) {
          console.error('[YunwuVideo] 响应中没有 task_id 字段，完整响应:', data)
          videoLog.error('Vidu 创建任务未返回 ID', { provider: 'yunwu-vidu', model, responseBody: data })
          return { success: false, error: '未返回任务 ID' }
        }

        console.log('[YunwuVideo] 任务已创建:', taskId)
        videoLog.info('Vidu 创建视频任务成功', { provider: 'yunwu-vidu', model, taskId })
        return { success: true, taskId }
      }

      // 第一步：优先使用 Tauri HTTP（绕过 webview 的 HTTP/2 问题）
      try {
        const result = await doRequest(tauriFetch as typeof fetch, 'Tauri')
        if (result.success) return result
        
        if (!result.bodyReadFailed) {
          // 明确的服务端错误，不重试
          return result
        }
        console.warn('[YunwuVideo] Tauri HTTP 响应体读取失败，尝试标准 fetch...')
      } catch (tauriError) {
        console.warn('[YunwuVideo] Tauri HTTP 请求失败，尝试标准 fetch:', tauriError)
      }

      // 第二步：标准 fetch fallback
      try {
        const result = await doRequest(fetch, 'Standard')
        if (result.success) return result
        
        if (result.bodyReadFailed) {
          videoLog.error('Vidu 创建任务响应体均不可读', {
            provider: 'yunwu-vidu',
            model,
            errorMessage: 'Tauri HTTP 和标准 fetch 均返回 200 但无法读取响应体',
          })
          return { success: false, error: '任务可能已创建但无法获取ID，请检查后台任务列表' }
        }
        return result
      } catch (standardError) {
        console.error('[YunwuVideo] 标准 fetch 也失败:', standardError)
        videoLog.error('Vidu 创建任务网络错误', {
          provider: 'yunwu-vidu',
          model,
          errorMessage: '所有请求方式都失败',
        })
        return { success: false, error: '网络请求失败。请求可能已成功，请检查后台任务列表。' }
      }
    } catch (error) {
      console.error('[YunwuVideo] Create task error:', error)
      const errorMessage = error instanceof Error ? error.message : '创建任务失败'
      videoLog.error('Vidu 创建任务异常', {
        provider: 'yunwu-vidu',
        errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined,
      })
      return { success: false, error: errorMessage }
    }
  }

  async queryTaskStatus(taskId: string): Promise<YunwuVideoCreateResponse> {
    const endpoint = `${this.getBaseEndpoint()}/ent/v2/tasks/${taskId}/creations`

    console.log(`[YunwuVideo] 查询任务状态: ${endpoint}`)

    let response: Response | null = null
    
    // 优先尝试标准 fetch
    try {
      response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      })
      console.log('[YunwuVideo] 查询使用标准 fetch 成功')
    } catch (standardError) {
      console.warn('[YunwuVideo] 标准 fetch 查询失败，尝试 Tauri HTTP:', standardError)
      
      // 回退到 Tauri HTTP 插件
      try {
        response = await tauriFetch(endpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
        })
        console.log('[YunwuVideo] 查询使用 Tauri HTTP 成功')
      } catch (tauriError) {
        console.error('[YunwuVideo] 所有查询方式都失败:', tauriError)
        throw new Error('查询任务失败: 无法连接到服务器')
      }
    }

    if (!response) {
      throw new Error('无法获取响应')
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[YunwuVideo] 查询失败: ${response.status}`, errorText)
      throw new Error(`查询任务失败: ${response.status} - ${errorText}`)
    }

    const text = await response.text()
    
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      console.error('[YunwuVideo] 返回了 HTML 而不是 JSON:', text.substring(0, 500))
      throw new Error('API 返回了无效的响应格式')
    }

    try {
      const data = JSON.parse(text)
      console.log('[YunwuVideo] 查询结果:', JSON.stringify(data, null, 2))
      return data
    } catch (e) {
      console.error('[YunwuVideo] JSON 解析失败:', text.substring(0, 500))
      throw new Error('JSON 解析失败')
    }
  }

  async waitForCompletion(
    taskId: string,
    _hasLastFrame: boolean = false,
    onProgress?: (progress: number, status: string, message: string) => void,
    pollIntervalMs: number = 5000,
    maxWaitMs: number = 600000
  ): Promise<{
    success: boolean
    videoUrl?: string
    error?: string
  }> {
    const startTime = Date.now()
    let consecutiveFinishWithoutUrl = 0

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const status = await this.queryTaskStatus(taskId)

        let progressPercent = status.progress || 0
        let statusValue = status.state || status.status || 'processing'
        let videoUrl: string | undefined

        if (status.Response) {
          const response = status.Response
          statusValue = response.Status || 'processing'

          if (response.AigcImageTask) {
            progressPercent = response.AigcImageTask.Progress || 0
            if (response.AigcImageTask.Output?.FileInfos?.[0]?.FileUrl) {
              videoUrl = response.AigcImageTask.Output.FileInfos[0].FileUrl
            }
          } else if (response.AigcVideoTask) {
            progressPercent = response.AigcVideoTask.Progress || 0
            if (response.AigcVideoTask.Output?.FileInfos?.[0]?.FileUrl) {
              videoUrl = response.AigcVideoTask.Output.FileInfos[0].FileUrl
            }
          }
        } else {
          videoUrl = status.video_url || status.creations?.[0]?.url
        }

        const statusText = this.getStatusText(statusValue)

        if (onProgress) {
          onProgress(progressPercent, statusValue, statusText)
        }

        console.log(`[YunwuVideo] 任务 ${taskId}: ${statusValue} (${progressPercent}%), videoUrl: ${videoUrl || 'none'}`)

        if (statusValue === 'success' || statusValue === 'completed' || statusValue === 'FINISH') {
          if (videoUrl) {
            consecutiveFinishWithoutUrl = 0
            videoLog.info('Vidu 视频生成完成', {
              provider: 'yunwu-vidu',
              taskId,
              duration: Date.now() - startTime,
              extra: { videoUrl },
            })
            return {
              success: true,
              videoUrl,
            }
          } else {
            consecutiveFinishWithoutUrl++
            console.log(`[YunwuVideo] 任务状态为 ${statusValue} 但暂无 videoUrl，等待第 ${consecutiveFinishWithoutUrl} 次`)
            if (consecutiveFinishWithoutUrl >= 3) {
              videoLog.error('Vidu 视频生成状态为完成但无输出URL', {
                provider: 'yunwu-vidu',
                taskId,
                duration: Date.now() - startTime,
                responseBody: status,
              })
              return {
                success: false,
                error: '视频生成完成但无法获取输出URL',
              }
            }
          }
        }

        if (statusValue === 'failed' || statusValue === 'FAIL') {
          videoLog.error('Vidu 视频生成失败（服务端返回失败）', {
            provider: 'yunwu-vidu',
            taskId,
            duration: Date.now() - startTime,
            errorMessage: status.error?.message || '视频生成失败',
            responseBody: status,
          })
          return {
            success: false,
            error: status.error?.message || '视频生成失败',
          }
        }

        consecutiveFinishWithoutUrl = 0
        await this.sleep(pollIntervalMs)
      } catch (error) {
        console.error('[YunwuVideo] Poll error:', error)
        consecutiveFinishWithoutUrl = 0
        await this.sleep(pollIntervalMs)
      }
    }

    videoLog.error('Vidu 视频生成超时', {
      provider: 'yunwu-vidu',
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
      case 'queued':
      case 'created':
        return '任务排队中...'
      case 'processing':
      case 'in_progress':
        return '正在生成视频...'
      case 'success':
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

  async deleteTask(taskId: string, hasLastFrame: boolean = false): Promise<boolean> {
    try {
      let endpoint: string
      if (hasLastFrame) {
        endpoint = `${this.getBaseEndpoint()}/ent/v2/start-end2video/${taskId}`
      } else {
        endpoint = `${this.getBaseEndpoint()}/ent/v2/img2video/${taskId}`
      }

      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      })

      return response.ok
    } catch (error) {
      console.error('[YunwuVideo] Delete task error:', error)
      return false
    }
  }
}
