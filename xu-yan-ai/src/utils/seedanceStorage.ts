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
const ENHANCED_FOLDER = 'enhanced'

async function ensureDir(dirPath: string): Promise<void> {
  const dirExists = await exists(dirPath)
  if (!dirExists) {
    await mkdir(dirPath, { recursive: true })
  }
}

/**
 * 保存素材图片
 * @param taskPath 项目路径
 * @param imageData 图片数据
 * @param videoItemId 视频项ID（用于命名，确保与视频项绑定）
 * @param imageIndex 图片序号（同一视频项下的第几张）
 */
export async function saveSeedanceImage(
  taskPath: string,
  imageData: Blob,
  videoItemId: string,
  imageIndex: number
): Promise<{ path: string; name: string } | null> {
  try {
    const seedanceDir = await join(taskPath, SEEDANCE_FOLDER)
    const imageDir = await join(seedanceDir, IMAGE_FOLDER)
    await ensureDir(imageDir)

    const extension = imageData.type.split('/')[1]?.split(';')[0] || 'png'
    const fileName = `素材_${videoItemId}_${imageIndex}.${extension}`
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

/**
 * 保存视频文件
 * @param taskPath 项目路径
 * @param videoUrl 视频URL
 * @param taskId 任务ID
 * @param videoItemId 视频项唯一ID（用于文件名绑定）
 */
export async function saveSeedanceVideo(
  taskPath: string,
  videoUrl: string,
  taskId: string,
  videoItemId: string
): Promise<string | null> {
  try {
    console.log('[SeedanceStorage] 开始保存视频:', { taskPath, videoUrl, taskId, videoItemId })

    const seedanceDir = await join(taskPath, SEEDANCE_FOLDER)
    await ensureDir(seedanceDir)

    const extension = 'mp4'

    // 扫描已有文件确定下一个序号
    const { readDir } = await import('@tauri-apps/plugin-fs')
    let nextSeq = 1
    try {
      const entries = await readDir(seedanceDir)
      const pattern = new RegExp(`^视频_${videoItemId}_(\\d+)\\.${extension}$`)
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

    const fileName = `视频_${videoItemId}_${nextSeq}.${extension}`
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
 * @returns 返回按 videoItemId 关联的视频列表
 */
/**
 * 保存画质增强后的视频文件（单独保存到 enhanced 文件夹）
 * @param taskPath 项目路径
 * @param videoUrl 视频URL
 * @param videoItemId 视频项唯一ID（用于文件名绑定）
 * @param resolution 增强后的分辨率
 */
export async function saveEnhancedVideo(
  taskPath: string,
  videoUrl: string,
  videoItemId: string,
  resolution: string
): Promise<string | null> {
  try {
    console.log('[SeedanceStorage] 开始保存增强视频:', { taskPath, videoUrl, videoItemId, resolution })

    const seedanceDir = await join(taskPath, SEEDANCE_FOLDER)
    const enhancedDir = await join(seedanceDir, ENHANCED_FOLDER)
    await ensureDir(enhancedDir)

    const extension = 'mp4'

    // 扫描已有文件确定下一个序号
    const { readDir } = await import('@tauri-apps/plugin-fs')
    let nextSeq = 1
    try {
      const entries = await readDir(enhancedDir)
      const pattern = new RegExp(`^视频_${videoItemId}_${resolution}_(\\d+)\\.${extension}$`)
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

    const fileName = `视频_${videoItemId}_${resolution}_${nextSeq}.${extension}`
    const filePath = await join(enhancedDir, fileName)

    console.log('[SeedanceStorage] 正在通过Tauri下载增强视频:', videoUrl)
    const result = await invoke<{
      success: boolean
      path: string | null
      error: string | null
    }>('download_file', {
      url: videoUrl,
      localPath: filePath,
    })

    if (result.success && result.path) {
      console.log('[SeedanceStorage] 增强视频保存成功:', result.path)
      return result.path
    } else {
      console.error('[SeedanceStorage] 增强视频保存失败:', result.error)
      return null
    }
  } catch (error) {
    console.error('[SeedanceStorage] 保存增强视频失败:', error)
    return null
  }
}

export async function getSavedVideos(taskPath: string): Promise<Array<{ path: string; name: string; videoItemId: string }>> {
  try {
    const seedanceDir = await join(taskPath, SEEDANCE_FOLDER)
    const dirExists = await exists(seedanceDir)

    if (!dirExists) {
      return []
    }

    const { readDir } = await import('@tauri-apps/plugin-fs')
    const entries = await readDir(seedanceDir)

    const videos: Array<{ path: string; name: string; videoItemId: string }> = []

    for (const entry of entries) {
      if (entry.name?.endsWith('.mp4')) {
        // 新格式：视频_{videoItemId}_{seq}.mp4
        const match = entry.name.match(/^视频_(.+?)_(\d+)\.mp4$/)
        if (match) {
          videos.push({
            path: await join(seedanceDir, entry.name),
            name: entry.name,
            videoItemId: match[1]
          })
        } else {
          // 兼容旧格式：视频1_1.mp4、视频1-视频.mp4、视频1.mp4
          const legacyMatch = entry.name.match(/视频(\d+)(?:[_-][^.]*)?\.mp4/)
          if (legacyMatch) {
            videos.push({
              path: await join(seedanceDir, entry.name),
              name: entry.name,
              videoItemId: legacyMatch[1]
            })
          }
        }
      }
    }

    return videos
  } catch (error) {
    console.error('[SeedanceStorage] 获取已保存视频失败:', error)
    return []
  }
}
