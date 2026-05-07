import { readDir } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import type { CharacterImage, CharacterMatchResult, CharacterMatchLog } from '../types'

const matchLogs: CharacterMatchLog[] = []

function addLog(action: string, details: string, success: boolean) {
  const log: CharacterMatchLog = {
    timestamp: Date.now(),
    action,
    details,
    success,
  }
  matchLogs.push(log)
  console.log(`[CharacterMatcher] ${action}: ${details}`)
}

export function getMatchLogs(): CharacterMatchLog[] {
  return [...matchLogs]
}

export function clearMatchLogs(): void {
  matchLogs.length = 0
}

function normalizeCharacterName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s\-_]+/g, '')
    .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '')
}

function extractCharacterNameFromFileName(fileName: string): string {
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, '')
  return normalizeCharacterName(nameWithoutExt)
}

export async function scanCharacterLibrary(taskPath: string): Promise<CharacterImage[]> {
  const characterImages: CharacterImage[] = []

  try {
    const characterLibPath = await join(taskPath, '角色库')

    addLog('扫描角色库', `路径: ${characterLibPath}`, true)

    try {
      const entries = await readDir(characterLibPath)

      for (const entry of entries) {
        if (entry.isFile && /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(entry.name)) {
          const filePath = await join(characterLibPath, entry.name)

          characterImages.push({
            name: extractCharacterNameFromFileName(entry.name),
            path: filePath,
          })
        }
      }

      addLog('扫描完成', `找到 ${characterImages.length} 张角色图片`, true)
    } catch (error) {
      addLog('扫描失败', `无法读取角色库目录: ${error}`, false)
    }
  } catch (error) {
    addLog('路径错误', `无法构建角色库路径: ${error}`, false)
  }

  return characterImages
}

function matchCharacterToImage(
  characterName: string,
  characterImages: CharacterImage[]
): CharacterImage | null {
  const normalizedSearch = normalizeCharacterName(characterName)

  for (const img of characterImages) {
    if (img.name === normalizedSearch) {
      return img
    }

    if (img.name.includes(normalizedSearch) || normalizedSearch.includes(img.name)) {
      return img
    }
  }

  return null
}

export function matchCharactersForShot(
  shotNumber: number | string,
  characters: string[],
  characterImages: CharacterImage[]
): CharacterMatchResult {
  const matchedImages: Array<CharacterImage & { slotIndex: number; characterName: string }> = []
  const unmatchedCharacters: string[] = []
  const errors: string[] = []

  addLog('匹配角色', `镜头 ${shotNumber}: 角色 [${characters.join(', ')}]`, true)

  for (let i = 0; i < characters.length; i++) {
    const character = characters[i]
    if (!character || character.trim() === '') continue

    const match = matchCharacterToImage(character, characterImages)

    if (match) {
      matchedImages.push({
        ...match,
        slotIndex: i,
        characterName: character,
      })
      addLog('匹配成功', `角色 "${character}" -> ${match.path}`, true)
    } else {
      unmatchedCharacters.push(character)
      addLog('匹配失败', `角色 "${character}" 未找到对应图片`, false)
    }
  }

  if (unmatchedCharacters.length > 0) {
    errors.push(`以下角色未匹配到图片: ${unmatchedCharacters.join(', ')}`)
  }

  return {
    shotNumber,
    characters,
    matchedImages,
    unmatchedCharacters,
    errors,
  }
}

export async function batchMatchCharacters(
  taskPath: string,
  shotData: Array<{ shotNumber: number | string; characters: string[] }>
): Promise<CharacterMatchResult[]> {
  addLog('开始批量匹配', `共 ${shotData.length} 个镜头`, true)

  const characterImages = await scanCharacterLibrary(taskPath)

  if (characterImages.length === 0) {
    addLog('角色库为空', '未找到任何角色图片', false)
    return shotData.map(({ shotNumber, characters }) => ({
      shotNumber,
      characters,
      matchedImages: [],
      unmatchedCharacters: characters.filter(c => c && c.trim() !== ''),
      errors: ['角色库为空或不存在'],
    }))
  }

  const results: CharacterMatchResult[] = []

  for (const { shotNumber, characters } of shotData) {
    const result = matchCharactersForShot(shotNumber, characters, characterImages)
    results.push(result)
  }

  const totalMatched = results.reduce((sum, r) => sum + r.matchedImages.length, 0)
  const totalUnmatched = results.reduce((sum, r) => sum + r.unmatchedCharacters.length, 0)

  addLog('批量匹配完成', `成功: ${totalMatched}, 失败: ${totalUnmatched}`, true)

  return results
}

export default {
  scanCharacterLibrary,
  matchCharacterToImage,
  matchCharactersForShot,
  batchMatchCharacters,
  getMatchLogs,
  clearMatchLogs,
}
