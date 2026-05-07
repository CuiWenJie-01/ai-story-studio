import { mkdir, writeFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-shell'
import { invoke } from '@tauri-apps/api/core'
import { convertFileSrc } from '@tauri-apps/api/core'
import { clearImageAndThumbnailCache } from './imageCache'

export interface SaveResult {
  success: boolean
  path?: string
  thumbnailPath?: string
  error?: string
}

const THUMBNAIL_WIDTH = 400
const THUMBNAIL_QUALITY = 0.8

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

async function generateAndSaveThumbnail(imagePath: string): Promise<string | null> {
  try {
    const dir = await join(imagePath, '..')
    const fileName = imagePath.split(/[/\\]/).pop() || 'image'
    const baseName = fileName.replace(/\.[^.]+$/, '')
    const thumbDir = await join(dir, '.thumbnails')
    const thumbnailPath = await join(thumbDir, `${baseName}_thumb.jpg`)
    
    await ensureDir(thumbDir)
    
    const assetUrl = convertFileSrc(imagePath)
    
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          
          if (!ctx) {
            resolve(null)
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
              resolve(null)
              return
            }

            try {
              const arrayBuffer = await blob.arrayBuffer()
              const thumbData = new Uint8Array(arrayBuffer)
              await writeFile(thumbnailPath, thumbData)
              console.log('[FileSaver] 缩略图保存成功:', thumbnailPath)
              resolve(thumbnailPath)
            } catch {
              resolve(null)
            }
          }, 'image/jpeg', THUMBNAIL_QUALITY)
        } catch {
          resolve(null)
        }
      }
      
      img.onerror = () => resolve(null)
      img.src = assetUrl
    })
  } catch (err) {
    console.warn('[FileSaver] 生成缩略图失败:', err)
    return null
  }
}

