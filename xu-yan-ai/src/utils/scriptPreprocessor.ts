/**
 * 剧本/文案预处理工具
 * 将用户输入的混合内容（角色描述 + 形象标记 + 文案）拆分为结构化数据
 * 后续新增格式规则只需在此文件中添加
 */

export interface PreprocessResult {
  characterInfo: string    // 提取出的角色信息（作为上下文传给AI）
  styleMarkers: string[]   // 形象切换标记列表
  scriptContent: string    // 纯文案内容（实际需要生成镜头的部分）
}

// 人物特征描述关键词（用于识别角色描述行）
const CHARACTER_KEYWORDS = [
  '青年男性', '青年女性', '中年男性', '中年女性', '老年男性', '老年女性',
  '老女女性', // 可能的笔误
  '束发', '盘发', '高鬓', '长发',
  '汉服', '龙袍', '常服', '华服', '官服', '将军服', '选秀服', '孕装',
  '配黑靴', '配黑鞋', '配白鞋', '配剑靴', '配靴',
]

// 非文案行的起始关键词
const NON_SCRIPT_PREFIXES = [
  '人物特征描述',
  '人物形象提示词',
  '人物:',
  '人物：',
  '角色:',
  '角色：',
  '配角',
  '背景',
  '主角',
  '道具:',
  '道具：',
]

/**
 * 判断一行是否是角色描述行
 * 例如："潇彻龙袍 青年男性，束发戴冠，黄色龙纹朝服配黑靴"
 */
function isCharacterDescriptionLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  return CHARACTER_KEYWORDS.some(kw => trimmed.includes(kw))
}

/**
 * 判断一行是否是形象切换标记
 * 例如："以下文案中的苏清颜形象为苏清颜风袍"
 * 支持带引号和不带引号
 */
function isStyleMarkerLine(line: string): boolean {
  const trimmed = line.trim().replace(/^[""\u201C]|[""\u201D]$/g, '')
  return trimmed.startsWith('以下文案中的') && trimmed.includes('形象为')
}

/**
 * 判断一行是否是非文案的元信息行
 */
function isNonScriptLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false

  // 非文案前缀
  if (NON_SCRIPT_PREFIXES.some(p => trimmed.startsWith(p))) return true

  // 文案起始标记（如"文案二十三"、"第X章"等）- 这些行之后的内容才是正文
  // 这类标记本身不作为角色信息，但标志着正文开始
  if (/^文案[一二三四五六七八九十\d]+[：:]?\s*$/.test(trimmed)) {
    return false // 文案标记本身不算角色信息，但会触发正文模式
  }

  // 纯角色名行（2-15个字符，以冒号结尾，如"卫翎6岁:"、"萧煜少年："）
  if (/^[\u4e00-\u9fff\w\d\s]{2,15}[：:]\s*$/.test(trimmed)) {
    return true
  }

  // 纯角色名行（2-6个中文字符，没有标点和动词）
  if (/^[\u4e00-\u9fff]{2,6}$/.test(trimmed)) {
    // 排除常见的短文案（如"我看着她"这种有动词的）
    const verbPatterns = /[了的在是有着过去来到说看想走跑打]/
    if (!verbPatterns.test(trimmed)) return true
  }

  // 角色列表行（多个角色名用空格分隔，如"宫女 百姓 丫鬟丞相府婆子"）
  const parts = trimmed.split(/\s+/)
  if (parts.length >= 3 && parts.every(p => p.length <= 8 && /^[\u4e00-\u9fff]+$/.test(p))) {
    return true
  }

  return false
}

/**
 * 主预处理函数
 * 将原始文本拆分为角色信息和纯文案
 */
