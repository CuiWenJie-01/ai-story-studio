/**
 * 音频格式转换工具
 * 用于将 MP3 等格式转换为 WAV 格式
 */

/**
 * 将音频文件转换为 WAV 格式
 * @param audioFile 音频文件路径或 URL
 * @returns 转换后的 WAV 文件 Blob URL
 */
export async function convertToWav(audioFile: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    // 如果已经是 WAV 格式，直接返回
    if (audioFile.toLowerCase().endsWith('.wav')) {
      return { success: true, url: audioFile }
    }

    // 如果是网络 URL，直接返回（让服务器处理转换）
    if (audioFile.startsWith('http://') || audioFile.startsWith('https://')) {
      return { success: true, url: audioFile }
    }

    // 检查是否是本地文件路径
    const isLocalPath = audioFile.match(/^[A-Za-z]:[/\\]/) || audioFile.startsWith('/')
    if (!isLocalPath && !audioFile.startsWith('asset://')) {
      return { success: false, error: '不支持的音频文件路径格式' }
    }

    // 目前先返回原路径，实际转换通过后端实现
    // TODO: 调用后端音频转换服务
    console.log(`[AudioConverter] 需要将音频转换为 WAV: ${audioFile}`)
    return { success: true, url: audioFile }
  } catch (error) {
    console.error('[AudioConverter] 音频转换失败:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '音频转换失败' 
    }
  }
}

/**
 * 使用 Web Audio API 将音频 ArrayBuffer 转换为 WAV
 * @param audioData 音频数据
 * @param sampleRate 采样率
 * @returns WAV 格式的 ArrayBuffer
 */
export function encodeWav(audioData: Float32Array, sampleRate: number = 44100): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + audioData.length * 2)
  const view = new DataView(buffer)

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + audioData.length * 2, true)
  writeString(view, 8, 'WAVE')

  // fmt sub-chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // subchunk1size
  view.setUint16(20, 1, true) // audio format (PCM)
  view.setUint16(22, 1, true) // num of channels
  view.setUint32(24, sampleRate, true) // sample rate
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample

  // data sub-chunk
  writeString(view, 36, 'data')
  view.setUint32(40, audioData.length * 2, true)

  // write audio data
  const volume = 0.5
  for (let i = 0; i < audioData.length; i++) {
    const sample = Math.max(-1, Math.min(1, audioData[i])) * volume
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true)
  }

  return buffer
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

/**
 * 获取音频文件的扩展名
 */
export function getAudioExtension(filePath: string): string {
  const match = filePath.match(/\.([a-zA-Z0-9]+)$/)
  return match ? match[1].toLowerCase() : 'wav'
}

/**
 * 检查音频格式是否需要转换
 */
export function needsConversion(filePath: string): boolean {
  const ext = getAudioExtension(filePath)
  return ext !== 'wav'
}