export async function saveImageToTaskFolder(
  imageUrl: string,
  taskPath: string,
  shotNumber: number | string,
  timestamp: number
): Promise<SaveResult> {
  console.log('[FileSaver] 开始保存图片:', { imageUrl, taskPath, shotNumber, timestamp })
  
  try {
    const imageDir = await join(taskPath, 'Image')
    await ensureDir(imageDir)
    
    // 扫描已有文件确定下一个序号
    let nextSeq = 1
    try {
      const fs = await import('@tauri-apps/plugin-fs')
      const entries = await fs.readDir(imageDir)
      const pattern = new RegExp(`^镜头${shotNumber}_Image_(\\d+)\\.png$`)
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
    
    const fileName = `镜头${shotNumber}_Image_${nextSeq}.png`
    const filePath = await join(imageDir, fileName)
    console.log('[FileSaver] 目标文件路径:', filePath)
    
    clearImageAndThumbnailCache(filePath)
    
    let imageData: Uint8Array
    
    if (imageUrl.startsWith('data:')) {
      console.log('[FileSaver] 处理 base64 数据')
      const base64Data = imageUrl.split(',')[1]
      imageData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
    } else {
      console.log('[FileSaver] 从 URL 获取图片:', imageUrl)
      
      const response = await fetch(imageUrl, {
        mode: 'cors',
        credentials: 'omit',
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to fetch image: ${response.status} - ${errorText}`)
      }
      
      const blob = await response.blob()
      const arrayBuffer = await blob.arrayBuffer()
      imageData = new Uint8Array(arrayBuffer)
      console.log('[FileSaver] 图片数据大小:', imageData.length, 'bytes')
    }
    
    await writeFile(filePath, imageData)
    console.log('[FileSaver] 文件写入成功:', filePath)
    
    const thumbnailPath = await generateAndSaveThumbnail(filePath)
    
    return { 
      success: true, 
      path: filePath,
      thumbnailPath: thumbnailPath || undefined
    }
  } catch (error) {
    console.error('[FileSaver] 保存失败:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '保存失败' 
    }
  }
}

export async function saveNineGridImagesToTaskFolder(
  imageUrls: string[],
  taskPath: string,
  shotNumber: number | string
): Promise<{ success: boolean; paths?: string[]; error?: string }> {
  try {
    const targetDir = await join(taskPath, '九宫格')
    await ensureDir(targetDir)

    const savedPaths: string[] = []

    for (let i = 0; i < Math.min(9, imageUrls.length); i++) {
      const imageUrl = imageUrls[i]
      const fileName = `${shotNumber}+${i + 1}九宫格切图.png`
      const filePath = await join(targetDir, fileName)

      let imageData: Uint8Array

      if (imageUrl.startsWith('data:')) {
        const base64Data = imageUrl.split(',')[1]
        imageData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
      } else {
        const response = await fetch(imageUrl, {
          mode: 'cors',
          credentials: 'omit',
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`下载第${i + 1}张切图失败: ${response.status} - ${errorText}`)
        }

        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        imageData = new Uint8Array(arrayBuffer)
      }

      await writeFile(filePath, imageData)
      savedPaths.push(filePath)
    }

    return { success: true, paths: savedPaths }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '九宫格切图保存失败',
    }
  }
}

export async function saveVideoToTaskFolder(
  videoUrl: string,
  taskPath: string,
  shotNumber: number | string,
  timestamp: number,
  _cookie?: string
): Promise<SaveResult> {
  console.log('[FileSaver] 开始保存视频:', { videoUrl, taskPath, shotNumber, timestamp })
  
  try {
    console.log('[FileSaver] 尝试前端 fetch 下载...')
    
    try {
      const response = await fetch(videoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        mode: 'cors',
      })
      
      if (response.ok) {
        const blob = await response.blob()
        console.log('[FileSaver] fetch 成功，blob 大小:', blob.size)
        
        if (blob.size > 10000) {
          const videoDir = await join(taskPath, 'Video')
          await ensureDir(videoDir)
          
          // 扫描已有文件确定下一个序号
          let nextSeq = 1
          try {
            const fs = await import('@tauri-apps/plugin-fs')
            const entries = await fs.readDir(videoDir)
            const pattern = new RegExp(`^镜头${shotNumber}_Video_(\\d+)\\.mp4$`)
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
          
          const fileName = `镜头${shotNumber}_Video_${nextSeq}.mp4`
          const filePath = await join(videoDir, fileName)
          
          const arrayBuffer = await blob.arrayBuffer()
          const videoData = new Uint8Array(arrayBuffer)
          
          await writeFile(filePath, videoData)
          console.log('[FileSaver] 视频保存成功:', filePath)
          
          return { success: true, path: filePath }
        }
      }
    } catch (fetchError) {
      console.log('[FileSaver] 前端 fetch 失败:', fetchError)
    }
    
    console.log('[FileSaver] 尝试后端下载（不带请求头）...')
    
    const result = await invoke<{
      success: boolean
      path: string | null
      error: string | null
    }>('download_video_to_folder', {
      videoUrl: videoUrl,
      taskFolder: taskPath,
      shotNumber: Number(shotNumber),
      cookie: null,
    })

    console.log('[FileSaver] 后端下载结果:', result)

    if (result.success && result.path) {
      return { success: true, path: result.path }
    }
    
    return { 
      success: false, 
      error: result.error || '视频下载失败，已在浏览器中打开' 
    }
  } catch (error) {
    console.error('[FileSaver] 保存失败:', error)
    
    try {
      await open(videoUrl)
      return { 
        success: false, 
        error: '视频下载失败，已在浏览器中打开，请手动保存' 
      }
    } catch {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '保存失败' 
      }
    }
  }
}

export async function saveAudioToTaskFolder(
  audioUrl: string,
  taskPath: string,
  shotNumber: number | string,
  timestamp: number
): Promise<SaveResult> {
  console.log('[FileSaver] 开始保存音频:', { audioUrl, taskPath, shotNumber, timestamp })
  
  try {
    const audioDir = await join(taskPath, 'Voice')
    await ensureDir(audioDir)
    
    const fileName = `镜头${shotNumber}_Voice.mp3`
    const filePath = await join(audioDir, fileName)
    console.log('[FileSaver] 目标文件路径:', filePath)
    
    let audioData: Uint8Array
    
    if (audioUrl.startsWith('data:')) {
      console.log('[FileSaver] 处理 base64 数据')
      const base64Data = audioUrl.split(',')[1]
      audioData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
    } else {
      console.log('[FileSaver] 从 URL 获取音频:', audioUrl)
      
      const response = await fetch(audioUrl, {
        mode: 'cors',
        credentials: 'omit',
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to fetch audio: ${response.status} - ${errorText}`)
      }
      
      const blob = await response.blob()
      const arrayBuffer = await blob.arrayBuffer()
      audioData = new Uint8Array(arrayBuffer)
      console.log('[FileSaver] 音频数据大小:', audioData.length, 'bytes')
    }
    
    await writeFile(filePath, audioData)
    console.log('[FileSaver] 文件写入成功:', filePath)
    
    return { success: true, path: filePath }
  } catch (error) {
    console.error('[FileSaver] 保存失败:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '保存失败' 
    }
  }
}

export async function ensureVoiceFolder(taskPath: string): Promise<string> {
  const voiceDir = await join(taskPath, 'Voice')
  await ensureDir(voiceDir)
  return voiceDir
}
