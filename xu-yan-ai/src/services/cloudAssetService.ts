import { invoke } from '@tauri-apps/api/core'
import { TosService } from './jimengService'
import type { CloudAssetLibrary, CloudAsset, AssetLibraryType } from '../types'
import type { TosConfig } from './jimengService'
import {
  getLibrariesFromCache,
  saveLibrariesToCache,
  getAssetsFromCache,
  saveAssetsToCache,
  isLibrariesCacheExpired,
  isAssetsCacheExpired,
  clearAllLibraryCaches,
  removeAssetFromCache,
} from '../utils/libraryCacheManager'

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']
const OTHER_EXTENSIONS = [...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS]

// 定义回调函数类型
type LibrariesUpdateCallback = (libraries: CloudAssetLibrary[]) => void
type AssetsUpdateCallback = (assets: CloudAsset[]) => void

export class CloudAssetService {
  private tosService: TosService | null = null
  private accountId: string

  constructor(tosConfig: TosConfig, accountId: string) {
    this.accountId = accountId
    if (tosConfig?.bucket) {
      this.tosService = new TosService(tosConfig)
    }
  }

  private getLibraryPrefix(libraryName: string): string {
    return `asset-libraries/${this.accountId}/${libraryName}`
  }

  private async createTosFolderStructure(libraryName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.tosService) {
      return { success: false, error: 'TOS 未配置' }
    }

    const folderTypes: AssetLibraryType[] = ['characters', 'scenes', 'props', 'others']
    
    for (const type of folderTypes) {
      const objectKey = `${this.getLibraryPrefix(libraryName)}/${type}/.folder`
      
      try {
        // 使用 uploadBase64 上传空内容，与对口型上传方式一致
        const result = await this.tosService.uploadBase64(
          '',  // 空字符串的 base64
          objectKey,
          'text/plain'
        )
        
        if (!result.success) {
          console.error(`[CloudAsset] 创建文件夹失败: ${type}`, result.error)
          return { success: false, error: `创建${type}文件夹失败: ${result.error}` }
        }
        
        console.log(`[CloudAsset] 创建文件夹成功: ${type}`)
      } catch (error) {
        console.error(`[CloudAsset] 创建文件夹异常: ${type}`, error)
        return { success: false, error: `创建${type}文件夹异常` }
      }
    }
    
