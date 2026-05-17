import type { RunningHubApiMapping, ApiConfig } from '../types'

const RUNNINGHUB_BASE_URL = 'https://www.runninghub.cn/openapi/v2'

// 图片压缩工具函数
async function compressImage(
  fileData: Uint8Array,
  contentType: string,
  maxSizeBytes: number = 8 * 1024 * 1024 // 目标大小：8MB
): Promise<Uint8Array> {
  console.log('[RunningHub] 开始压缩图片，原始大小:', fileData.length, 'bytes')
  
  return new Promise((resolve, reject) => {
    try {
      // 创建 Blob 和 FileReader
      const blob = new Blob([fileData.buffer.slice(
        fileData.byteOffset,
        fileData.byteOffset + fileData.byteLength
      ) as ArrayBuffer], { type: contentType })
      
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          // 创建 Canvas
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')!
          
          // 设置 Canvas 尺寸（保持原始比例）
          canvas.width = img.width
          canvas.height = img.height
          
          // 绘制图片
          ctx.drawImage(img, 0, 0)
          
          // 逐步压缩直到小于目标大小
          let quality = 0.9
          let compressedBlob: Blob
          
          const compress = () => {
            canvas.toBlob((blob) => {
              if (!blob) {
                reject(new Error('压缩失败'))
                return
              }
              
              compressedBlob = blob
              
              if (compressedBlob.size <= maxSizeBytes || quality <= 0.1) {
                // 压缩完成
                const reader = new FileReader()
                reader.onload = () => {
                  const arrayBuffer = reader.result as ArrayBuffer
                  const result = new Uint8Array(arrayBuffer)
                  console.log('[RunningHub] 压缩完成，压缩后大小:', result.length, 'bytes')
                  resolve(result)
                }
                reader.readAsArrayBuffer(compressedBlob)
              } else {
                // 继续压缩
                quality -= 0.1
                compress()
              }
            }, 'image/jpeg', quality)
          }
          
          compress()
        }
        img.onerror = () => {
          reject(new Error('无法加载图片'))
        }
        img.src = e.target?.result as string
      }
      reader.onerror = () => {
        reject(new Error('无法读取图片文件'))
      }
      reader.readAsDataURL(blob)
    } catch (error) {
      reject(error)
    }
  })
}

export interface RunningHubTaskResult {
  success: boolean
  taskId?: string
  outputUrl?: string
  outputUrls?: string[]
  error?: string
  cancelled?: boolean
}

export interface RunningHubTaskStatus {
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'
  progress?: number
  outputUrl?: string
  outputUrls?: string[]
  errorMessage?: string
}

export interface UploadedImage {
  nodeId: string
  url: string
  fileName: string
}

export interface AccountStatus {
  success: boolean
  currentTaskCounts?: number
  remainCoins?: number  // RH币
  remainMoney?: number  // 余额（元）
  error?: string
}

export interface RunningHubAppInfo {
  success: boolean
  appId?: string
  appName?: string
  nodeInfoList?: {
    nodeId: string
    fieldName: string
    description: string
  }[]
  error?: string
}

export class RunningHubService {
  private apiKey: string
  private baseUrl: string

  constructor(config: ApiConfig) {
    this.apiKey = config.apiKey || ''
    const endpoint = config.endpoint || ''
    if (endpoint.includes('/openapi/v2')) {
      this.baseUrl = endpoint
    } else {
      this.baseUrl = RUNNINGHUB_BASE_URL
      console.warn('[RunningHub] 使用默认 endpoint:', RUNNINGHUB_BASE_URL)
    }
  }

  validateConfig(): { valid: boolean; error?: string } {
    if (!this.apiKey) {
      return { valid: false, error: 'API Key 未配置' }
    }
    return { valid: true }
  }

  async getAccountStatus(): Promise<AccountStatus> {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    const url = 'https://www.runninghub.cn/uc/openapi/accountStatus'

    try {
      console.log('[RunningHub] 获取账户状态...')
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Host': 'www.runninghub.cn',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apikey: this.apiKey,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[RunningHub] 获取账户状态失败:', errorText)
        return { 
          success: false, 
          error: `获取账户状态失败: ${response.status}` 
        }
      }

      const result = await response.json()
      console.log('[RunningHub] 账户状态结果:', result)

