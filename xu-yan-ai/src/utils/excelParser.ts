import * as XLSX from 'xlsx'
import type { ExcelRowData, ExcelImportResult } from '../types'

const COLUMN_MAPPINGS: Record<string, string[]> = {
  shotNumber: ['镜头号', '镜头', 'shot', 'shotNumber', '序号', '编号'],
  novelText: ['小说文案', '文案', '小说', 'novelText', 'novel', 'text', '内容'],
  scene: ['场景', 'scene', '场景描述', '背景'],
  imagePrompt: ['生图提示词', '生图提示', '图片提示词', 'imagePrompt', 'image_prompt', '图生提示词'],
  videoPrompt: ['视频提示词', '视频提示', 'videoPrompt', 'video_prompt'],
  characterCount: ['角色人数', '人数', '角色数', 'characterCount', 'character_count'],
  character1: ['参与人物1', '人物1', '角色1', 'character1'],
  character2: ['参与人物2', '人物2', '角色2', 'character2'],
  character3: ['参与人物3', '人物3', '角色3', 'character3'],
  character4: ['参与人物4', '人物4', '角色4', 'character4'],
  character5: ['参与人物5', '人物5', '角色5', 'character5'],
  character6: ['参与人物6', '人物6', '角色6', 'character6'],
  character7: ['参与人物7', '人物7', '角色7', 'character7'],
  character8: ['参与人物8', '人物8', '角色8', 'character8'],
  resolution: ['分辨率', 'resolution', 'ratio', '比例', '画幅比例', 'aspectRatio'],
  videoWidth: ['视频宽', '宽度', 'width', 'videoWidth', 'video_width', '宽'],
  videoHeight: ['视频高', '高度', 'height', 'videoHeight', 'video_height', '高'],
  duration: ['时间', '时长', 'duration', 'time', '视频时长', '秒数'],
}

function findColumnIndex(headers: string[], field: string): number {
  const possibleNames = COLUMN_MAPPINGS[field] || []
  for (const name of possibleNames) {
    const index = headers.findIndex(
      (h) => h && typeof h === 'string' && h.trim().toLowerCase() === name.toLowerCase()
    )
    if (index !== -1) return index
  }
  return -1
}

function findCharacterColumnIndices(headers: string[]): number[] {
  const indices: number[] = []
  for (let i = 1; i <= 8; i++) {
    const index = findColumnIndex(headers, `character${i}` as keyof typeof COLUMN_MAPPINGS)
    if (index !== -1) {
      indices.push(index)
    }
  }
  if (indices.length === 0) {
    const characterKeywords = ['人物', '角色', 'character', '参与']
    headers.forEach((h, idx) => {
      if (h && typeof h === 'string') {
        const headerLower = h.toLowerCase()
        if (characterKeywords.some((k) => headerLower.includes(k.toLowerCase()))) {
          if (!indices.includes(idx)) {
            indices.push(idx)
          }
        }
      }
    })
    indices.sort((a, b) => a - b)
  }
  return indices
}

