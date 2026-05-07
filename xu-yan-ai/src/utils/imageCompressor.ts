/**
 * 将 Base64 图片压缩到指定最大尺寸和质量
 * @param base64DataUrl 完整的 data:image/xxx;base64,xxx 格式
 * @param maxSize 最大边长（像素），默认 1024
 * @param quality JPEG 压缩质量 0-1，默认 0.8
 * @returns 压缩后的 data:image/jpeg;base64,xxx
 */
export function compressImage(
  base64DataUrl: string,
  maxSize: number = 1024,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img

      // 如果图片已经小于 maxSize，且不是特别大的文件，直接返回
      if (width <= maxSize && height <= maxSize && base64DataUrl.length < 500000) {
        console.log(`[ImageCompressor] 图片已足够小 (${width}x${height}, ${Math.round(base64DataUrl.length / 1024)}KB)，跳过压缩`)
        resolve(base64DataUrl)
        return
      }

      // 计算缩放比例
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('无法创建 canvas context'))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)
      const compressed = canvas.toDataURL('image/jpeg', quality)
      
      const originalKB = Math.round(base64DataUrl.length / 1024)
      const compressedKB = Math.round(compressed.length / 1024)
      console.log(`[ImageCompressor] 压缩完成: ${img.naturalWidth}x${img.naturalHeight} -> ${width}x${height}, ${originalKB}KB -> ${compressedKB}KB`)
      
      resolve(compressed)
    }
    img.onerror = () => {
      console.warn('[ImageCompressor] 图片加载失败，返回原图')
      resolve(base64DataUrl)
    }
    img.src = base64DataUrl
  })
}
