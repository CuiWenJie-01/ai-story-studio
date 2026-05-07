import { join } from '@tauri-apps/api/path'
import { writeFile, exists, mkdir } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'

export interface SeedanceVideoResult {
  id: string
  taskId: string
  prompt: string
  model: string
  aspectRatio: string
  resolution: string
  duration: number
  videoUrl?: string
  localVideoPath?: string
  createdAt: number
  completedAt?: number
  status: 'success' | 'failed'
  error?: string
}

const SEEDANCE_FOLDER = 'seedance'
const IMAGE_FOLDER = 'images'
const JSON_FOLDER = 'json'

async function ensureDir(dirPath: string): Promise<void> {
  const dirExists = await exists(dirPath)
  if (!dirExists) {
    await mkdir(dirPath, { recursive: true })
  }
}

export async function saveSeedanceImage(
  taskPath: string,
  imageData: Blob,
  imageIndex: number
): Promise<{ path: string; name: string } | null> {
  try {
    const seedanceDir = await join(taskPath, SEEDANCE_FOLDER)
    const imageDir = await join(seedanceDir, IMAGE_FOLDER)
    await ensureDir(imageDir)

    const extension = imageData.type.split('/')[1]?.split(';')[0] || 'png'
    const fileName = `素材${imageIndex}.${extension}`
    const filePath = await join(imageDir, fileName)

    const arrayBuffer = await imageData.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    await writeFile(filePath, uint8Array)

    console.log('[SeedanceStorage] 图片保存成功:', filePath)
    return { path: filePath, name: fileName }
  } catch (error) {
    console.error('[SeedanceStorage] 图片保存失败:', error)
    return null
  }
}

export async function saveSeedanceResult(
  taskPath: string,
  result: SeedanceVideoResult
): Promise<string | null> {
  try {
    const jsonDir = await join(taskPath, JSON_FOLDER)
    await ensureDir(jsonDir)

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safeName = `seedance_${timestamp}`
    const filePath = await join(jsonDir, `${safeName}.json`)

    const data = JSON.stringify(result, null, 2)
    const encoder = new TextEncoder()
    await writeFile(filePath, encoder.encode(data))

    console.log('[SeedanceStorage] 保存结果成功:', filePath)
    return filePath
  } catch (error) {
    console.error('[SeedanceStorage] 保存结果失败:', error)
    return null
  }
}

export async function saveSeedanceVideo(
  taskPath: string,
  videoUrl: string,
  taskId: string,
  videoIndex: number
): Promise<string | null> {
  try {
    console.log('[SeedanceStorage] 开始保存视频:', { taskPath, videoUrl, taskId, videoIndex })

    const seedanceDir = await join(taskPath, SEEDANCE_FOLDER)
    await ensureDir(seedanceDir)

    const extension = 'mp4'
    
    // 扫描已有文件确定下一个序号
    const { readDir } = await import('@tauri-apps/plugin-fs')
    let nextSeq = 1
    try {
      const entries = await readDir(seedanceDir)
      const pattern = new RegExp(`^视频${videoIndex}_(\\d+)\\.mp4$`)
      for (const entry of entries) {
        if (entry.isFile && entry.name) {
          const match = entry.name.match(pattern)
          if (match) {
            const seq = parseInt(match[1], 10)
            if (seq >= nextSeq) nextSeq = seq + 1
          }
        }
      }
    } catch {
      // 目录不存在或读取失败，从1开始
    }
    
    const fileName = `视频${videoIndex}_${nextSeq}.${extension}`
    const filePath = await join(seedanceDir, fileName)

    console.log('[SeedanceStorage] 正在通过Tauri下载视频:', videoUrl)
    const result = await invoke<{
      success: boolean
      path: string | null
      error: string | null
    }>('download_file', {
      url: videoUrl,
      localPath: filePath,
    })

    if (result.success && result.path) {
      console.log('[SeedanceStorage] 视频保存成功:', result.path)
      return result.path
    } else {
      console.error('[SeedanceStorage] 视频保存失败:', result.error)
      return null
    }
  } catch (error) {
    console.error('[SeedanceStorage] 保存视频失败:', error)
    return null
  }
}

export async function getSeedanceResults(taskPath: string): Promise<SeedanceVideoResult[]> {
  try {
    const jsonDir = await join(taskPath, JSON_FOLDER)
    const dirExists = await exists(jsonDir)

    if (!dirExists) {
      return []
    }

    const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs')
    const entries = await readDir(jsonDir)
    
    const results: SeedanceVideoResult[] = []
    
    for (const entry of entries) {
      if (entry.name?.endsWith('.json')) {
        try {
          const filePath = await join(jsonDir, entry.name)
          const content = await readTextFile(filePath)
          const data = JSON.parse(content) as SeedanceVideoResult
          results.push(data)
        } catch (err) {
          console.error('[SeedanceStorage] 读取结果文件失败:', entry.name, err)
        }
      }
    }
    
    // 按创建时间排序，最新的在前
    results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    
    console.log('[SeedanceStorage] 读取结果成功:', results.length, '条记录')
    return results
  } catch (error) {
    console.error('[SeedanceStorage] 读取结果失败:', error)
    return []
  }
}

/**
 * 获取已保存的视频文件列表
 */
export async function getSavedVideos(taskPath: string): Promise<Array<{ path: string; name: string; index: number }>> {
  try {
    const seedanceDir = await join(taskPath, SEEDANCE_FOLDER)
    const dirExists = await exists(seedanceDir)
    
    if (!dirExists) {
      return []
    }
    
    const { readDir } = await import('@tauri-apps/plugin-fs')
    const entries = await readDir(seedanceDir)
    
    const videos: Array<{ path: string; name: string; index: number }> = []
    
    for (const entry of entries) {
      if (entry.name?.endsWith('.mp4')) {
        // 从文件名提取索引，支持多种格式：
        // 1. 新格式：视频1_1.mp4（视频索引_序号）
        // 2. 旧格式：视频1-视频.mp4（兼容旧版本）
        // 3. 其他格式：视频1.mp4
        const match = entry.name.match(/视频(\d+)(?:[_-][^.]*)?\.mp4/)
        const index = match ? parseInt(match[1]) : 0
        
        videos.push({
          path: await join(seedanceDir, entry.name),
          name: entry.name,
          index
        })
      }
    }
    
    // 按索引排序
    videos.sort((a, b) => a.index - b.index)
    
    return videos
  } catch (error) {
    console.error('[SeedanceStorage] 获取已保存视频失败:', error)
    return []
  }
}