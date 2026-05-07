import { readDir } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'

export interface ShotImage {
  shotNumber: number | string
  path: string
  fileName: string
}

function extractShotNumberFromFileName(fileName: string): number | null {
  const match = fileName.match(/^镜头(\d+)/)
  if (match) {
    return parseInt(match[1], 10)
  }
  const numericMatch = fileName.match(/^(\d+)/)
  if (numericMatch) {
    return parseInt(numericMatch[1], 10)
  }
  return null
}

function isImageFile(fileName: string): boolean {
  if (/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName)) {
    return true
  }
  if (/_(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName)) {
    return true
  }
  return false
}

export async function scanImageDirectory(taskPath: string): Promise<ShotImage[]> {
  const shotImages: ShotImage[] = []

  try {
    const imagePath = await join(taskPath, 'Image')

    console.log(`[ImageScanner] 任务路径: ${taskPath}`)
    console.log(`[ImageScanner] 扫描Image目录: ${imagePath}`)

    try {
      const entries = await readDir(imagePath)
      console.log(`[ImageScanner] 目录中共有 ${entries.length} 个文件/文件夹`)

      for (const entry of entries) {
        if (!entry.isFile) continue
        
        if (!isImageFile(entry.name)) {
          continue
        }

        const shotNumber = extractShotNumberFromFileName(entry.name)
        
        if (shotNumber === null) {
          console.log(`[ImageScanner] 文件 ${entry.name} 无法提取镜头号`)
          continue
        }

        const filePath = await join(imagePath, entry.name)
        
        shotImages.push({
          shotNumber,
          path: filePath,
          fileName: entry.name,
        })
        
        console.log(`[ImageScanner] 找到镜头 ${shotNumber} 的图片: ${entry.name}`)
      }

      console.log(`[ImageScanner] 扫描完成，找到 ${shotImages.length} 张图片`)
    } catch (error) {
      console.error(`[ImageScanner] Image目录不存在或无法读取: ${error}`)
    }
  } catch (error) {
    console.error(`[ImageScanner] 路径错误: ${error}`)
  }

  return shotImages
}

export default {
  scanImageDirectory,
}