export function preprocessScript(rawText: string): PreprocessResult {
  const lines = rawText.split('\n')
  const characterLines: string[] = []
  const styleMarkers: string[] = []
  const scriptLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // 空行保留在文案中（保持段落结构）
    if (!trimmed) {
      if (scriptLines.length > 0) {
        scriptLines.push('')
      }
      continue
    }

    // 形象切换标记 → 提取但不作为文案
    if (isStyleMarkerLine(trimmed)) {
      styleMarkers.push(trimmed.replace(/^[""\u201C]|[""\u201D]$/g, ''))
      // 也加到角色信息里供AI参考
      characterLines.push(trimmed)
      continue
    }

    // "人物特征描述"标题 → 进入角色描述区
    if (trimmed === '人物特征描述' || trimmed.startsWith('人物特征描述')) {
      characterLines.push(trimmed)
      continue
    }

    // 角色描述行
    if (isCharacterDescriptionLine(trimmed)) {
      characterLines.push(trimmed)
      continue
    }

    // 非文案元信息行
    if (isNonScriptLine(trimmed)) {
      characterLines.push(trimmed)
      continue
    }

    // 到这里说明是文案行
    scriptLines.push(trimmed)
  }

  // 清理文案：去掉首尾空行
  while (scriptLines.length > 0 && !scriptLines[0]) scriptLines.shift()
  while (scriptLines.length > 0 && !scriptLines[scriptLines.length - 1]) scriptLines.pop()

  const characterInfo = characterLines.length > 0
    ? '【角色参考信息】\n' + characterLines.join('\n')
    : ''

  const scriptContent = scriptLines.join('\n')

  console.log(`[ScriptPreprocessor] 预处理完成: 角色信息 ${characterLines.length} 行, 形象标记 ${styleMarkers.length} 个, 文案 ${scriptLines.length} 行`)

  return { characterInfo, styleMarkers, scriptContent }
}

/**
 * 按形象切换标记将文案分成段落批次
 * 每个形象切换标记之间的文案作为一批，附带该段的形象上下文
 * 如果没有形象标记，退回按行数分批
 */
export interface StyleSegment {
  styleContext: string   // 该段的形象切换标记（如"以下文案中的苏清颜形象为苏清颜风袍"）
  content: string        // 该段的文案内容
}

export function splitByStyleMarkers(rawText: string, maxLinesPerBatch: number = 10): StyleSegment[] | null {
  const lines = rawText.split('\n')
  const segments: StyleSegment[] = []
  let currentStyle = ''
  let currentLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (isStyleMarkerLine(trimmed)) {
      // 遇到新的形象标记：把之前积累的文案存为一个段落
      if (currentLines.length > 0) {
        segments.push({
          styleContext: currentStyle,
          content: currentLines.join('\n'),
        })
        currentLines = []
      }
      currentStyle = trimmed.replace(/^[""\u201C]|[""\u201D]$/g, '')
      continue
    }

    // 跳过角色描述行和非文案行（和 preprocessScript 一致）
    if (isCharacterDescriptionLine(trimmed)) continue
    if (isNonScriptLine(trimmed)) continue

    currentLines.push(trimmed)
  }

  // 最后一段
  if (currentLines.length > 0) {
    segments.push({
      styleContext: currentStyle,
      content: currentLines.join('\n'),
    })
  }

  // 如果只有一个段落且没有形象标记，说明文本中没有形象切换，返回 null 退回默认分批
  if (segments.length <= 1 && !segments[0]?.styleContext) {
    return null
  }

  // 对过长的段落再按行数二次拆分
  const result: StyleSegment[] = []
  for (const seg of segments) {
    const segLines = seg.content.split('\n').filter(l => l.trim())
    if (segLines.length <= maxLinesPerBatch) {
      result.push(seg)
    } else {
      for (let i = 0; i < segLines.length; i += maxLinesPerBatch) {
        result.push({
          styleContext: seg.styleContext,
          content: segLines.slice(i, i + maxLinesPerBatch).join('\n'),
        })
      }
    }
  }

  console.log(`[ScriptPreprocessor] 按形象段落分批: ${result.length} 批, 形象标记: ${result.map(s => s.styleContext || '无').join(', ')}`)
  return result
}


/**
 * 从提示词中解析"参考图X是：角色名"的映射关系
 * 返回按编号排序的角色名数组，如 ['皇帝', '李德全']
 */
