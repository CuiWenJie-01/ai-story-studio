const MAX_CONCURRENT_LOADS = 3
const loadingQueue: Array<() => void> = []
let currentLoads = 0
const loadedUrls = new Set<string>()
const failedUrls = new Set<string>()
const imageElements = new Map<string, HTMLImageElement>()

function processQueue() {
  while (currentLoads < MAX_CONCURRENT_LOADS && loadingQueue.length > 0) {
    const next = loadingQueue.shift()
    if (next) {
      currentLoads++
      next()
    }
  }
}

export function loadImageWithQueue(
  url: string,
  priority: 'high' | 'low' = 'low'
): Promise<HTMLImageElement> {
  if (loadedUrls.has(url)) {
    const cachedImg = imageElements.get(url)
    if (cachedImg) {
      return Promise.resolve(cachedImg)
    }
    return Promise.resolve(createImageElement(url))
  }
  
  if (failedUrls.has(url)) {
    return Promise.reject(new Error(`Image failed to load: ${url}`))
  }

  return new Promise((resolve, reject) => {
    const loadTask = () => {
      const img = createImageElement(url)
      
      img.onload = () => {
        currentLoads--
        loadedUrls.add(url)
        imageElements.set(url, img)
        resolve(img)
        processQueue()
      }
      
      img.onerror = () => {
        currentLoads--
        failedUrls.add(url)
        reject(new Error(`Failed to load image: ${url}`))
        processQueue()
      }
      
      img.src = url
    }

    if (priority === 'high') {
      if (currentLoads < MAX_CONCURRENT_LOADS) {
        currentLoads++
        loadTask()
      } else {
        loadingQueue.unshift(loadTask)
        processQueue()
      }
    } else {
      if (currentLoads < MAX_CONCURRENT_LOADS) {
        currentLoads++
        loadTask()
      } else {
        loadingQueue.push(loadTask)
      }
    }
  })
}

function createImageElement(url: string): HTMLImageElement {
  const img = new Image()
  img.decoding = 'async'
  img.loading = 'lazy'
  img.src = url
  return img
}

export function isImageLoaded(url: string): boolean {
  return loadedUrls.has(url)
}

export function isImageFailed(url: string): boolean {
  return failedUrls.has(url)
}

export function getImageElement(url: string): HTMLImageElement | undefined {
  return imageElements.get(url)
}

export function preloadImages(urls: string[], priority: 'high' | 'low' = 'low'): void {
  urls.forEach(url => {
    if (!loadedUrls.has(url) && !failedUrls.has(url)) {
      loadImageWithQueue(url, priority).catch(() => {})
    }
  })
}

export function clearLoadCache(): void {
  loadedUrls.clear()
  failedUrls.clear()
  imageElements.clear()
}

export function clearImageFromCache(url: string): void {
  loadedUrls.delete(url)
  failedUrls.delete(url)
  imageElements.delete(url)
}

export function getQueueStatus() {
  return {
    currentLoads,
    queueLength: loadingQueue.length,
    loadedCount: loadedUrls.size,
    failedCount: failedUrls.size,
  }
}
