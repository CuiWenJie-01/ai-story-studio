import type { ApiConfig } from '../types'

export interface YunwuImageResponse {
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

export interface YunwuImageGenerateOptions {
  prompt: string
  aspectRatio?: string
  imageSize?: string
  referenceImages?: string[]
}

export class YunwuImageService {
  private config: ApiConfig

  constructor(config: ApiConfig) {
    this.config = config
  }

  private getEndpoint(): string {
    const model = this.config.model || 'gemini-3.1-flash-image-preview'
    
    if (model.startsWith('gpt-image-2')) {
      // gpt-image-2 使用代理路径避免 CORS
      return '/api/yunwu/v1/images/generations'
    }
    
    // Gemini 模型使用用户配置的端点
    const baseEndpoint = this.config.endpoint || 'https://yunwu.ai'
    return `${baseEndpoint}/v1beta/models/${model}:generateContent`
  }

  private getSizeForGptImage2(_imageSize: string, aspectRatio: string): string {
    // 云雾 gpt-image-2 支持的尺寸: 1024x1024, 1536x1024(横版), 1024x1536(竖版), auto
    if (aspectRatio === '16:9' || aspectRatio === '3:2') {
      return '1536x1024'
    }
    if (aspectRatio === '9:16' || aspectRatio === '2:3') {
      return '1024x1536'
    }
    // 1:1 或其他比例
    return '1024x1024'
  }

