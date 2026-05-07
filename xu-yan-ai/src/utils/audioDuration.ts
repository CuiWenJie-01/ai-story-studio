/**
 * 音频时长检测工具
 * 用于获取音频文件的时长
 */

/**
 * 获取音频文件时长（秒）
 * @param filePath 音频文件路径
 * @returns 音频时长（秒），获取失败返回 0
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    // 创建音频元素
    const audio = new Audio()
    
    // 处理本地文件路径
    let url = filePath
    if (filePath.startsWith('asset://')) {
      url = filePath.replace('asset://', '')
    }
    
    // 使用 Object URL 加载本地文件
    const objectUrl = URL.createObjectURL(new Blob([]))
    
    // 设置超时
    const timeout = setTimeout(() => {
      console.warn('[AudioDuration] 获取音频时长超时:', filePath)
      cleanup()
      resolve(0)
    }, 10000)
    
    const cleanup = () => {
      clearTimeout(timeout)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('error', onError)
      URL.revokeObjectURL(objectUrl)
    }
    
    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        console.log(`[AudioDuration] 音频时长: ${audio.duration.toFixed(2)}秒 - ${filePath}`)
        cleanup()
        resolve(audio.duration)
      } else {
        console.warn('[AudioDuration] 无法获取音频时长:', filePath)
        cleanup()
        resolve(0)
      }
    }
    
    const onError = () => {
      console.error('[AudioDuration] 加载音频失败:', filePath)
      cleanup()
      resolve(0)
    }
    
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('error', onError)
    
    // 尝试加载音频
    // 注意：由于浏览器安全限制，可能无法直接加载本地文件路径
    // 这种情况下需要先将文件读取为 Blob
    
    // 如果是 http/https URL，直接加载
    if (url.startsWith('http://') || url.startsWith('https://')) {
      audio.src = url
    } else {
      // 本地文件，需要通过 Tauri API 读取
      // 这里返回 0，让调用方通过其他方式获取时长
      console.log('[AudioDuration] 本地文件无法直接获取时长，返回 0:', filePath)
      cleanup()
      resolve(0)
    }
  })
}

/**
 * 通过 Tauri API 获取音频时长
 * @param filePath 音频文件路径
 * @returns 音频时长（秒）
 */
export async function getAudioDurationViaTauri(filePath: string): Promise<number> {
  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core')
    
    // 转换为 Tauri 可以访问的 URL
    const assetUrl = convertFileSrc(filePath)
    
    return new Promise((resolve) => {
      const audio = new Audio(assetUrl)
      
      const timeout = setTimeout(() => {
        console.warn('[AudioDuration] Tauri 获取音频时长超时:', filePath)
        cleanup()
        resolve(0)
      }, 10000)
      
      const cleanup = () => {
        clearTimeout(timeout)
        audio.removeEventListener('loadedmetadata', onLoadedMetadata)
        audio.removeEventListener('error', onError)
      }
      
      const onLoadedMetadata = () => {
        if (audio.duration && isFinite(audio.duration)) {
          console.log(`[AudioDuration] Tauri 获取音频时长: ${audio.duration.toFixed(2)}秒 - ${filePath}`)
          cleanup()
          resolve(audio.duration)
        } else {
          cleanup()
          resolve(0)
        }
      }
      
      const onError = () => {
        console.error('[AudioDuration] Tauri 加载音频失败:', filePath)
        cleanup()
        resolve(0)
      }
      
      audio.addEventListener('loadedmetadata', onLoadedMetadata)
      audio.addEventListener('error', onError)
    })
  } catch (error) {
    console.error('[AudioDuration] Tauri 获取音频时长失败:', error)
    return 0
  }
}

/**
 * 计算多个音频的总时长
 * @param audioPaths 音频文件路径数组
 * @returns 总时长（秒）
 */
export async function getTotalAudioDuration(audioPaths: string[]): Promise<number> {
  const durations = await Promise.all(
    audioPaths.map(path => getAudioDurationViaTauri(path))
  )
  const total = durations.reduce((sum, duration) => sum + duration, 0)
  console.log(`[AudioDuration] 音频总时长: ${total.toFixed(2)}秒 (${audioPaths.length} 个文件)`)
  return total
}

/**
 * 验证音频总时长是否符合限制
 * @param audioPaths 音频文件路径数组
 * @param maxDuration 最大允许时长（秒），默认 15.2
 * @param minDuration 最小允许时长（秒），默认 1.8
 * @returns 验证结果
 */
export async function validateAudioDuration(
  audioPaths: string[], 
  maxDuration: number = 15.2,
  minDuration: number = 1.8
): Promise<{ 
  valid: boolean; 
  totalDuration: number; 
  exceededBy: number;
  insufficientBy: number;
  error?: string 
}> {
  const totalDuration = await getTotalAudioDuration(audioPaths)
  const exceededBy = Math.max(0, totalDuration - maxDuration)
  const insufficientBy = Math.max(0, minDuration - totalDuration)
  
  let error: string | undefined
  if (totalDuration > maxDuration) {
    error = `音频总时长 ${formatDuration(totalDuration)} 超过限制 ${maxDuration}秒`
  } else if (totalDuration < minDuration) {
    error = `音频总时长 ${formatDuration(totalDuration)} 小于最低要求 ${minDuration}秒`
  }
  
  return {
    valid: totalDuration <= maxDuration && totalDuration >= minDuration,
    totalDuration,
    exceededBy,
    insufficientBy,
    error
  }
}

/**
 * 格式化时长显示
 * @param seconds 秒数
 * @returns 格式化字符串（如 "15.2s" 或 "0:15"）
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}秒`
  }
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
