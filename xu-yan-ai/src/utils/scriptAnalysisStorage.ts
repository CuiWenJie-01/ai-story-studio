import { mkdir, writeFile, readFile, remove, exists } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'

export interface ScriptAnalysisCharacter {
  id: string
  name: string
  image: string | null
  prompt: string
}

export interface ScriptAnalysisProp {
  id: string
  name: string
  image: string | null
  prompt: string
}

export interface ScriptAnalysisScene {
  id: string
  name: string
  image: string | null
  prompt: string
}

export interface ScriptAnalysisShot {
  shotNumber: string
  novelText: string
  scene: string
  imagePrompt: string
  videoPrompt: string
  characters: string[]
  props: string
}

export interface ScriptAnalysisRecord {
  id: string
  name: string
  novelText: string
  scriptText: string
  style: string
  characters: ScriptAnalysisCharacter[]
  props: ScriptAnalysisProp[]
  scenes: ScriptAnalysisScene[]
  shots: ScriptAnalysisShot[]
  createdAt: number
  updatedAt: number
}

const SCRIPT_ANALYSIS_DIR = '剧本解析'
const SCRIPT_ANALYSIS_FILE = 'script_analysis_history.json'

const LIBRARY_FOLDERS = {
  character: '角色库',
  prop: '道具库',
  scene: '场景库',
}

function getImageExtension(imageData: string): string {
  if (imageData.startsWith('data:')) {
    const mimeMatch = imageData.match(/data:image\/([^;]+)/)
    if (mimeMatch) {
      const mime = mimeMatch[1].toLowerCase()
      if (mime === 'jpeg' || mime === 'jpg') return 'jpg'
      if (mime === 'png') return 'png'
      if (mime === 'gif') return 'gif'
      if (mime === 'webp') return 'webp'
      if (mime === 'bmp') return 'bmp'
      return mime
    }
  }
  const extMatch = imageData.match(/\.([a-zA-Z]+)(?:\?|$)/)
  if (extMatch) {
    return extMatch[1].toLowerCase()
  }
  return 'png'
}

export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true })
  } catch {
    // 目录可能已存在
  }
}

export async function getScriptAnalysisDir(taskPath: string): Promise<string> {
  const dir = await join(taskPath, SCRIPT_ANALYSIS_DIR)
  await ensureDir(dir)
  return dir
}

