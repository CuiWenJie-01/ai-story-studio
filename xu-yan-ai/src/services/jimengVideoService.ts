import type { ApiConfig } from '../types'
import { videoLog } from './videoLogService'

// 即梦视频3.0模型配置
export const JIMENG_VIDEO_MODELS = [
  { value: 'jimeng_v30_1080p', label: '即梦3.0 1080P (推荐)' },
  { value: 'jimeng_v30_720p', label: '即梦3.0 720P (快速)' },
] as const

export type JimengVideoModel = typeof JIMENG_VIDEO_MODELS[number]['value']


async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const keyBuffer = key instanceof Uint8Array ? key.buffer as ArrayBuffer : key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
}

async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return arrayBufferToHex(hash)
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function buildSignature(
  accessKey: string,
  secretKey: string,
  method: string,
  path: string,
  query: string,
  body: string,
  date: string,
): Promise<string> {
  const bodyHash = await sha256Hex(body)

  const canonicalRequest = [
    method,
    path,
    query,
    `host:visual.volcengineapi.com`,
    `x-date:${date}`,
    '',
    'host;x-date',
    bodyHash,
  ].join('\n')

  const dateShort = date.substring(0, 8)
  const credentialScope = `${dateShort}/cn-north-1/cv/request`

  const canonicalRequestHash = await sha256Hex(canonicalRequest)
  const stringToSign = `HMAC-SHA256\n${date}\n${credentialScope}\n${canonicalRequestHash}`

  const kDate = await hmacSha256(new TextEncoder().encode(secretKey), dateShort)
  const kRegion = await hmacSha256(kDate, 'cn-north-1')
  const kService = await hmacSha256(kRegion, 'cv')
  const kSigning = await hmacSha256(kService, 'request')
  const signature = arrayBufferToHex(await hmacSha256(kSigning, stringToSign))

  return `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=host;x-date, Signature=${signature}`
}

function getUtcDateString(): string {
  const now = new Date()
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace('T', 'T').substring(0, 15) + 'Z'
}


const API_BASE = 'https://visual.volcengineapi.com'