      if (result.code !== undefined && result.code !== 0) {
        return { 
          success: false, 
          error: result.message || result.msg || '获取账户状态失败' 
        }
      }

      return {
        success: true,
        currentTaskCounts: result.data?.currentTaskCounts ?? 0,
        remainCoins: result.data?.remainCoins,
        remainMoney: result.data?.remainMoney,
      }
    } catch (error) {
      console.error('[RunningHub] 获取账户状态异常:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '获取账户状态失败' 
      }
    }
  }

  async getAppInfo(appId: string): Promise<RunningHubAppInfo> {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    const endpoints = [
      { url: `${this.baseUrl}/app/detail`, method: 'POST', body: { appId } },
      { url: `${this.baseUrl}/ai-app/info/${appId}`, method: 'GET' },
      { url: `${this.baseUrl}/app/info/${appId}`, method: 'POST', body: {} },
    ]

    for (const endpoint of endpoints) {
      try {
        console.log(`[RunningHub] 尝试获取应用信息: ${endpoint.method} ${endpoint.url}`)
        
        const fetchOptions: RequestInit = {
          method: endpoint.method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
        
        if (endpoint.body) {
          fetchOptions.body = JSON.stringify(endpoint.body)
        }
        
        const response = await fetch(endpoint.url, fetchOptions)
        
        console.log(`[RunningHub] 响应状态: ${response.status}`)
        
        if (response.status === 404 || response.status === 405) {
          continue
        }
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error(`[RunningHub] 请求失败:`, errorText)
          continue
        }
        
        const result = await response.json()
        console.log('[RunningHub] 应用信息结果:', result)
        
        if (result.code !== undefined && result.code !== 0) {
          continue
        }
        
        const appData = result.data || result
        
        const nodeInfoList = (appData.nodeInfoList || appData.nodes || []).map((node: any) => ({
          nodeId: String(node.nodeId || node.id),
          fieldName: node.fieldName || node.name || '',
          description: node.description || node.fieldName || '',
        }))
        
        if (nodeInfoList.length > 0) {
          return {
            success: true,
            appId: appData.appId || appId,
            appName: appData.appName || appData.name || '',
            nodeInfoList,
          }
        }
      } catch (error) {
        console.error(`[RunningHub] 尝试失败:`, error)
        continue
      }
    }

    return { 
      success: false, 
      error: '无法获取应用节点信息，请手动配置。RunningHub 暂未公开获取应用信息的 API。' 
    }
  }

  async uploadImage(imageData: string): Promise<{ success: boolean; url?: string; fileName?: string; error?: string }> {
    if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
      console.log('[RunningHub] 输入已是URL，直接使用:', imageData)
      return {
        success: true,
        url: imageData,
        fileName: 'from_url.png',
      }
    }

    const url = `${this.baseUrl}/media/upload/binary`

    try {
      let filePath = imageData
      let fileExtension = 'png'
      let contentType = 'image/png'

      if (imageData.startsWith('asset://') || imageData.startsWith('asset:')) {
        filePath = imageData.replace('asset://', '').replace('asset:', '')
      } else if (!imageData.match(/^[A-Za-z]:[/\\]/) && !imageData.startsWith('/')) {
        console.log('[RunningHub] 输入非路径，视为 data URL 或 base64')
        const base64Data = imageData.startsWith('data:') ? imageData.split(',')[1] || imageData : imageData
        const byteCharacters = atob(base64Data)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], { type: 'image/png' })
        const formData = new FormData()
        formData.append('file', blob, 'image.png')

        console.log('[RunningHub] 上传图片到:', url)
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: formData,
        })

        console.log('[RunningHub] 上传响应状态:', response.status)
        const result = await response.json()
        console.log('[RunningHub] 上传响应结果:', result)

        if (result.code !== undefined && result.code !== 0) {
          return { success: false, error: result.message || result.msg || '上传失败' }
        }
        
        if (result.errorCode !== undefined) {
          return { success: false, error: result.errorMessage || result.message || '上传失败' }
        }

        return {
          success: true,
          url: result.data?.download_url,
          fileName: result.data?.fileName,
        }
      }

      const extMatch = filePath.match(/\.([a-zA-Z0-9]+)$/)
      if (extMatch) {
        fileExtension = extMatch[1].toLowerCase()
        const mimeTypes: Record<string, string> = {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'bmp': 'image/bmp',
        }
        contentType = mimeTypes[fileExtension] || 'image/png'
      }

      console.log('[RunningHub] 直接上传本地文件:', filePath)
      
      const { readFile } = await import('@tauri-apps/plugin-fs')
      let fileData: Uint8Array
      try {
        fileData = await readFile(filePath)
      } catch (readError) {
        console.error('[RunningHub] 读取文件失败:', readError)
        return { success: false, error: '文件不存在或无法访问：' + filePath }
      }
      
      const fileSizeKB = Math.round(fileData.length / 1024)
      console.log('[RunningHub] 文件大小:', fileSizeKB, 'KB, 文件扩展名:', fileExtension, 'Content-Type:', contentType)
      
      // 检查文件大小是否超过限制 (RunningHub 限制 10MB)
      if (fileData.length > 10 * 1024 * 1024) {
        console.log(`[RunningHub] 图片文件过大 (${fileSizeKB}KB)，超过 10MB 限制，尝试自动压缩...`)
        try {
          fileData = await compressImage(fileData, contentType, 8 * 1024 * 1024)
          const compressedSizeKB = Math.round(fileData.length / 1024)
          console.log(`[RunningHub] 图片压缩完成，压缩后大小: ${compressedSizeKB}KB`)
        } catch (compressError) {
          console.error('[RunningHub] 图片压缩失败:', compressError)
          return { success: false, error: `图片压缩失败: ${compressError instanceof Error ? compressError.message : '未知错误'}` }
        }
      }
      
      // 转换为 ArrayBuffer 以兼容 Blob 构造函数
      const arrayBuffer = fileData.buffer.slice(
        fileData.byteOffset,
        fileData.byteOffset + fileData.byteLength
      ) as ArrayBuffer
      const blob = new Blob([arrayBuffer], { type: contentType })
      const formData = new FormData()
      formData.append('file', blob, `image.${fileExtension}`)

      console.log('[RunningHub] 上传图片到:', url)
      console.log('[RunningHub] API Key 前缀:', this.apiKey.substring(0, 10) + '...')
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
      })

      console.log('[RunningHub] 上传响应状态:', response.status)
      console.log('[RunningHub] 响应头:', Object.fromEntries(response.headers.entries()))
      const result = await response.json()
      console.log('[RunningHub] 上传响应结果:', JSON.stringify(result, null, 2))

      if (result.code !== undefined && result.code !== 0) {
        return { success: false, error: result.message || result.msg || '上传失败' }
      }
      
      if (result.errorCode !== undefined) {
        return { success: false, error: result.errorMessage || result.message || '上传失败' }
      }

      return {
        success: true,
        url: result.data?.download_url,
        fileName: result.data?.fileName,
      }
    } catch (error) {
      console.error('[RunningHub] 上传异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '上传失败',
      }
    }
  }

  async uploadAudio(audioData: string, convertToWav: boolean = true): Promise<{ success: boolean; url?: string; fileName?: string; error?: string }> {
    if (audioData.startsWith('http://') || audioData.startsWith('https://')) {
      console.log('[RunningHub] 音频已是URL，直接使用:', audioData)
      return {
        success: true,
        url: audioData,
        fileName: 'from_url.wav',
      }
    }

    const url = `${this.baseUrl}/media/upload/binary`

    try {
      let filePath = audioData

      if (audioData.startsWith('asset://') || audioData.startsWith('asset:')) {
        filePath = audioData.replace('asset://', '').replace('asset:', '')
      }

      // 获取原始文件扩展名
      const extMatch = filePath.match(/\.([a-zA-Z0-9]+)$/)
      let originalExtension = 'wav'
      if (extMatch) {
        originalExtension = extMatch[1].toLowerCase()
      }

      console.log('[RunningHub] 直接上传本地音频文件:', filePath, '原始格式:', originalExtension)
      
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const fileData = await readFile(filePath)
      
      // TODO: 如果需要转换为 WAV 格式，这里需要调用音频转换服务
      // 目前先直接上传，后续添加转换逻辑
      let finalData = fileData
      let finalExtension = originalExtension
      let finalContentType = this.getAudioMimeType(originalExtension)
      
      if (convertToWav && originalExtension !== 'wav') {
        console.log(`[RunningHub] 需要将 ${originalExtension} 转换为 wav 格式`)
        finalExtension = 'wav'
        finalContentType = 'audio/wav'
      }
      
      console.log('[RunningHub] 音频文件大小:', fileData.length, 'bytes, 原始格式:', originalExtension, '最终格式:', finalExtension)
      
      // 转换为 ArrayBuffer 以兼容 Blob 构造函数
      const audioArrayBuffer = finalData.buffer.slice(
        finalData.byteOffset,
        finalData.byteOffset + finalData.byteLength
      ) as ArrayBuffer
      const blob = new Blob([audioArrayBuffer], { type: finalContentType })
      const formData = new FormData()
      formData.append('file', blob, `audio.${finalExtension}`)

      console.log('[RunningHub] 上传音频到:', url)
      console.log('[RunningHub] API Key 前缀:', this.apiKey.substring(0, 10) + '...')
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
      })

      console.log('[RunningHub] 音频上传响应状态:', response.status)
      console.log('[RunningHub] 音频响应头:', Object.fromEntries(response.headers.entries()))
      const result = await response.json()
      console.log('[RunningHub] 音频上传响应结果:', JSON.stringify(result, null, 2))

      if (result.code !== undefined && result.code !== 0) {
        return { success: false, error: result.message || result.msg || '音频上传失败' }
      }
      
      if (result.errorCode !== undefined) {
        return { success: false, error: result.errorMessage || result.message || '音频上传失败' }
      }

      return {
        success: true,
        url: result.data?.download_url,
        fileName: result.data?.fileName,
      }
    } catch (error) {
      console.error('[RunningHub] 音频上传异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '音频上传失败',
      }
    }
  }

  private getAudioMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'm4a': 'audio/mp4',
      'aac': 'audio/aac',
      'flac': 'audio/flac',
    }
    return mimeTypes[extension.toLowerCase()] || 'audio/wav'
  }

  async submitTask(
    mapping: RunningHubApiMapping,
    params: {
      images?: { nodeId: string; base64Data: string }[]
      text?: string
      aspectRatio?: string
      resolution?: string
      channel?: string
      duration?: number
    },
    onProgress?: (progress: number, message: string) => void
  ): Promise<RunningHubTaskResult> {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    const imageNodes = mapping.nodeInfoList.filter(node => node.fieldName === 'image')
    
    console.log('[RunningHub] 图片节点:', imageNodes.map(n => ({ nodeId: n.nodeId, fieldName: n.fieldName })))
    console.log('[RunningHub] 传入的图片:', params.images?.map(i => ({ nodeId: i.nodeId, hasData: !!i.base64Data })))
    
    const uploadedImages: UploadedImage[] = []

    if (params.images && params.images.length > 0) {
      onProgress?.(5, '上传参考图片...')

      const batchSize = 3
      for (let batchStart = 0; batchStart < params.images.length; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, params.images.length)
        const batch = params.images.slice(batchStart, batchEnd)

        onProgress?.(5 + (batchEnd / params.images.length) * 15, `上传图片 ${batchEnd}/${params.images.length}...`)

        const uploadPromises = batch.map(async (img) => {
          if (!img.base64Data) return null
          const uploadResult = await this.uploadImage(img.base64Data)
          if (!uploadResult.success) {
            throw new Error(`图片上传失败: ${uploadResult.error}`)
          }
          console.log(`[RunningHub] 图片上传成功:`, uploadResult.url)
          return {
            nodeId: img.nodeId,
            url: uploadResult.url!,
            fileName: uploadResult.fileName!,
          }
        })

        const batchResults = await Promise.all(uploadPromises)
        uploadedImages.push(...batchResults.filter((r): r is UploadedImage => r !== null))
      }
    }
    
    console.log('[RunningHub] 已上传的图片:', uploadedImages)
    
    const url = `${this.baseUrl}/run/ai-app/${mapping.appId}`
    
    const nodeInfoList = mapping.nodeInfoList.map((node) => {
      if (node.fieldName === 'image') {
        const uploadedImage = uploadedImages.find(img => img.nodeId === node.nodeId)
        const imageIndex = imageNodes.findIndex(n => n.nodeId === node.nodeId)
        
        const result: Record<string, string> = {
          nodeId: node.nodeId,
          fieldName: node.fieldName,
          fieldValue: uploadedImage?.url || '',
          description: node.description,
        }
        
        console.log(`[RunningHub] 图片节点 ${node.nodeId} 映射:`, {
          foundImage: !!uploadedImage,
          imageIndex,
          fieldValue: result.fieldValue,
        })
        
        return result
      }
      
      if (node.fieldName === 'Text' || node.fieldName === 'text' || node.fieldName === 'prompt') {
        return {
          nodeId: node.nodeId,
          fieldName: node.fieldName,
          fieldValue: params.text || '',
          description: node.description,
        }
      }
      
      if (node.fieldName === 'value' && params.duration !== undefined) {
        return {
          nodeId: node.nodeId,
          fieldName: node.fieldName,
          fieldValue: String(params.duration),
          description: node.description,
        }
      }
      
      if (node.fieldName === 'aspectRatio') {
        return {
          nodeId: node.nodeId,
          fieldName: node.fieldName,
          fieldData: '[[\"auto\", \"1:1\", \"2:3\", \"3:2\", \"3:4\", \"4:3\", \"4:5\", \"5:4\", \"9:16\", \"16:9\", \"21:9\"], {\"default\": \"4:3\"}]',
          fieldValue: params.aspectRatio || '9:16',
          description: node.description,
        }
      }
      
      if (node.fieldName === 'resolution') {
        return {
          nodeId: node.nodeId,
          fieldName: node.fieldName,
          fieldData: '[[\"1k\", \"2k\", \"4k\", \"8k (Official only)\"], {\"default\": \"2k\"}]',
          fieldValue: params.resolution || '2k',
          description: node.description,
        }
      }
      
      if (node.fieldName === 'channel') {
        return {
          nodeId: node.nodeId,
          fieldName: node.fieldName,
          fieldData: '[[\"Third-party\", \"Official\"], {\"default\": \"Third-party\"}]',
          fieldValue: params.channel || 'Third-party',
          description: node.description,
        }
      }
      
      return {
        nodeId: node.nodeId,
        fieldName: node.fieldName,
        fieldValue: '',
        description: node.description,
      }
    })

    const payload = {
      nodeInfoList,
      instanceType: 'default',
      usePersonalQueue: 'false',
    }

    try {
      console.log('[RunningHub] 请求URL:', url)
      console.log('[RunningHub] Payload:', JSON.stringify(payload, null, 2))
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      })

      console.log('[RunningHub] 响应状态:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[RunningHub] 错误响应:', errorText)
        
        if (response.status === 401) {
          return { 
            success: false, 
            error: 'API Key 认证失败，请检查：\n1. API Key 是否正确\n2. API Key 是否有效\n3. API Key 是否有访问该应用的权限' 
          }
        }
        
        return { success: false, error: `API 请求失败: ${response.status} - ${errorText}` }
      }

      const result = await response.json()
      console.log('[RunningHub] 响应结果:', result)
      
      if (result.errorCode) {
        return { 
          success: false, 
          error: `${result.errorMessage || '请求失败'} (错误码: ${result.errorCode})` 
        }
      }
      
      const taskId = result?.taskId

      if (!taskId) {
        console.error('[RunningHub] 未获取到 taskId, result:', result)
        return { success: false, error: '未获取到任务ID' }
      }

      console.log('[RunningHub] 任务提交成功, taskId:', taskId)
      return { success: true, taskId }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('ERR_NAME_NOT_RESOLVED')) {
        return { 
          success: false, 
          error: '网络连接失败，请检查：\n1. 网络是否正常连接\n2. DNS 解析是否正常\n3. 是否需要代理访问' 
        }
      }
      
      return { 
        success: false, 
        error: `请求失败: ${errorMessage}` 
      }
    }
  }

  async queryTaskStatus(taskId: string): Promise<RunningHubTaskStatus> {
    const url = `${this.baseUrl}/query`
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ taskId }),
      })

      if (!response.ok) {
        throw new Error(`查询失败: ${response.status}`)
      }

      const result = await response.json()
      console.log('[RunningHub] 查询任务状态结果:', result)
      
      let status: RunningHubTaskStatus['status'] = result.status || result.taskStatus
      
      // 检查状态是否有效
      const validStatuses: RunningHubTaskStatus['status'][] = ['QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED']
      if (!status || !validStatuses.includes(status)) {
        console.warn(`[RunningHub] 返回无效状态: ${status}，将触发重试`)
        throw new Error(`返回无效状态: ${status || 'undefined'}`)
      }
      
      if (result.status === 'CANCELLED' || 
          result.status === 'CANCELED' || 
          result.taskStatus === 'CANCELLED' ||
          result.taskStatus === 'CANCELED' ||
          result.code === '1003' ||
          result.errorCode === '1003') {
        status = 'CANCELLED'
        console.log('[RunningHub] 检测到任务已取消')
      }
      
      const errorMsg = result.errorMessage || result.msg || result.message || ''
      if (errorMsg.includes('Task not found') || 
          errorMsg.includes('任务不存在') ||
          errorMsg.includes('已过期') ||
          result.code === '1002' ||
          result.errorCode === '1002') {
        status = 'CANCELLED'
        console.log('[RunningHub] 检测到任务不存在或已过期，视为取消')
      }
      
      const outputUrlsFromResults = Array.isArray(result.results)
        ? result.results
          .map((item: any) => item?.url || item?.downloadUrl || item?.download_url)
          .filter((url: unknown): url is string => typeof url === 'string' && url.length > 0)
        : []

      const outputUrl = outputUrlsFromResults[0] ||
                      result.outputUrl ||
                      result.result?.url ||
                      result.url
      
      return {
        status,
        progress: result.progress ?? result.progressRate,
        outputUrl,
        outputUrls: outputUrlsFromResults.length > 0 ? outputUrlsFromResults : (outputUrl ? [outputUrl] : []),
        errorMessage: errorMsg,
      }
    } catch (error) {
      // 直接抛出错误，让外层 waitForCompletion 处理重试
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`查询请求失败: ${String(error)}`)
    }
  }

  async cancelTask(taskId: string): Promise<{ success: boolean; error?: string }> {
    const url = 'https://www.runninghub.cn/task/openapi/cancel'
    
    try {
      console.log('[RunningHub] 取消任务:', taskId)
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          apiKey: this.apiKey,
          taskId: taskId
        }),
      })
      
      console.log('[RunningHub] 取消任务响应状态:', response.status)
      
      const result = await response.json()
      console.log('[RunningHub] 取消任务结果:', result)
      
      if (response.ok && result.code === 0) {
        return { success: true }
      }
      
      return { 
        success: false, 
        error: result.message || result.msg || '取消任务失败' 
      }
    } catch (error) {
      console.error('[RunningHub] 取消任务异常:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '取消任务失败' 
      }
    }
  }

  async waitForCompletion(
    taskId: string,
    onProgress?: (progress: number, message: string) => void,
    pollInterval: number = 5000,
    maxWaitTime: number = 300000,
    checkCancelled?: () => boolean
  ): Promise<RunningHubTaskResult> {
    const startTime = Date.now()
    let isCancelled = false
    const MAX_RETRIES = 2
    let consecutiveErrors = 0
    
    const loop = async (): Promise<RunningHubTaskResult> => {
      if (Date.now() - startTime >= maxWaitTime) {
        return { success: false, error: '任务超时' }
      }
      
      if (checkCancelled?.()) {
        // 用户取消任务，调用 API 取消后台任务
        if (!isCancelled) {
          isCancelled = true
          console.log(`[RunningHub] 检测到取消请求，正在取消任务: ${taskId}`)
          const cancelResult = await this.cancelTask(taskId)
          if (cancelResult.success) {
            console.log(`[RunningHub] 任务 ${taskId} 已成功取消`)
          } else {
            console.warn(`[RunningHub] 任务 ${taskId} 取消失败:`, cancelResult.error)
          }
        }
        return { 
          success: false, 
          cancelled: true,
          error: '任务已取消' 
        }
      }
      
      try {
        const status = await this.queryTaskStatus(taskId)
        
        // 查询成功，重置错误计数
        consecutiveErrors = 0
        
        if (status.status === 'SUCCESS') {
          return { 
            success: true, 
            outputUrl: status.outputUrl,
            outputUrls: status.outputUrls,
          }
        }
        
        if (status.status === 'FAILED') {
          return { 
            success: false, 
            error: status.errorMessage || '任务执行失败' 
          }
        }
        
        if (status.status === 'CANCELLED') {
          return { 
            success: false, 
            cancelled: true,
            error: '任务已取消' 
          }
        }
        
        if (onProgress) {
          const progress = status.progress || 0
          const message = status.status === 'RUNNING' ? '正在处理...' : '等待处理...'
          onProgress(progress, message)
        }
      } catch (error) {
        consecutiveErrors++
        const errorMessage = error instanceof Error ? error.message : String(error)
        
        console.error(`[RunningHub] 查询任务状态失败 (第${consecutiveErrors}次):`, errorMessage)
        
        // 检查是否是网络错误
        const isNetworkError = errorMessage.includes('Failed to fetch') || 
                               errorMessage.includes('NetworkError') ||
                               errorMessage.includes('network') ||
                               errorMessage.includes('fetch')
        
        if (consecutiveErrors >= MAX_RETRIES) {
          console.error(`[RunningHub] 已连续失败 ${consecutiveErrors} 次，停止重试`)
          return { 
            success: false, 
            error: `查询任务状态失败: ${errorMessage}（已重试 ${MAX_RETRIES} 次，后台任务可能仍在运行，请稍后手动刷新查看结果）` 
          }
        }
        
        // 显示重试提示
        if (onProgress) {
          const retryMessage = isNetworkError 
            ? `网络连接异常，正在重试 (${consecutiveErrors}/${MAX_RETRIES})...`
            : `查询状态失败，正在重试 (${consecutiveErrors}/${MAX_RETRIES})...`
          onProgress(0, retryMessage)
        }
        
        console.log(`[RunningHub] 将在 ${pollInterval}ms 后进行第 ${consecutiveErrors + 1} 次重试...`)
      }
      
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(loop())
        }, pollInterval)
      })
    }
    
    return loop()
  }

  async generateImage(
    mapping: RunningHubApiMapping,
    params: {
      images?: { nodeId: string; base64Data: string }[]
      text?: string
      aspectRatio?: string
      resolution?: string
    },
    onProgress?: (progress: number, message: string) => void,
    checkCancelled?: () => boolean,
    onTaskSubmitted?: (taskId: string) => void
  ): Promise<RunningHubTaskResult> {
    const submitResult = await this.submitTask(mapping, {
      ...params,
      channel: 'Third-party',
    }, onProgress)
    
    if (!submitResult.success) {
      return submitResult
    }
    
    onTaskSubmitted?.(submitResult.taskId!)
    
    return this.waitForCompletion(submitResult.taskId!, onProgress, 5000, 600000, checkCancelled)
  }

  async generateVideo(
    mapping: RunningHubApiMapping,
    params: {
      firstFrame?: { nodeId: string; base64Data: string }
      lastFrame?: { nodeId: string; base64Data: string }
      text?: string
      duration?: number
    },
    onProgress?: (progress: number, message: string) => void,
    checkCancelled?: () => boolean,
    onTaskSubmitted?: (taskId: string) => void
  ): Promise<RunningHubTaskResult> {
    const images: { nodeId: string; base64Data: string }[] = []
    
    if (params.firstFrame) {
      images.push(params.firstFrame)
    }
    if (params.lastFrame) {
      images.push(params.lastFrame)
    }
    
    const submitResult = await this.submitTask(mapping, {
      images: images.length > 0 ? images : undefined,
      text: params.text,
      duration: params.duration,
    }, onProgress)
    
    if (!submitResult.success) {
      return submitResult
    }
    
    onTaskSubmitted?.(submitResult.taskId!)
    
    return this.waitForCompletion(submitResult.taskId!, onProgress, 5000, 600000, checkCancelled)
  }

  async upscaleVideo(
    videoUrl: string,
    targetResolution: string
  ): Promise<{ success: boolean; taskId?: string; error?: string }> {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    const url = `${this.baseUrl}/rhart-video/video-upscaler`

    try {
      console.log('[RunningHub] 提交视频超分任务:', { videoUrl: videoUrl.substring(0, 80) + '...', targetResolution })

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          videoUrl,
          targetResolution,
        }),
      })

      console.log('[RunningHub] 超分响应状态:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[RunningHub] 超分错误响应:', errorText)

        if (response.status === 401) {
          return { success: false, error: 'RunningHub API Key 认证失败' }
        }
        if (response.status === 412) {
          return { success: false, error: 'RunningHub Token 无效，请检查 API Key' }
        }

        return { success: false, error: `请求失败: ${response.status}` }
      }

      const result = await response.json()
      console.log('[RunningHub] 超分响应结果:', result)

      if (result.code !== undefined && result.code !== 0) {
        return { success: false, error: result.message || result.msg || '提交超分任务失败' }
      }

      const taskId = result.data?.taskId || result.taskId

      if (!taskId) {
        console.error('[RunningHub] 超分未获取到taskId, result:', result)
        return { success: false, error: '未获取到任务ID' }
      }

      console.log('[RunningHub] 超分任务提交成功, taskId:', taskId)
      return { success: true, taskId }
    } catch (error) {
      console.error('[RunningHub] 超分请求异常:', error)
      return { success: false, error: error instanceof Error ? error.message : '提交超分任务失败' }
    }
  }

  async upscaleVideoAndWait(
    videoUrl: string,
    targetResolution: string,
    onProgress?: (progress: number, message: string) => void,
    checkCancelled?: () => boolean
  ): Promise<RunningHubTaskResult> {
    const submitResult = await this.upscaleVideo(videoUrl, targetResolution)

    if (!submitResult.success || !submitResult.taskId) {
      return { success: false, error: submitResult.error || '提交超分任务失败' }
    }

    return this.waitForCompletion(submitResult.taskId!, onProgress, 5000, 600000, checkCancelled)
  }

  async submitViewAngleTask(
    mapping: RunningHubApiMapping,
    params: {
      image: string
      horizontalAngle: number
      verticalAngle: number
      zoom: number
    }
  ): Promise<{ success: boolean; taskId?: string; error?: string }> {
    const imageNode = mapping.nodeInfoList.find(node => node.fieldName === 'image')

    if (!imageNode) {
      return { success: false, error: '映射配置缺少图片节点' }
    }

    const uploadResult = await this.uploadImage(params.image)
    if (!uploadResult.success) {
      return { success: false, error: uploadResult.error || '图片上传失败' }
    }

    const nodeInfoList = mapping.nodeInfoList.map(node => {
      if (node.fieldName === 'image') {
        return {
          nodeId: node.nodeId,
          fieldName: node.fieldName,
          fieldValue: uploadResult.url,
          description: node.description,
        }
      }
      if (node.fieldName === 'horizontal_angle') {
        return {
          nodeId: node.nodeId,
          fieldName: node.fieldName,
          fieldValue: String(params.horizontalAngle),
          description: node.description,
        }
      }
      if (node.fieldName === 'vertical_angle') {
        return {
          nodeId: node.nodeId,
          fieldName: node.fieldName,
          fieldValue: String(params.verticalAngle),
          description: node.description,
        }
      }
      if (node.fieldName === 'zoom') {
        return {
          nodeId: node.nodeId,
          fieldName: node.fieldName,
          fieldValue: String(params.zoom),
          description: node.description,
        }
      }
      return {
        nodeId: node.nodeId,
        fieldName: node.fieldName,
        fieldValue: '',
        description: node.description,
      }
    })

    const url = `${this.baseUrl}/run/ai-app/${mapping.appId}`
    const payload = {
      nodeInfoList,
      instanceType: 'default',
      usePersonalQueue: 'false',
    }

    try {
      console.log('[RunningHub] 视角转换任务提交:', JSON.stringify(payload, null, 2))
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      })

      console.log('[RunningHub] 视角转换响应状态:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[RunningHub] 视角转换错误响应:', errorText)
        return { success: false, error: `API请求失败: ${response.status} - ${errorText}` }
      }

      const result = await response.json()
      console.log('[RunningHub] 视角转换响应结果:', result)
      
      // 尝试从多个可能的位置提取taskId
      const taskId = result.taskId || result.data?.taskId || result.data?.TaskId || result.TaskId

      if (!taskId) {
        console.error('[RunningHub] 视角转换未获取到taskId, result:', result)
        return { success: false, error: `未获取到任务ID，响应内容: ${JSON.stringify(result)}` }
      }

      console.log('[RunningHub] 视角转换任务提交成功, taskId:', taskId)
      return { success: true, taskId }
    } catch (error) {
      console.error('[RunningHub] 视角转换请求异常:', error)
      return { success: false, error: `请求失败: ${error instanceof Error ? error.message : '未知错误'}` }
    }
  }
}

export default RunningHubService