export async function loadScriptAnalysisHistory(taskPath: string): Promise<ScriptAnalysisRecord[]> {
  try {
    const dir = await getScriptAnalysisDir(taskPath)
    const filePath = await join(dir, SCRIPT_ANALYSIS_FILE)
    
    const data = await readFile(filePath)
    const text = new TextDecoder().decode(data)
    const records: ScriptAnalysisRecord[] = JSON.parse(text)
    
    return records.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export async function saveScriptAnalysisHistory(
  taskPath: string, 
  records: ScriptAnalysisRecord[]
): Promise<boolean> {
  try {
    const dir = await getScriptAnalysisDir(taskPath)
    const filePath = await join(dir, SCRIPT_ANALYSIS_FILE)
    
    const sortedRecords = [...records].sort((a, b) => b.updatedAt - a.updatedAt)
    const data = new TextEncoder().encode(JSON.stringify(sortedRecords, null, 2))
    
    await writeFile(filePath, data)
    return true
  } catch (error) {
    console.error('[ScriptAnalysisStorage] 保存失败:', error)
    return false
  }
}

export async function addScriptAnalysisRecord(
  taskPath: string,
  record: ScriptAnalysisRecord
): Promise<boolean> {
  const records = await loadScriptAnalysisHistory(taskPath)
  
  const existingIndex = records.findIndex(r => r.id === record.id)
  if (existingIndex >= 0) {
    records[existingIndex] = { ...record, updatedAt: Date.now() }
  } else {
    records.push({ ...record, createdAt: Date.now(), updatedAt: Date.now() })
  }
  
  return saveScriptAnalysisHistory(taskPath, records)
}

export async function deleteScriptAnalysisRecord(
  taskPath: string,
  recordId: string
): Promise<boolean> {
  const records = await loadScriptAnalysisHistory(taskPath)
  const record = records.find(r => r.id === recordId)
  
  if (record) {
    const deleteImageFile = async (imagePath: string | null) => {
      if (imagePath && !imagePath.startsWith('data:')) {
        try {
          if (await exists(imagePath)) {
            await remove(imagePath)
          }
        } catch (err) {
          console.error('[ScriptAnalysisStorage] 删除图片文件失败:', err)
        }
      }
    }
    
    for (const char of record.characters) {
      await deleteImageFile(char.image)
    }
    for (const prop of record.props) {
      await deleteImageFile(prop.image)
    }
    for (const scene of record.scenes) {
      await deleteImageFile(scene.image)
    }
  }
  
  const filtered = records.filter(r => r.id !== recordId)
  return saveScriptAnalysisHistory(taskPath, filtered)
}

export async function renameScriptAnalysisRecord(
  taskPath: string,
  recordId: string,
  newName: string
): Promise<boolean> {
  const records = await loadScriptAnalysisHistory(taskPath)
  const index = records.findIndex(r => r.id === recordId)
  
  if (index >= 0) {
    records[index] = {
      ...records[index],
      name: newName,
      updatedAt: Date.now(),
    }
    return saveScriptAnalysisHistory(taskPath, records)
  }
  
  return false
}

export async function saveAnalysisImage(
  taskPath: string,
  _recordId: string,
  type: 'character' | 'prop' | 'scene',
  itemId: string,
  imageData: string,
  itemName?: string
): Promise<string | null> {
  try {
    const libraryFolder = LIBRARY_FOLDERS[type]
    const libraryDir = await join(taskPath, libraryFolder)
    await ensureDir(libraryDir)
    
    const extension = getImageExtension(imageData)
    const safeName = itemName ? itemName.replace(/[<>:"/\\|?*]/g, '_') : itemId
    const fileName = `${safeName}.${extension}`
    const filePath = await join(libraryDir, fileName)
    
    let data: Uint8Array
    if (imageData.startsWith('data:')) {
      const base64Data = imageData.split(',')[1]
      data = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
    } else {
      const response = await fetch(imageData)
      const blob = await response.blob()
      const arrayBuffer = await blob.arrayBuffer()
      data = new Uint8Array(arrayBuffer)
    }
    
    await writeFile(filePath, data)
    return filePath
  } catch (error) {
    console.error('[ScriptAnalysisStorage] 保存图片失败:', error)
    return null
  }
}

export async function copyImageFileToLibrary(
  taskPath: string,
  type: 'character' | 'prop' | 'scene',
  sourceFile: File,
  itemName: string
): Promise<string | null> {
  try {
    const libraryFolder = LIBRARY_FOLDERS[type]
    const libraryDir = await join(taskPath, libraryFolder)
    await ensureDir(libraryDir)
    
    const extension = sourceFile.name.split('.').pop() || 'png'
    const safeName = itemName.replace(/[<>:"/\\|?*]/g, '_')
    const fileName = `${safeName}.${extension}`
    const filePath = await join(libraryDir, fileName)
    
    const arrayBuffer = await sourceFile.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    
    await writeFile(filePath, data)
    return filePath
  } catch (error) {
    console.error('[ScriptAnalysisStorage] 复制图片到库失败:', error)
    return null
  }
}

export async function loadAnalysisImage(
  taskPath: string,
  recordId: string,
  type: 'character' | 'prop' | 'scene',
  itemId: string
): Promise<string | null> {
  try {
    const dir = await getScriptAnalysisDir(taskPath)
    const filePath = await join(dir, 'images', recordId, type, `${itemId}.png`)
    
    const data = await readFile(filePath)
    const base64 = btoa(String.fromCharCode(...data))
    return `data:image/png;base64,${base64}`
  } catch {
    return null
  }
}

export function createNewAnalysisRecord(name?: string): ScriptAnalysisRecord {
  const now = Date.now()
  return {
    id: `analysis-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || `剧本解析 ${new Date().toLocaleString('zh-CN', { 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    })}`,
    novelText: '',
    scriptText: '',
    style: '古风写实风格',
    characters: [],
    props: [],
    scenes: [],
    shots: [],
    createdAt: now,
    updatedAt: now,
  }
}