    return { success: true }
  }

  async createLibrary(name: string): Promise<{
    success: boolean
    library?: CloudAssetLibrary
    error?: string
  }> {
    try {
      const library: CloudAssetLibrary = {
        id: name,
        name: name,
        account_id: this.accountId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      const folderResult = await this.createTosFolderStructure(name)
      if (!folderResult.success) {
        return { success: false, error: folderResult.error || '创建TOS文件夹结构失败' }
      }

      const result = await invoke<{
        success: boolean
        error: string | null
      }>('cloud_asset_save_library', {
        accountId: this.accountId,
        libraryJson: JSON.stringify(library),
      })

      if (!result.success) {
        return { success: false, error: result.error ?? '创建资产库失败' }
      }

      // 清除缓存，确保新创建的资产库能立即显示
      clearAllLibraryCaches()

      return { success: true, library }
    } catch (error) {
      console.error('[CloudAsset] 创建资产库异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '创建资产库失败',
      }
    }
  }

  async listLibraries(
    onUpdate?: LibrariesUpdateCallback,
    forceRefresh: boolean = false
  ): Promise<{
    success: boolean
    libraries?: CloudAssetLibrary[]
    error?: string
    fromCache?: boolean
  }> {
    if (!this.tosService) {
      return { success: false, error: 'TOS 未配置' }
    }

    // 如果强制刷新，跳过缓存
    if (forceRefresh) {
      console.log('[CloudAsset] 强制刷新，跳过缓存')
      clearAllLibraryCaches()
      return this.fetchLibrariesFromServer()
    }

    // 首先尝试从缓存获取
    const cachedLibraries = getLibrariesFromCache()
    const cacheExpired = isLibrariesCacheExpired()

    // 如果有缓存且未过期，直接返回缓存数据
    if (cachedLibraries && !cacheExpired) {
      console.log('[CloudAsset] 返回缓存的资产库列表')
      return { success: true, libraries: cachedLibraries, fromCache: true }
    }

    // 如果有缓存但已过期，先返回缓存数据，后台刷新
    if (cachedLibraries && cacheExpired && onUpdate) {
      console.log('[CloudAsset] 返回过期缓存，后台刷新')
      // 后台刷新
      this.refreshLibrariesInBackground(onUpdate)
      return { success: true, libraries: cachedLibraries, fromCache: true }
    }

    // 没有缓存，直接从服务器获取
    return this.fetchLibrariesFromServer()
  }

  // 后台刷新资产库列表
  private async refreshLibrariesInBackground(onUpdate: LibrariesUpdateCallback): Promise<void> {
    try {
      const result = await this.fetchLibrariesFromServer()
      if (result.success && result.libraries) {
        onUpdate(result.libraries)
      }
    } catch (error) {
      console.error('[CloudAsset] 后台刷新资产库列表失败:', error)
    }
  }

  // 从服务器获取资产库列表
  private async fetchLibrariesFromServer(): Promise<{
    success: boolean
    libraries?: CloudAssetLibrary[]
    error?: string
    fromCache?: boolean
  }> {
    try {
      console.log('[CloudAsset] 从TOS扫描资产库列表')

      const prefix = `asset-libraries/${this.accountId}/`
      const result = await this.tosService!.listObjects(prefix)

      if (!result.success) {
        return { success: false, error: result.error }
      }

      const libraryNames = new Set<string>()

      console.log('[CloudAsset] 开始解析对象，prefix:', prefix)
      console.log('[CloudAsset] 对象数量:', result.objects?.length || 0)

      for (const obj of result.objects || []) {
        const relativePath = obj.key.substring(prefix.length)
        const parts = relativePath.split('/')

        console.log(`[CloudAsset] 处理对象: key=${obj.key}, relativePath=${relativePath}, parts=${JSON.stringify(parts)}`)

        if (parts.length > 0 && parts[0]) {
          libraryNames.add(parts[0])
          console.log(`[CloudAsset] 添加资产库: ${parts[0]}`)
        }
      }

      console.log('[CloudAsset] 发现的资产库名称:', Array.from(libraryNames))

      const libraries: CloudAssetLibrary[] = Array.from(libraryNames).map(folderName => ({
        id: folderName,
        name: folderName,
        account_id: this.accountId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }))

      libraries.sort((a, b) => b.createdAt - a.createdAt)

      // 保存到缓存
      saveLibrariesToCache(libraries)

      console.log(`[CloudAsset] 扫描到 ${libraries.length} 个资产库:`, libraries.map(l => l.name))
      return { success: true, libraries, fromCache: false }
    } catch (error) {
      console.error('[CloudAsset] 获取资产库列表异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取资产库列表失败',
      }
    }
  }

  async deleteLibrary(libraryId: string, libraryName: string): Promise<{
    success: boolean
    error?: string
  }> {
    if (!this.tosService) {
      return { success: false, error: 'TOS 未配置' }
    }

    try {
      console.log(`[CloudAsset] 删除资产库: ${libraryName} (${libraryId})`)

      const prefix = this.getLibraryPrefix(libraryName)
      const listResult = await this.tosService.listObjects(prefix)

      if (!listResult.success) {
        return { success: false, error: `列出资产库文件失败: ${listResult.error}` }
      }

      const objects = listResult.objects || []
      console.log(`[CloudAsset] 发现 ${objects.length} 个对象需要删除`)

      let deletedCount = 0
      let failedCount = 0

      for (const obj of objects) {
        const deleteResult = await this.tosService.deleteObject(obj.key)
        if (deleteResult.success) {
          deletedCount++
        } else {
          failedCount++
          console.error(`[CloudAsset] 删除对象失败: ${obj.key}`, deleteResult.error)
        }
      }

      console.log(`[CloudAsset] 删除完成: 成功 ${deletedCount} 个, 失败 ${failedCount} 个`)

      const result = await invoke<{
        success: boolean
        error: string | null
      }>('cloud_asset_delete_library', {
        accountId: this.accountId,
        libraryId: libraryId,
      })

      if (!result.success) {
        return { success: false, error: result.error ?? '删除资产库记录失败' }
      }

      return { success: true }
    } catch (error) {
      console.error('[CloudAsset] 删除资产库异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除资产库失败',
      }
    }
  }

  async listAssets(
    libraryName: string,
    type: AssetLibraryType,
    onUpdate?: AssetsUpdateCallback,
    forceRefresh: boolean = false
  ): Promise<{
    success: boolean
    assets?: CloudAsset[]
    error?: string
    fromCache?: boolean
  }> {
    if (!this.tosService) {
      return { success: false, error: 'TOS 未配置' }
    }

    const libraryId = libraryName

    // 如果强制刷新，跳过缓存
    if (forceRefresh) {
      console.log('[CloudAsset] 强制刷新资产列表，跳过缓存')
      return this.fetchAssetsFromServer(libraryName, type)
    }

    // 首先尝试从缓存获取
    const cachedAssets = getAssetsFromCache(libraryId, type)
    const cacheExpired = isAssetsCacheExpired(libraryId, type)

    // 如果有缓存且未过期，直接返回缓存数据
    if (cachedAssets && !cacheExpired) {
      console.log('[CloudAsset] 返回缓存的资产列表')
      return { success: true, assets: cachedAssets, fromCache: true }
    }

    // 如果有缓存但已过期，先返回缓存数据，后台刷新
    if (cachedAssets && cacheExpired && onUpdate) {
      console.log('[CloudAsset] 返回过期缓存，后台刷新资产列表')
      // 后台刷新
      this.refreshAssetsInBackground(libraryName, type, onUpdate)
      return { success: true, assets: cachedAssets, fromCache: true }
    }

    // 没有缓存，直接从服务器获取
    return this.fetchAssetsFromServer(libraryName, type)
  }

  // 后台刷新资产列表
  private async refreshAssetsInBackground(
    libraryName: string,
    type: AssetLibraryType,
    onUpdate: AssetsUpdateCallback
  ): Promise<void> {
    try {
      const result = await this.fetchAssetsFromServer(libraryName, type)
      if (result.success && result.assets) {
        onUpdate(result.assets)
      }
    } catch (error) {
      console.error('[CloudAsset] 后台刷新资产列表失败:', error)
    }
  }

  // 从服务器获取资产列表
  private async fetchAssetsFromServer(
    libraryName: string,
    type: AssetLibraryType
  ): Promise<{
    success: boolean
    assets?: CloudAsset[]
    error?: string
    fromCache?: boolean
  }> {
    try {
      const prefix = `${this.getLibraryPrefix(libraryName)}/${type}/`
      const result = await this.tosService!.listObjects(prefix)

      if (!result.success) {
        return { success: false, error: result.error }
      }

      const assets: CloudAsset[] = []

      for (const obj of result.objects || []) {
        const fileName = obj.key.split('/').pop() || ''
        if (fileName === '.folder' || fileName.startsWith('.')) continue
        const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'))
        // 根据类型选择允许的扩展名
        const allowedExtensions = type === 'others' ? OTHER_EXTENSIONS : IMAGE_EXTENSIONS
        if (!allowedExtensions.includes(ext)) continue

        assets.push({
          id: obj.key,
          name: fileName.replace(/\.[^.]+$/, ''),
          fileName,
          type,
          libraryId: libraryName,
          url: this.tosService!.getPublicUrl(obj.key),
          cloudPath: obj.key,
          fileSize: obj.size,
          uploadedBy: 'unknown',
          uploadedAt: new Date(obj.lastModified).getTime(),
        })
      }

      assets.sort((a, b) => b.uploadedAt - a.uploadedAt)

      // 保存到缓存
      saveAssetsToCache(libraryName, type, assets)

      return { success: true, assets, fromCache: false }
    } catch (error) {
      console.error('[CloudAsset] 获取资产列表异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取资产列表失败',
      }
    }
  }

  async uploadAsset(
    libraryName: string,
    type: AssetLibraryType,
    filePath: string,
    fileName: string,
    uploaderId: string,
    uploaderNickname?: string,
    onProgress?: (progress: number) => void
  ): Promise<{
    success: boolean
    asset?: CloudAsset
    error?: string
  }> {
    if (!this.tosService) {
      return { success: false, error: 'TOS 未配置' }
    }

    try {
      onProgress?.(10)

      const objectKey = `${this.getLibraryPrefix(libraryName)}/${type}/${fileName}`
      const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'))
      // 根据文件扩展名确定 contentType
      const getContentType = (extension: string): string => {
        const imageTypes: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.bmp': 'image/bmp',
        }
        const audioTypes: Record<string, string> = {
          '.mp3': 'audio/mpeg',
          '.wav': 'audio/wav',
          '.ogg': 'audio/ogg',
          '.m4a': 'audio/mp4',
          '.flac': 'audio/flac',
          '.aac': 'audio/aac',
        }
        return imageTypes[extension] || audioTypes[extension] || 'application/octet-stream'
      }
      const contentType = getContentType(ext)

      console.log('[CloudAsset] 开始上传资产:', { libraryName, type, filePath, fileName, objectKey, contentType })

      onProgress?.(30)

      const uploadResult = await this.tosService.uploadFile(filePath, objectKey, contentType)

      console.log('[CloudAsset] 上传结果:', uploadResult)

      if (!uploadResult.success || !uploadResult.url) {
        console.error('[CloudAsset] 上传失败:', uploadResult.error)
        return { success: false, error: uploadResult.error || '上传失败' }
      }

      onProgress?.(80)

      const asset: CloudAsset = {
        id: objectKey,
        name: fileName.replace(/\.[^.]+$/, ''),
        fileName,
        type,
        libraryId: libraryName,
        url: uploadResult.url,
        cloudPath: objectKey,
        fileSize: 0,
        uploadedBy: uploaderId,
        uploadedByNickname: uploaderNickname,
        uploadedAt: Date.now(),
      }

      onProgress?.(100)

      // 将新上传的资产添加到缓存中，确保能立即显示
      const cachedAssets = getAssetsFromCache(libraryName, type) || []
      const updatedAssets = [asset, ...cachedAssets]
      saveAssetsToCache(libraryName, type, updatedAssets)
      console.log('[CloudAsset] 上传成功，已更新缓存:', asset.name)

      return { success: true, asset }
    } catch (error) {
      console.error('[CloudAsset] 上传资产异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '上传失败',
      }
    }
  }

  async downloadAsset(
    cloudUrl: string,
    localPath: string,
    onProgress?: (progress: number) => void
  ): Promise<{
    success: boolean
    localPath?: string
    error?: string
  }> {
    try {
      onProgress?.(10)

      const result = await invoke<{
        success: boolean
        path: string | null
        error: string | null
      }>('cloud_asset_download', {
        url: cloudUrl,
        localPath,
      })

      if (!result.success) {
        return { success: false, error: result.error ?? '下载失败' }
      }

      onProgress?.(100)

      return { success: true, localPath: result.path ?? undefined }
    } catch (error) {
      console.error('[CloudAsset] 下载资产异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '下载失败',
      }
    }
  }

  async deleteAsset(asset: CloudAsset): Promise<{
    success: boolean
    error?: string
  }> {
    if (!this.tosService) {
      return { success: false, error: 'TOS 未配置' }
    }

    try {
      console.log(`[CloudAsset] 删除资产: ${asset.name} (${asset.cloudPath})`)

      const result = await this.tosService.deleteObject(asset.cloudPath)

      if (!result.success) {
        return { success: false, error: result.error || '删除资产失败' }
      }

      // 从缓存中移除该资产
      removeAssetFromCache(asset.libraryId, asset.type, asset.id)

      console.log(`[CloudAsset] 资产删除成功: ${asset.name}`)
      return { success: true }
    } catch (error) {
      console.error('[CloudAsset] 删除资产异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除资产失败',
      }
    }
  }
}

export default CloudAssetService
