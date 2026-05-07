import { videoLog } from './videoLogService'
import { fetch } from '@tauri-apps/plugin-http'

const AMK_BASE_URL = 'https://amk.cn-beijing.volces.com'

interface EnhanceSubmitResponse {
  success: boolean
  task_id: string
  request_id: string
  error?: { code: string; message: string }
}

interface EnhanceQueryResponse {
  success: boolean
  task_id: string
  task_type: string
  status: 'running' | 'completed' | 'failed'
  result?: {
    video_url: string
    duration: number
    resolution: string
  }
  error?: { code: string; message: string }
  request_id: string
}

export type EnhanceResolution = '720p' | '1080p' | '2k' | '4k'

export class EnhanceVideoService {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async submitEnhance(videoUrl: string, resolution: EnhanceResolution, scene: string = 'short_series'): Promise<{
    success: boolean
    taskId?: string
    error?: string
  }> {
    try {
      console.log('[Enhance] 提交画质增强任务:', { videoUrl: videoUrl.substring(0, 80) + '...', resolution })

      const response = await fetch(`${AMK_BASE_URL}/api/v1/tools/enhance-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          video_url: videoUrl,
          tool_version: 'professional',
          scene,
          resolution,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Enhance] API Error:', errorText)
        let errorMessage = `请求失败: ${response.status}`
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.error?.message || errorMessage
        } catch { /* not JSON */ }
        videoLog.error('画质增强提交失败', { provider: 'amk', httpStatus: response.status, errorMessage })
        return { success: false, error: errorMessage }
      }

      const data: EnhanceSubmitResponse = await response.json()
      if (!data.success || !data.task_id) {
        const msg = data.error?.message || '提交失败'
        videoLog.error('画质增强提交返回错误', { provider: 'amk', errorMessage: msg })
        return { success: false, error: msg }
      }

      console.log('[Enhance] 任务已提交:', data.task_id)
      videoLog.info('画质增强任务已提交', { provider: 'amk', taskId: data.task_id })
      return { success: true, taskId: data.task_id }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '提交失败'
      videoLog.error('画质增强提交异常', { provider: 'amk', errorMessage: msg })
      return { success: false, error: msg }
    }
  }

  async queryTask(taskId: string): Promise<EnhanceQueryResponse> {
    const response = await fetch(`${AMK_BASE_URL}/api/v1/tasks/${taskId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    })
    if (!response.ok) {
      throw new Error(`查询失败: ${response.status}`)
    }
    return response.json()
  }

  async waitForCompletion(
    taskId: string,
    onProgress?: (progress: number, message: string) => void,
    isCancelled?: () => boolean,
    pollIntervalMs: number = 5000,
    maxWaitMs: number = 600000
  ): Promise<{ success: boolean; videoUrl?: string; resolution?: string; error?: string }> {
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
      if (isCancelled?.()) {
        return { success: false, error: '已取消' }
      }

      try {
        const result = await this.queryTask(taskId)
        const elapsed = Date.now() - startTime
        const progress = Math.min(90, Math.floor((elapsed / maxWaitMs) * 100))

        console.log(`[Enhance] 任务 ${taskId}: ${result.status} (${progress}%)`)

        if (onProgress) {
          onProgress(progress, result.status === 'running' ? '正在增强画质...' : '处理中...')
        }

        if (result.status === 'completed' && result.result?.video_url) {
          videoLog.info('画质增强完成', {
            provider: 'amk',
            taskId,
            duration: Date.now() - startTime,
            extra: { resolution: result.result.resolution },
          })
          return { success: true, videoUrl: result.result.video_url, resolution: result.result.resolution }
        }

        if (result.status === 'failed') {
          const msg = result.error?.message || '增强失败'
          videoLog.error('画质增强失败', { provider: 'amk', taskId, errorMessage: msg })
          return { success: false, error: msg }
        }

        await new Promise(r => setTimeout(r, pollIntervalMs))
      } catch (error) {
        console.error('[Enhance] Poll error:', error)
        await new Promise(r => setTimeout(r, pollIntervalMs))
      }
    }

    return { success: false, error: '增强超时' }
  }
}
