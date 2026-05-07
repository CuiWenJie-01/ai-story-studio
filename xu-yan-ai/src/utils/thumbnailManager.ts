import { mkdir, writeFile, exists } from '@tauri-apps/plugin-fs'
import { join, dirname } from '@tauri-apps/api/path'
import { convertFileSrc } from '@tauri-apps/api/core'

const THUMBNAIL_WIDTH = 400
const THUMBNAIL_QUALITY = 0.8

async function getThumbnailPath(originalPath: string): Promise<string> {
  const dir = await dirname(originalPath)
  const fileName = originalPath.split(/[/\\]/).pop() || 'image'
  const baseName = fileName.replace(/\.[^.]+$/, '')
  return join(dir, '.thumbnails', `${baseName}_thumb.jpg`)
}

async function ensureThumbnailDir(thumbnailPath: string): Promise<void> {
  const thumbDir = await dirname(thumbnailPath)
  await mkdir(thumbDir, { recursive: true })
}

export async function generateThumbnail(
  imagePath: string,
  saveToDisk: boolean = true
): Promise<{ thumbnailUrl: string; thumbnailPath?: string }> {
  let assetUrl = imagePath
  if (/^[A-Za-z]:[/\\]/.test(imagePath) || /^\/[^/]/.test(imagePath)) {
    assetUrl = convertFileSrc(imagePath)
  }

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        if (!ctx) {
          resolve({ thumbnailUrl: assetUrl })
          return
        }

        const aspectRatio = img.height / img.width
        const width = Math.min(THUMBNAIL_WIDTH, img.width)
        const height = width * aspectRatio

        canvas.width = width
        canvas.height = height

        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(async (blob) => {
          if (!blob) {
            resolve({ thumbnailUrl: assetUrl })
            return
          }

          const blobUrl = URL.createObjectURL(blob)
          let thumbnailPath: string | undefined

          if (saveToDisk && /^[A-Za-z]:[/\\]/.test(imagePath)) {
            try {
              thumbnailPath = await getThumbnailPath(imagePath)
              await ensureThumbnailDir(thumbnailPath)
              
              const arrayBuffer = await blob.arrayBuffer()
              const imageData = new Uint8Array(arrayBuffer)
              await writeFile(thumbnailPath, imageData)
              
              console.log(`[Thumbnail] 缩略图已保存: ${thumbnailPath}`)
              
              URL.revokeObjectURL(blobUrl)
              const savedThumbUrl = convertFileSrc(thumbnailPath)
              resolve({ 
                thumbnailUrl: savedThumbUrl, 
                thumbnailPath 
              })
              return
            } catch (err) {
              console.warn('[Thumbnail] 保存缩略图失败:', err)
            }
          }

          resolve({ 
            thumbnailUrl: blobUrl, 
            thumbnailPath 
          })
        }, 'image/jpeg', THUMBNAIL_QUALITY)
      } catch {
        resolve({ thumbnailUrl: assetUrl })
      }
    }
    
    img.onerror = () => {
      resolve({ thumbnailUrl: assetUrl })
    }
    
    img.src = assetUrl
  })
}

export async function loadExistingThumbnail(imagePath: string): Promise<string | null> {
  if (!/^[A-Za-z]:[/\\]/.test(imagePath)) {
    return null
  }

  try {
    const thumbnailPath = await getThumbnailPath(imagePath)
    const thumbExists = await exists(thumbnailPath)
    
    if (thumbExists) {
      return convertFileSrc(thumbnailPath)
    }
  } catch (err) {
    console.warn('[Thumbnail] 加载已有缩略图失败:', err)
  }
  
  return null
}

export async function batchGenerateThumbnails(
  imagePaths: string[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  
  for (let i = 0; i < imagePaths.length; i++) {
    const imagePath = imagePaths[i]
    
    const existingThumb = await loadExistingThumbnail(imagePath)
    if (existingThumb) {
      results.set(imagePath, existingThumb)
      if (onProgress) onProgress(i + 1, imagePaths.length)
      continue
    }
    
    const { thumbnailUrl } = await generateThumbnail(imagePath, true)
    results.set(imagePath, thumbnailUrl)
    
    if (onProgress) {
      onProgress(i + 1, imagePaths.length)
    }
  }
  
  return results
}

export function clearThumbnailCache(): void {
}
