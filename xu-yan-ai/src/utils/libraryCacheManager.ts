import type { CloudAssetLibrary, CloudAsset, AssetLibraryType } from '../types'

interface LibraryCache {
  libraries: CloudAssetLibrary[]
  timestamp: number
}

interface AssetsCache {
  assets: CloudAsset[]
  timestamp: number
}

const LIBRARIES_CACHE_KEY = 'cloud_asset_libraries_cache'
const ASSETS_CACHE_PREFIX = 'cloud_asset_assets_cache_'
const CACHE_EXPIRY = 5 * 60 * 1000 // 5分钟缓存过期时间

// 内存缓存
let librariesMemoryCache: LibraryCache | null = null
const assetsMemoryCache = new Map<string, AssetsCache>()

// 获取缓存键
function getAssetsCacheKey(libraryId: string, type: AssetLibraryType): string {
  return `${ASSETS_CACHE_PREFIX}${libraryId}_${type}`
}

// 保存资产库列表到缓存
export function saveLibrariesToCache(libraries: CloudAssetLibrary[]): void {
  const cache: LibraryCache = {
    libraries,
    timestamp: Date.now(),
  }
  librariesMemoryCache = cache

  try {
    localStorage.setItem(LIBRARIES_CACHE_KEY, JSON.stringify(cache))
    console.log('[LibraryCache] 资产库列表已保存到缓存')
  } catch (error) {
    console.warn('[LibraryCache] 保存到 localStorage 失败:', error)
  }
}

// 从缓存获取资产库列表
export function getLibrariesFromCache(): CloudAssetLibrary[] | null {
  // 先检查内存缓存
  if (librariesMemoryCache && Date.now() - librariesMemoryCache.timestamp < CACHE_EXPIRY) {
    console.log('[LibraryCache] 从内存缓存获取资产库列表')
    return librariesMemoryCache.libraries
  }

  // 再检查 localStorage
  try {
    const cached = localStorage.getItem(LIBRARIES_CACHE_KEY)
    if (cached) {
      const cache: LibraryCache = JSON.parse(cached)
      if (Date.now() - cache.timestamp < CACHE_EXPIRY) {
        console.log('[LibraryCache] 从 localStorage 获取资产库列表')
        // 同步到内存缓存
        librariesMemoryCache = cache
        return cache.libraries
      }
    }
  } catch (error) {
    console.warn('[LibraryCache] 从 localStorage 读取失败:', error)
  }

  return null
}

// 保存资产列表到缓存
export function saveAssetsToCache(
  libraryId: string,
  type: AssetLibraryType,
  assets: CloudAsset[]
): void {
  const cacheKey = getAssetsCacheKey(libraryId, type)
  const cache: AssetsCache = {
    assets,
    timestamp: Date.now(),
  }

  // 保存到内存
  assetsMemoryCache.set(cacheKey, cache)

  // 保存到 localStorage
  try {
    localStorage.setItem(cacheKey, JSON.stringify(cache))
  } catch (error) {
    console.warn('[LibraryCache] 保存资产到 localStorage 失败:', error)
  }
}

// 从缓存获取资产列表
export function getAssetsFromCache(
  libraryId: string,
  type: AssetLibraryType
): CloudAsset[] | null {
  const cacheKey = getAssetsCacheKey(libraryId, type)

  // 先检查内存缓存
  const memoryCache = assetsMemoryCache.get(cacheKey)
  if (memoryCache && Date.now() - memoryCache.timestamp < CACHE_EXPIRY) {
    console.log('[LibraryCache] 从内存缓存获取资产列表')
    return memoryCache.assets
  }

  // 再检查 localStorage
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const cache: AssetsCache = JSON.parse(cached)
      if (Date.now() - cache.timestamp < CACHE_EXPIRY) {
        console.log('[LibraryCache] 从 localStorage 获取资产列表')
        // 同步到内存缓存
        assetsMemoryCache.set(cacheKey, cache)
        return cache.assets
      }
    }
  } catch (error) {
    console.warn('[LibraryCache] 从 localStorage 读取失败:', error)
  }

  return null
}

// 从缓存中删除单个资产
export function removeAssetFromCache(
  libraryId: string,
  type: AssetLibraryType,
  assetId: string
): void {
  const cacheKey = getAssetsCacheKey(libraryId, type)

  // 从内存缓存中移除
  const memoryCache = assetsMemoryCache.get(cacheKey)
  if (memoryCache) {
    memoryCache.assets = memoryCache.assets.filter(a => a.id !== assetId)
    console.log('[LibraryCache] 从内存缓存移除资产:', assetId)
  }

  // 从 localStorage 中移除
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const cache: AssetsCache = JSON.parse(cached)
      cache.assets = cache.assets.filter(a => a.id !== assetId)
      localStorage.setItem(cacheKey, JSON.stringify(cache))
      console.log('[LibraryCache] 从 localStorage 移除资产:', assetId)
    }
  } catch (error) {
    console.warn('[LibraryCache] 从 localStorage 移除资产失败:', error)
  }
}

// 清除所有缓存
export function clearAllLibraryCaches(): void {
  librariesMemoryCache = null
  assetsMemoryCache.clear()

  try {
    localStorage.removeItem(LIBRARIES_CACHE_KEY)

    // 清除所有资产缓存
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && key.startsWith(ASSETS_CACHE_PREFIX)) {
        localStorage.removeItem(key)
      }
    }

    console.log('[LibraryCache] 已清除所有缓存')
  } catch (error) {
    console.warn('[LibraryCache] 清除缓存失败:', error)
  }
}

// 检查缓存是否过期
export function isLibrariesCacheExpired(): boolean {
  if (librariesMemoryCache) {
    return Date.now() - librariesMemoryCache.timestamp >= CACHE_EXPIRY
  }

  try {
    const cached = localStorage.getItem(LIBRARIES_CACHE_KEY)
    if (cached) {
      const cache: LibraryCache = JSON.parse(cached)
      return Date.now() - cache.timestamp >= CACHE_EXPIRY
    }
  } catch {
    // 解析失败视为过期
  }

  return true
}

// 检查资产缓存是否过期
export function isAssetsCacheExpired(libraryId: string, type: AssetLibraryType): boolean {
  const cacheKey = getAssetsCacheKey(libraryId, type)

  const memoryCache = assetsMemoryCache.get(cacheKey)
  if (memoryCache) {
    return Date.now() - memoryCache.timestamp >= CACHE_EXPIRY
  }

  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const cache: AssetsCache = JSON.parse(cached)
      return Date.now() - cache.timestamp >= CACHE_EXPIRY
    }
  } catch {
    // 解析失败视为过期
  }

  return true
}
