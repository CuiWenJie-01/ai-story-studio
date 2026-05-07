const urlCache = new Map<string, string>()

export function getUrlCache(): Map<string, string> {
  return urlCache
}

export function clearImageCache(path: string): void {
  if (!path) return
  urlCache.delete(path)
}

export function clearThumbnailCache(imagePath: string): void {
  if (!imagePath) return
  
  const fileName = imagePath.split(/[/\\]/).pop() || ''
  const baseName = fileName.replace(/\.[^.]+$/, '')
  const dir = imagePath.substring(0, imagePath.lastIndexOf(/[/\\]/.test(imagePath) ? imagePath.match(/[/\\]/)![0] : '/'))
  
  const thumbnailPath = `${dir}/.thumbnails/${baseName}_thumb.jpg`
  urlCache.delete(thumbnailPath)
  
  const assetUrl = urlCache.get(imagePath)
  if (assetUrl) {
    urlCache.delete(imagePath)
  }
}

export function clearImageAndThumbnailCache(imagePath: string): void {
  clearImageCache(imagePath)
  clearThumbnailCache(imagePath)
}

export function getCachedUrl(path: string): string | undefined {
  return urlCache.get(path)
}

export function setCachedUrl(path: string, url: string): void {
  urlCache.set(path, url)
}