async function volcRequest(
  accessKey: string,
  secretKey: string,
  action: string,
  body: Record<string, unknown>,
): Promise<{ code: number; data: Record<string, unknown> | null; message: string }> {
  const bodyStr = JSON.stringify(body)
  const query = `Action=${action}&Version=2022-08-31`
  const date = getUtcDateString()
  const authorization = await buildSignature(accessKey, secretKey, 'POST', '/', query, bodyStr, date)

  const response = await fetch(`${API_BASE}/?${query}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': 'visual.volcengineapi.com',
      'Authorization': authorization,
      'X-Date': date,
    },
    body: bodyStr,
  })

  const result = await response.json()
  return {
    code: result.code ?? 0,
    data: result.data ?? null,
    message: result.message ?? '未知错误',
  }
}


function getReqKey(
  model: JimengVideoModel,
  mode: 'text2video' | 'firstFrame' | 'firstLastFrame'
): string {
  const is1080 = model === 'jimeng_v30_1080p'
  switch (mode) {
    case 'text2video':
      return is1080 ? 'jimeng_t2v_v30_1080p' : 'jimeng_t2v_v30_720p'
    case 'firstFrame':
      return is1080 ? 'jimeng_i2v_first_v30_1080' : 'jimeng_i2v_first_v30_720'
    case 'firstLastFrame':
      return is1080 ? 'jimeng_i2v_first_tail_v30_1080' : 'jimeng_i2v_first_tail_v30_720'
  }
}


export interface JimengVideoGenerateOptions {
  prompt: string
  model?: JimengVideoModel
  firstFrameUrl?: string
  lastFrameUrl?: string
  aspectRatio?: string
  duration?: number
  seed?: number
}

export class JimengVideoService {
  private config: ApiConfig

  constructor(config: ApiConfig) {
    this.config = config
  }

  async createVideoTask(options: JimengVideoGenerateOptions): Promise<{
    success: boolean
    taskId?: string
    reqKey?: string
    error?: string
  }> {
    const { prompt, model = 'jimeng_v30_1080p', firstFrameUrl, lastFrameUrl, aspectRatio, duration = 5, seed } = options

    if (!this.config.apiKey || !this.config.apiSecret) {
      return { success: false, error: '请先配置即梦 Access Key 和 Secret Key' }
    }

    // 确定模式
    let mode: 'text2video' | 'firstFrame' | 'firstLastFrame'
    if (firstFrameUrl && lastFrameUrl) {
      mode = 'firstLastFrame'
    } else if (firstFrameUrl) {
      mode = 'firstFrame'
    } else {
      mode = 'text2video'
    }

    const reqKey = getReqKey(model, mode)
    const frames = duration >= 10 ? 241 : 121

    const body: Record<string, unknown> = {
      req_key: reqKey,
      prompt,
      seed: seed ?? -1,
      frames,
    }

    // 文生视频支持 aspect_ratio
    if (mode === 'text2video' && aspectRatio) {
      body.aspect_ratio = aspectRatio
    }

    // 图生视频需要 image_urls
    if (mode === 'firstLastFrame') {
      body.image_urls = [firstFrameUrl, lastFrameUrl]
    } else if (mode === 'firstFrame') {
      body.image_urls = [firstFrameUrl]
    }

    console.log(`[JimengVideo] 创建任务: mode=${mode}, reqKey=${reqKey}, frames=${frames}`)

    try {
      const result = await volcRequest(
        this.config.apiKey,
        this.config.apiSecret!,
        'CVSync2AsyncSubmitTask',
        body,
      )

      if (result.code !== 10000) {
        const error = `API错误(code=${result.code}): ${result.message}`
        videoLog.error('即梦视频3.0 创建任务失败', { provider: 'jimeng', errorMessage: error })
        return { success: false, error }
      }

      const taskId = result.data?.task_id as string | undefined
      videoLog.info('即梦视频3.0 创建任务成功', {
        provider: 'jimeng',
        taskId,
        extra: { reqKey, mode, frames },
      })

      return { success: true, taskId, reqKey }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      videoLog.error('即梦视频3.0 创建任务异常', { provider: 'jimeng', errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  async queryTaskStatus(reqKey: string, taskId: string): Promise<{
    success: boolean
    status?: string
    videoUrl?: string
    error?: string
  }> {
    try {
      const result = await volcRequest(
        this.config.apiKey,
        this.config.apiSecret!,
        'CVSync2AsyncGetResult',
        { req_key: reqKey, task_id: taskId },
      )

      const status = (result.data?.status as string) || ''

      // 任务还在进行中时 code 可能不是 10000
      if (result.code !== 10000 && status !== 'in_queue' && status !== 'generating') {
        return {
          success: false,
          status,
          error: `API错误(code=${result.code}): ${result.message}`,
        }
      }

      return {
        success: true,
        status,
        videoUrl: result.data?.video_url as string | undefined,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async waitForCompletion(
    reqKey: string,
    taskId: string,
    onProgress?: (progress: number, status: string, message: string) => void,
    pollIntervalMs = 5000,
    maxWaitMs = 600000,
    isCancelled?: () => boolean
  ): Promise<{
    success: boolean
    videoUrl?: string
    error?: string
  }> {
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
      if (isCancelled?.()) {
        return { success: false, error: '已取消' }
      }

      try {
        const result = await this.queryTaskStatus(reqKey, taskId)
        const elapsed = Date.now() - startTime
        const progressPercent = Math.min(90, Math.floor((elapsed / maxWaitMs) * 100))

        if (!result.success) {
          videoLog.error('即梦视频3.0 生成失败', {
            provider: 'jimeng', taskId, duration: elapsed,
            errorMessage: result.error || '未知错误',
          })
          return { success: false, error: result.error }
        }

        const statusText = this.getStatusText(result.status || '')
        onProgress?.(progressPercent, result.status || '', statusText)
        console.log(`[JimengVideo] 任务 ${taskId}: ${result.status} (${progressPercent}%)`)

        if (result.status === 'done') {
          if (result.videoUrl) {
            videoLog.info('即梦视频3.0 生成完成', {
              provider: 'jimeng', taskId, duration: elapsed,
              extra: { videoUrl: result.videoUrl },
            })
            return { success: true, videoUrl: result.videoUrl }
          }
          return { success: false, error: '任务完成但未返回视频URL' }
        }

        if (result.status === 'not_found' || result.status === 'expired') {
          return { success: false, error: `任务${result.status === 'expired' ? '已过期' : '未找到'}` }
        }

        await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
      } catch (error) {
        console.error('[JimengVideo] 轮询错误:', error)
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
      }
    }

    videoLog.error('即梦视频3.0 生成超时', { provider: 'jimeng', taskId, duration: Date.now() - startTime })
    return { success: false, error: '任务超时（10分钟）' }
  }

  private getStatusText(status: string): string {
    switch (status) {
      case 'in_queue': return '任务排队中...'
      case 'generating': return '正在生成视频...'
      case 'done': return '生成完成'
      case 'not_found': return '任务未找到'
      case 'expired': return '任务已过期'
      default: return '处理中...'
    }
  }
}