export function parseReferenceImageOrder(prompt: string): string[] {
  const result: { index: number; name: string }[] = []
  
  // 匹配多种格式：
  // 参考图1是："皇帝"  参考图2是："李德全"
  // 参考图1是：皇帝  参考图2是：李德全
  // 参考图1："皇帝"  参考图2："李德全"
  const pattern = /参考图(\d+)\s*(?:是)?[：:]\s*["""]?([^"""\s,，、]+)["""]?/g
  let match
  
  while ((match = pattern.exec(prompt)) !== null) {
    const index = parseInt(match[1], 10)
    const name = match[2].trim()
    if (name && name !== '人物名') {
      result.push({ index, name })
    }
  }
  
  result.sort((a, b) => a.index - b.index)
  return result.map(r => r.name)
}

/**
 * 根据提示词中的参考图顺序，重新排列参考图数组
 * 支持两种格式：
 * 1. AI生成格式：参考图1是："角色名" → 按角色名匹配
 * 2. @引用格式：@参考图2 → 按 slot 编号直接取
 * @param referenceImages 原始参考图数组
 * @param prompt 提示词文本
 * @returns 重新排序后的参考图数组
 */
export function reorderReferenceImages<T extends { characterName?: string; slotIndex?: number; order?: number }>(
  referenceImages: T[],
  prompt: string
): T[] {
  // 先尝试 @参考图N 格式（用户手动 @ 引用）
  const atPattern = /@参考图(\d+)/g
  const atMatches: number[] = []
  let atMatch
  while ((atMatch = atPattern.exec(prompt)) !== null) {
    const idx = parseInt(atMatch[1], 10)
    if (!atMatches.includes(idx)) {
      atMatches.push(idx)
    }
  }

  if (atMatches.length > 0) {
    // 按提示词中出现的顺序排列
    const sorted = [...referenceImages].sort((a, b) => {
      const aSlot = (a.slotIndex ?? a.order ?? 0) + 1
      const bSlot = (b.slotIndex ?? b.order ?? 0) + 1
      const aIdx = atMatches.indexOf(aSlot)
      const bIdx = atMatches.indexOf(bSlot)
      // 在 @ 列表中的排前面，按出现顺序；不在列表中的排后面
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx
      if (aIdx >= 0) return -1
      if (bIdx >= 0) return 1
      return (a.slotIndex ?? a.order ?? 0) - (b.slotIndex ?? b.order ?? 0)
    })
    console.log('[ScriptPreprocessor] @参考图重排序:', atMatches, '→', sorted.map(r => r.characterName || `slot${r.slotIndex}`))
    return sorted
  }

  // 尝试 参考图N 或 参考N 格式（包括"参考图1是：角色名"、"参考3"等格式）
  const refPattern = /参考(?:图)?(\d+)/g
  const refMatches: number[] = []
  let refMatch
  while ((refMatch = refPattern.exec(prompt)) !== null) {
    const idx = parseInt(refMatch[1], 10)
    if (!refMatches.includes(idx)) {
      refMatches.push(idx)
    }
  }

  if (refMatches.length > 0) {
    // 按提示词中出现的顺序排列
    const sorted = [...referenceImages].sort((a, b) => {
      const aSlot = (a.slotIndex ?? a.order ?? 0) + 1
      const bSlot = (b.slotIndex ?? b.order ?? 0) + 1
      const aIdx = refMatches.indexOf(aSlot)
      const bIdx = refMatches.indexOf(bSlot)
      // 在参考图列表中的排前面，按出现顺序；不在列表中的排后面
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx
      if (aIdx >= 0) return -1
      if (bIdx >= 0) return 1
      return (a.slotIndex ?? a.order ?? 0) - (b.slotIndex ?? b.order ?? 0)
    })
    console.log('[ScriptPreprocessor] 参考图重排序:', refMatches, '→', sorted.map(r => r.characterName || `slot${r.slotIndex}`))
    return sorted
  }

  // 再尝试 AI 生成格式：参考图1是："角色名"
  // 这里需要按照提示词中出现的顺序，而不是按照数字顺序
  const orderPattern = /参考图(\d+)\s*(?:是)?[：:]\s*["""]?([^"""\s,，、]+)["""]?/g
  const nameOrder: string[] = []
  let nameMatch
  while ((nameMatch = orderPattern.exec(prompt)) !== null) {
    const name = nameMatch[2].trim()
    if (name && name !== '人物名' && !nameOrder.includes(name)) {
      nameOrder.push(name)
    }
  }
  
  if (nameOrder.length > 0) {
    const reordered: T[] = []
    const used = new Set<number>()
    
    for (const name of nameOrder) {
      const idx = referenceImages.findIndex((img, i) => 
        !used.has(i) && img.characterName && img.characterName.includes(name)
      )
      if (idx >= 0) {
        reordered.push(referenceImages[idx])
        used.add(idx)
      }
    }
    
    // 把没匹配上的图片追加到后面
    for (let i = 0; i < referenceImages.length; i++) {
      if (!used.has(i)) {
        reordered.push(referenceImages[i])
      }
    }
    
    console.log('[ScriptPreprocessor] 参考图重排序 (按角色名):', nameOrder, '→', reordered.map(r => r.characterName))
    return reordered
  }
  
  // 最后尝试按数字顺序排序（默认行为）
  return [...referenceImages].sort((a, b) => {
    return (a.slotIndex ?? a.order ?? 0) - (b.slotIndex ?? b.order ?? 0)
  })
}
