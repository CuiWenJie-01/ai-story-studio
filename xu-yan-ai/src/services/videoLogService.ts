import { writeTextFile, exists, mkdir, readTextFile } from '@tauri-apps/plugin-fs'
import { appDataDir } from '@tauri-apps/api/path'

const LOG_FILE_NAME = 'video-generation.log'
const MAX_LOG_SIZE = 1024 * 1024 // 1MB，超过后截断旧日志

let logDirPath: string | null = null
let logFilePath: string | null = null

async function ensureLogFile(): Promise<string> {
  if (logFilePath) return logFilePath

  const dataDir = await appDataDir()
  logDirPath = `${dataDir}logs`
  logFilePath = `${logDirPath}\\${LOG_FILE_NAME}`

  try {
    const dirExists = await exists(logDirPath)
    if (!dirExists) {
      await mkdir(logDirPath, { recursive: true })
    }
  } catch (e) {
    console.error('[VideoLog] 创建日志目录失败:', e)
  }

  return logFilePath
}

function formatTimestamp(): string {
  const now = new Date()
  return now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }) + '.' + String(now.getMilliseconds()).padStart(3, '0')
}

function sanitizeForLog(obj: unknown): string {
  try {
    return JSON.stringify(obj, (_key, value) => {
      if (typeof value === 'string' && value.length > 500) {
        return value.substring(0, 500) + '...[truncated]'
      }
      return value
    }, 2)
  } catch {
    return String(obj)
  }
}

export interface VideoLogEntry {
  level: 'INFO' | 'ERROR' | 'WARN'
  action: string
  shotNumber?: number | string
  provider?: string
  model?: string
  taskId?: string
  httpStatus?: number
  requestParams?: Record<string, unknown>
  responseBody?: unknown
  errorMessage?: string
  errorStack?: string
  duration?: number
  extra?: Record<string, unknown>
}

async function appendLog(entry: VideoLogEntry): Promise<void> {
  try {
    const filePath = await ensureLogFile()
    const timestamp = formatTimestamp()

    const lines: string[] = [
      `[${timestamp}] [${entry.level}] ${entry.action}`,
    ]

    if (entry.shotNumber !== undefined) lines.push(`  镜头: #${entry.shotNumber}`)
    if (entry.provider) lines.push(`  服务商: ${entry.provider}`)
    if (entry.model) lines.push(`  模型: ${entry.model}`)
    if (entry.taskId) lines.push(`  任务ID: ${entry.taskId}`)
    if (entry.httpStatus) lines.push(`  HTTP状态: ${entry.httpStatus}`)
    if (entry.duration !== undefined) lines.push(`  耗时: ${entry.duration}ms`)
    if (entry.errorMessage) lines.push(`  错误: ${entry.errorMessage}`)
    if (entry.errorStack) lines.push(`  堆栈: ${entry.errorStack}`)
    if (entry.requestParams) lines.push(`  请求参数: ${sanitizeForLog(entry.requestParams)}`)
    if (entry.responseBody) lines.push(`  响应内容: ${sanitizeForLog(entry.responseBody)}`)
    if (entry.extra) lines.push(`  附加信息: ${sanitizeForLog(entry.extra)}`)

    lines.push('---')
    const logText = lines.join('\n') + '\n'

    // 读取现有内容并追加
    let existingContent = ''
    try {
      const fileExists = await exists(filePath)
      if (fileExists) {
        existingContent = await readTextFile(filePath)
        // 超过 1MB 时只保留后半部分
        if (existingContent.length > MAX_LOG_SIZE) {
          const halfPoint = existingContent.indexOf('---', Math.floor(existingContent.length / 2))
          existingContent = halfPoint > 0
            ? '...[旧日志已截断]\n' + existingContent.substring(halfPoint)
            : existingContent.substring(Math.floor(existingContent.length / 2))
        }
      }
    } catch {
      // 文件不存在，正常
    }

    await writeTextFile(filePath, existingContent + logText)
  } catch (e) {
    console.error('[VideoLog] 写入日志失败:', e)
  }
}

export const videoLog = {
  info(action: string, details?: Partial<VideoLogEntry>) {
    const entry: VideoLogEntry = { level: 'INFO', action, ...details }
    console.log(`[VideoLog] ${action}`, details)
    appendLog(entry)
  },

  warn(action: string, details?: Partial<VideoLogEntry>) {
    const entry: VideoLogEntry = { level: 'WARN', action, ...details }
    console.warn(`[VideoLog] ${action}`, details)
    appendLog(entry)
  },

  error(action: string, details?: Partial<VideoLogEntry>) {
    const entry: VideoLogEntry = { level: 'ERROR', action, ...details }
    console.error(`[VideoLog] ${action}`, details)
    appendLog(entry)
  },

  async getLogPath(): Promise<string> {
    return ensureLogFile()
  },
}