  async generateImage(options: YunwuImageGenerateOptions): Promise<{
    success: boolean
    imageData?: string
    mimeType?: string
    error?: string
  }> {
    const { prompt, aspectRatio = '16:9', imageSize = '1K', referenceImages } = options

    if (!this.config.apiKey) {
      return { success: false, error: '请先配置 API Key' }
    }

    try {
      const model = this.config.model || ''
      const isGptImage2 = model.startsWith('gpt-image-2')
      
      // 自动重试机制，最多重试 2 次
      let lastError = ''
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[YunwuImage] 第 ${attempt + 1} 次重试...`)
            await new Promise(r => setTimeout(r, 2000 * attempt)) // 递增等待
          }

          let response: Response
          let requestBody: string
          const endpoint = this.getEndpoint()
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          }
          
          // 为 gpt-image-2 模型使用 Authorization 头
          if (isGptImage2) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`
            console.log('[YunwuImage] 使用 gpt-image-2 模型，Authorization 头已设置')
          }

          if (isGptImage2) {
            // gpt-image-2 模型的请求体格式
            let enhancedPrompt = prompt
            if (referenceImages && referenceImages.length > 0) {
              // 强制保持参考图片的风格，防止模型自由发挥
              enhancedPrompt = `严格按照参考图片的真实摄影风格和质感生成，保持相同的画风、光影、色彩调性、写实程度。不要改变为动漫、漫画、插画、卡通等风格。\n\n${prompt}`
              console.log('[YunwuImage] 已添加风格保持指令')
            }

            const body: any = {
              model: model,
              prompt: enhancedPrompt,
              n: 1,
              size: this.getSizeForGptImage2(imageSize, aspectRatio),
            }

            // 云雾 gpt-image-2-all 的 image 字段需要 URL，不支持 base64
            // 如果有参考图片且为 URL 格式，才添加到请求体
            if (referenceImages && referenceImages.length > 0) {
              const imageUrls = referenceImages.filter(img => 
                img.startsWith('http://') || img.startsWith('https://')
              )
              if (imageUrls.length > 0) {
                body.image = imageUrls
              }
            }

            console.log('[YunwuImage] 请求体 (gpt-image-2):', JSON.stringify(body, null, 2))
            console.log('[YunwuImage] 请求端点:', endpoint)
            console.log('[YunwuImage] 请求头:', JSON.stringify(headers, null, 2))

            requestBody = JSON.stringify(body)
          } else {
            // 原有的 Gemini 模型请求体逻辑
            const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = []

            let enhancedPrompt = prompt
            if (referenceImages && referenceImages.length > 0) {
              // 强制保持参考图片的风格，防止模型自由发挥
              enhancedPrompt = `严格按照参考图片的真实摄影风格和质感生成，保持相同的画风、光影、色彩调性、写实程度。不要改变为动漫、漫画、插画、卡通等风格。\n\n${prompt}`
              console.log('[YunwuImage] 已添加风格保持指令')
            }

            parts.push({ text: enhancedPrompt })

            if (referenceImages && referenceImages.length > 0) {
              for (let i = 0; i < referenceImages.length; i++) {
                const refImage = referenceImages[i]
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
                console.log(`[YunwuImage] 参考图片 ${i + 1} 已添加, MIME: ${mimeType}, 数据大小: ${base64Data.length} bytes`)
              }
            }

            const body: {
              contents: Array<{ parts: typeof parts }>
              generationConfig: {
                responseModalities: string[]
                imageConfig?: {
                  aspectRatio: string
                  imageSize?: string
                }
                temperature?: number
              }
            } = {
              contents: [{ parts }],
              generationConfig: {
                responseModalities: ['IMAGE'],
                imageConfig: {
                  aspectRatio,
                },
                // 降低 temperature 让模型更忠实于参考图片，减少创意发挥
                temperature: referenceImages && referenceImages.length > 0 ? 0.7 : 1.0,
              },
            }

            const isFlash = model.includes('flash')
            
            if (isFlash && (imageSize === '2K' || imageSize === '4K')) {
              console.warn(`[YunwuImage] Flash 模型不支持 ${imageSize}，降级为 1K`)
              body.generationConfig.imageConfig!.imageSize = '1K'
            } else {
              body.generationConfig.imageConfig!.imageSize = imageSize
            }

            console.log('[YunwuImage] 请求体 (Gemini):', JSON.stringify({
              model: this.config.model,
              aspectRatio,
              imageSize: body.generationConfig.imageConfig!.imageSize,
              referenceImageCount: referenceImages?.length || 0,
              promptLength: prompt.length,
            }, null, 2))

            requestBody = JSON.stringify(body)
          }

          // 根据模型类型构建请求URL和头
          let finalEndpoint = endpoint
          if (!isGptImage2) {
            // 对于 Gemini 模型，继续使用 URL 参数传递 API Key
            finalEndpoint = `${endpoint}?key=${this.config.apiKey}`
          }
          
          response = await fetch(finalEndpoint, {
            method: 'POST',
            headers: headers,
            body: requestBody,
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error('[YunwuImage] API Error:', errorText)
            lastError = `API 请求失败: ${response.status} ${response.statusText}`
            // HTTP 错误不重试（如 401、403、429 等）
            if (response.status >= 400 && response.status < 500) {
              return { success: false, error: lastError }
            }
            continue // 5xx 错误重试
          }

          if (isGptImage2) {
            // gpt-image-2 响应格式
            const data: {
              created: number
              data: Array<{
                revised_prompt?: string
                url?: string
                b64_json?: string
              }>
            } = await response.json()
            
            if (!data.data || data.data.length === 0) {
              return { success: false, error: '未返回生成结果' }
            }
            
            const imageResult = data.data[0]
            
            // 优先处理 b64_json 格式
            if (imageResult.b64_json) {
              if (attempt > 0) {
                console.log(`[YunwuImage] 第 ${attempt + 1} 次重试成功`)
              }
              return {
                success: true,
                imageData: imageResult.b64_json,
                mimeType: 'image/png',
              }
            }
            
            // 处理 URL 格式
            const imageUrl = imageResult.url
            if (!imageUrl) {
              return { success: false, error: '未返回图片数据' }
            }
            
            // 下载图片并转换为 base64
            const imageResponse = await fetch(imageUrl)
            const blob = await imageResponse.blob()
            
            return new Promise((resolve) => {
              const reader = new FileReader()
              reader.onloadend = () => {
                const base64Data = reader.result as string
                const imageData = base64Data.split(',')[1]
                const mimeType = blob.type
                
                if (attempt > 0) {
                  console.log(`[YunwuImage] 第 ${attempt + 1} 次重试成功`)
                }
                
                resolve({
                  success: true,
                  imageData,
                  mimeType
                })
              }
              reader.readAsDataURL(blob)
            })
          } else {
            // 原有的 Gemini 响应处理逻辑
            const data: YunwuImageResponse = await response.json()

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

            if (attempt > 0) {
              console.log(`[YunwuImage] 第 ${attempt + 1} 次重试成功`)
            }

            return {
              success: true,
              imageData: imagePart.inlineData.data,
              mimeType: imagePart.inlineData.mimeType,
            }
          }
        } catch (fetchError) {
          lastError = fetchError instanceof Error ? fetchError.message : '网络请求失败'
          console.warn(`[YunwuImage] 请求失败 (第 ${attempt + 1} 次): ${lastError}`)
          // 网络错误（Failed to fetch / ERR_CONNECTION_CLOSED）继续重试
        }
      }

      return { success: false, error: `多次重试后仍然失败: ${lastError}` }
    } catch (error) {
      console.error('[YunwuImage] Generate error:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '生成失败' 
      }
    }
  }
}
