const imageCache = new Map<string, HTMLImageElement>()
const loadingImages = new Set<string>()

export const imagePreloader = {
  preload(urls: string[]): Promise<void[]> {
    return Promise.all(
      urls
        .filter(url => url && !imageCache.has(url) && !loadingImages.has(url))
        .map(url => this.loadImage(url))
    )
  },

  loadImage(url: string): Promise<void> {
    return new Promise((resolve) => {
      if (imageCache.has(url)) {
        resolve()
        return
      }

      if (loadingImages.has(url)) {
        resolve()
        return
      }

      loadingImages.add(url)

      const img = new Image()
      img.onload = () => {
        imageCache.set(url, img)
        loadingImages.delete(url)
        resolve()
      }
      img.onerror = () => {
        loadingImages.delete(url)
        resolve()
      }
      img.src = url
    })
  },

  has(url: string): boolean {
    return imageCache.has(url)
  },

  get(url: string): HTMLImageElement | undefined {
    return imageCache.get(url)
  },

  clear(): void {
    imageCache.clear()
    loadingImages.clear()
  }
}

export function extractImageUrls(workItems: import('../types').WorkItem[]): string[] {
  const urls: string[] = []

  workItems.forEach(item => {
    if (item.generatedImage?.url) {
      urls.push(item.generatedImage.url)
    }
    if (item.generatedVideo?.url) {
      urls.push(item.generatedVideo.url)
    }
    if (item.firstFrame?.preview) {
      urls.push(item.firstFrame.preview)
    }
    if (item.lastFrame?.preview) {
      urls.push(item.lastFrame.preview)
    }
    item.referenceImages.forEach(ref => {
      if (ref.preview) {
        urls.push(ref.preview)
      }
    })
  })

  return [...new Set(urls)]
}
