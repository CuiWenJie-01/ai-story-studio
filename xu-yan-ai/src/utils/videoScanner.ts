import { readDir, exists } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'

export interface ShotVideo {
  shotNumber: number | string
  path: string
  fileName: string
  timestamp: number // 从文件名提取的时间戳，用于取最新的
}

function extractShotInfo(fileName: string): { shotNumber: number; timestamp: number } | null {
  // 匹配 镜头5_Video_1776674907760.mp4 或 镜头5_Video.mp4
  const match = fileName.match(/^镜头(\d+)_Video(?:_(\d+))?\.mp4$/i)
  if (match) {
    return {
      shotNumber: parseInt(match[1], 10),
      timestamp: match[2] ? parseInt(match[2], 10) : 0,
    }
  }
  return null
}

/**
 * 扫描 Video 文件夹，返回每个镜头最新的视频文件
 */
export async function scanVideoDirectory(taskPath: string): Promise<ShotVideo[]> {
  try {
    const videoPath = await join(taskPath, 'Video')
    const dirExists = await exists(videoPath)
    if (!dirExists) return []

    const entries = await readDir(videoPath)
    const videoMap = new Map<number, ShotVideo>()

    for (const entry of entries) {
      if (!entry.isFile || !entry.name) continue
      if (!entry.name.toLowerCase().endsWith('.mp4')) continue

      const info = extractShotInfo(entry.name)
      if (!info) continue

      const filePath = await join(videoPath, entry.name)
      const existing = videoMap.get(info.shotNumber)

      // 保留时间戳最大的（最新的）
      if (!existing || info.timestamp > existing.timestamp) {
        videoMap.set(info.shotNumber, {
          shotNumber: info.shotNumber,
          path: filePath,
          fileName: entry.name,
          timestamp: info.timestamp,
        })
      }
    }

    const result = Array.from(videoMap.values())
    console.log(`[VideoScanner] 扫描完成，找到 ${result.length} 个视频`)
    return result
  } catch (error) {
    console.error('[VideoScanner] 扫描失败:', error)
    return []
  }
}

/**
 * 检查 generatedVideo.url 指向的文件是否存在
 */
export async function videoFileExists(url: string): Promise<boolean> {
  if (!url) return false
  // 只检查本地路径（以盘符开头）
  if (!/^[A-Za-z]:[/\\]/.test(url)) return false
  // 去掉可能的查询参数
  const cleanPath = url.split('?')[0]
  try {
    return await exists(cleanPath)
  } catch {
    return false
  }
}
