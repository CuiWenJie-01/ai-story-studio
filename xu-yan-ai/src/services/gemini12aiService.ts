import type { ApiConfig } from '../types'

export interface GeminiImageResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        inlineData?: {
          mimeType: string
          data: string
        }
        text?: string
      }>
      role: string
    }
    finishReason: string
  }>
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

export interface GeminiGenerateOptions {
  prompt: string
  aspectRatio?: string
  imageSize?: string
  referenceImage?: string
  referenceImages?: string[]  // 支持多张参考图片
}

export class Gemini12AIService {
  private config: ApiConfig

  constructor(config: ApiConfig) {
    this.config = config
  }

  private getEndpoint(): string {
    const baseEndpoint = this.config.endpoint || 'https://cdn.12ai.org'
    const model = this.config.model || 'gemini-3.1-flash-image-preview'
    return `${baseEndpoint}/v1beta/models/${model}:generateContent`
  }

  async generateImage(options: GeminiGenerateOptions): Promise<{
    success: boolean
    imageData?: string
    mimeType?: string
    error?: string
  }> {
    const { prompt, aspectRatio = '16:9', imageSize = '1K', referenceImage, referenceImages } = options

    if (!this.config.apiKey) {
      return { success: false, error: '请先配置 API Key' }
    }

    try {
      const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = []

      // 根据文档，应该先放 text，再放 inline_data
      parts.push({ text: prompt })

      // 处理多张参考图片
      const allReferenceImages = referenceImages || (referenceImage ? [referenceImage] : [])
      
      for (let i = 0; i < allReferenceImages.length; i++) {
        const refImage = allReferenceImages[i]
        const base64Data = refImage.includes(',') 
          ? refImage.split(',')[1] 
          : refImage
        const mimeType = refImage.includes('data:') 
          ? refImage.split(';')[0].split(':')[1] 
          : 'image/png'
        
        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: base64Data,
          },
        })
        console.log(`[Gemini12AI] 参考图片 ${i + 1} 已添加, MIME: ${mimeType}, 数据大小: ${base64Data.length} bytes`)
      }

      const body: {
        contents: Array<{ parts: typeof parts }>
        generationConfig: {
          responseModalities: string[]
          imageConfig?: {
            aspectRatio: string
            imageSize?: string
          }
        }
      } = {
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            aspectRatio,
          },
        },
      }

      if (this.config.model?.includes('3')) {
        // gemini-3.1-flash-image-preview 只支持 512px 和 1K
        // gemini-3-pro-image-preview 支持 1K、2K、4K
        const model = this.config.model || ''
        const isFlash = model.includes('flash')
        
        if (isFlash && (imageSize === '2K' || imageSize === '4K')) {
          console.warn(`[Gemini12AI] Flash 模型不支持 ${imageSize}，降级为 1K`)
          body.generationConfig.imageConfig!.imageSize = '1K'
        } else {
          body.generationConfig.imageConfig!.imageSize = imageSize
        }
      }

      console.log('[Gemini12AI] 请求体:', JSON.stringify({
        model: this.config.model,
        aspectRatio,
        imageSize: body.generationConfig.imageConfig!.imageSize,
        referenceImageCount: allReferenceImages.length,
        promptLength: prompt.length,
      }, null, 2))

      const response = await fetch(`${this.getEndpoint()}?key=${this.config.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Gemini12AI] API Error:', errorText)
        return { 
          success: false, 
          error: `API 请求失败: ${response.status} ${response.statusText}` 
        }
      }

      const data: GeminiImageResponse = await response.json()

      if (!data.candidates || data.candidates.length === 0) {
        return { success: false, error: '未返回生成结果' }
      }

      const candidate = data.candidates[0]
      if (candidate.finishReason === 'SAFETY') {
        return { success: false, error: '内容被安全过滤器拦截，请修改提示词' }
      }

      const imagePart = candidate.content.parts.find(p => p.inlineData)
      if (!imagePart?.inlineData) {
        const textPart = candidate.content.parts.find(p => p.text)
        return { 
          success: false, 
          error: textPart?.text || '未返回图片数据' 
        }
      }

      return {
        success: true,
        imageData: imagePart.inlineData.data,
        mimeType: imagePart.inlineData.mimeType,
      }
    } catch (error) {
      console.error('[Gemini12AI] Generate error:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '生成失败' 
      }
    }
  }
}