export async function parseExcelFile(file: File): Promise<ExcelImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][]

        if (jsonData.length < 2) {
          resolve({
            fileName: file.name,
            sheetName,
            totalRows: 0,
            data: [],
          })
          return
        }

        const headers = jsonData[0] as string[]
        const rows = jsonData.slice(1) as unknown[][]

        const colIndices = {
          shotNumber: findColumnIndex(headers, 'shotNumber'),
          novelText: findColumnIndex(headers, 'novelText'),
          scene: findColumnIndex(headers, 'scene'),
          imagePrompt: findColumnIndex(headers, 'imagePrompt'),
          videoPrompt: findColumnIndex(headers, 'videoPrompt'),
          characterCount: findColumnIndex(headers, 'characterCount'),
          resolution: findColumnIndex(headers, 'resolution'),
          videoWidth: findColumnIndex(headers, 'videoWidth'),
          videoHeight: findColumnIndex(headers, 'videoHeight'),
          duration: findColumnIndex(headers, 'duration'),
          characters: findCharacterColumnIndices(headers),
        }

        const parsedData: ExcelRowData[] = rows
          .filter((row) => {
            if (colIndices.shotNumber >= 0) {
              return row[colIndices.shotNumber] !== undefined && row[colIndices.shotNumber] !== null
            }
            return row[0] !== undefined && row[0] !== null
          })
          .map((row) => {
            const characters: string[] = []
            colIndices.characters.forEach((idx) => {
              if (row[idx] && typeof row[idx] === 'string' && (row[idx] as string).trim()) {
                characters.push((row[idx] as string).trim())
              }
            })

            const resolutionValue =
              colIndices.resolution >= 0 ? String(row[colIndices.resolution] || '') : ''
            const parsedResolution = parseResolution(resolutionValue)

            const durationValue =
              colIndices.duration >= 0 ? Number(row[colIndices.duration]) || 0 : 0

            return {
              shotNumber:
                colIndices.shotNumber >= 0 ? Number(row[colIndices.shotNumber]) || 0 : 0,
              novelText: colIndices.novelText >= 0 ? String(row[colIndices.novelText] || '') : '',
              scene: colIndices.scene >= 0 ? String(row[colIndices.scene] || '') : '',
              imagePrompt:
                colIndices.imagePrompt >= 0 ? String(row[colIndices.imagePrompt] || '') : '',
              videoPrompt:
                colIndices.videoPrompt >= 0 ? String(row[colIndices.videoPrompt] || '') : '',
              characterCount:
                colIndices.characterCount >= 0
                  ? Number(row[colIndices.characterCount]) || characters.length
                  : characters.length,
              characters,
              resolution: parsedResolution.ratio,
              videoWidth:
                colIndices.videoWidth >= 0
                  ? Number(row[colIndices.videoWidth]) || parsedResolution.width
                  : parsedResolution.width,
              videoHeight:
                colIndices.videoHeight >= 0
                  ? Number(row[colIndices.videoHeight]) || parsedResolution.height
                  : parsedResolution.height,
              duration: durationValue > 0 ? durationValue : 5,
            }
          })

        resolve({
          fileName: file.name,
          sheetName,
          totalRows: parsedData.length,
          data: parsedData,
        })
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

function parseResolution(value: string): { ratio: string; width: number; height: number } {
  const defaultResult = { ratio: '9:16', width: 720, height: 1280 }

  if (!value || !value.trim()) {
    return defaultResult
  }

  const cleanValue = value.trim().toLowerCase()

  const ratioMatch = cleanValue.match(/^(\d+)\s*[:xX]\s*(\d+)$/)
  if (ratioMatch) {
    const w = parseInt(ratioMatch[1], 10)
    const h = parseInt(ratioMatch[2], 10)
    const ratio = w > h ? `${w}:${h}` : `${w}:${h}`
    return { ratio, width: w, height: h }
  }

  if (cleanValue === '9:16' || cleanValue === '9x16' || cleanValue === '竖屏') {
    return { ratio: '9:16', width: 720, height: 1280 }
  }
  if (cleanValue === '16:9' || cleanValue === '16x9' || cleanValue === '横屏') {
    return { ratio: '16:9', width: 1280, height: 720 }
  }
  if (cleanValue === '1:1' || cleanValue === '1x1' || cleanValue === '方形') {
    return { ratio: '1:1', width: 1024, height: 1024 }
  }
  if (cleanValue === '4:3' || cleanValue === '4x3') {
    return { ratio: '4:3', width: 1024, height: 768 }
  }
  if (cleanValue === '3:4' || cleanValue === '3x4') {
    return { ratio: '3:4', width: 768, height: 1024 }
  }
  if (cleanValue === '2k' || cleanValue === '2K') {
    return { ratio: '9:16', width: 1440, height: 2560 }
  }
  if (cleanValue === '4k' || cleanValue === '4K') {
    return { ratio: '9:16', width: 2160, height: 3840 }
  }

  return defaultResult
}

export function getExcelColumns(): string[] {
  return [
    '镜头号',
    '小说文案',
    '场景',
    '生图提示词',
    '视频提示词',
    '角色人数',
    '参与人物1-8',
    '分辨率',
    '视频宽',
    '视频高',
    '时间',
  ]
}

export function getColumnMappings(): Record<string, string[]> {
  return { ...COLUMN_MAPPINGS }
}
