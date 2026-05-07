import { invoke } from '@tauri-apps/api/core'
import { exists, mkdir } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'

export interface ExtractFrameResult {
  success: boolean
  imagePath?: string
  thumbnailPath?: string
  error?: string
}

interface RustExtractFrameResult {
  success: boolean
  image_path?: string
  thumbnail_path?: string
  error?: string
}

export class FrameExtractorService {
  async extractLastFrame(
    videoPath: string,
    outputPath: string,
    fileName: string
  ): Promise<ExtractFrameResult> {
    try {
      const outputDir = outputPath
      const dirExists = await exists(outputDir)
      if (!dirExists) {
        await mkdir(outputDir, { recursive: true })
      }

      const thumbnailDir = await join(outputDir, '.thumbnails')
      const thumbnailDirExists = await exists(thumbnailDir)
      if (!thumbnailDirExists) {
        await mkdir(thumbnailDir, { recursive: true })
      }

      const fullPath = await join(outputDir, `${fileName}.png`)
      const thumbnailPath = await join(thumbnailDir, `${fileName}_thumb.png`)

      console.log('[FrameExtractor] 调用后端抽帧:', {
        videoPath,
        outputPath: fullPath,
        thumbnailPath,
      })

      const result = await invoke<RustExtractFrameResult>('extract_last_frame', {
        videoPath,
        outputPath: fullPath,
        thumbnailPath,
      })

      console.log('[FrameExtractor] 后端返回结果:', result)

      return {
        success: result.success,
        imagePath: result.image_path,
        thumbnailPath: result.thumbnail_path,
        error: result.error,
      }
    } catch (error) {
      console.error('[FrameExtractor] 抽帧失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '抽帧失败',
      }
    }
  }

  async extractFrameAtTime(
    videoPath: string,
    outputPath: string,
    fileName: string,
    timeSeconds: number
  ): Promise<ExtractFrameResult> {
    try {
      const outputDir = outputPath
      const dirExists = await exists(outputDir)
      if (!dirExists) {
        await mkdir(outputDir, { recursive: true })
      }

      const thumbnailDir = await join(outputDir, '.thumbnails')
      const thumbnailDirExists = await exists(thumbnailDir)
      if (!thumbnailDirExists) {
        await mkdir(thumbnailDir, { recursive: true })
      }

      const fullPath = await join(outputDir, `${fileName}.png`)
      const thumbnailPath = await join(thumbnailDir, `${fileName}_thumb.png`)

      const result = await invoke<RustExtractFrameResult>('extract_frame_at_time', {
        videoPath,
        outputPath: fullPath,
        thumbnailPath,
        timeSeconds,
      })

      return {
        success: result.success,
        imagePath: result.image_path,
        thumbnailPath: result.thumbnail_path,
        error: result.error,
      }
    } catch (error) {
      console.error('[FrameExtractor] 抽帧失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '抽帧失败',
      }
    }
  }
}

export const frameExtractorService = new FrameExtractorService()
