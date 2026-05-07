﻿import { getStyleInfo } from '../config/stylePresets'
import { DEFAULT_DIALOGUE_SHOT_PROMPT, DEFAULT_NARRATION_SHOT_PROMPT } from './yunwuService'
import { preprocessScript, splitByStyleMarkers } from '../utils/scriptPreprocessor'

interface DeepSeekChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface DeepSeekChatRequest {
  model: string
  messages: DeepSeekChatMessage[]
  temperature?: number
  top_p?: number
  max_tokens?: number
}

interface DeepSeekChatResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  error?: {
    code: number
    message: string
    type: string
  }
}

export interface DeepSeekServiceConfig {
  apiKey: string
  endpoint?: string
  model?: string
}

const DEFAULT_CONFIG: Required<Omit<DeepSeekServiceConfig, 'apiKey'>> = {
  endpoint: 'https://yunwu.ai',
  model: 'deepseek-v3.2-thinking',
}

export class DeepSeekService {
  private config: Required<DeepSeekServiceConfig>

  constructor(config: DeepSeekServiceConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    }
  }

  async generateContent(
    systemPrompt: string,
    userMessage: string,
    options?: {
      temperature?: number
      topP?: number
      signal?: AbortSignal
    }
  ): Promise<{ success: boolean; text?: string; error?: string }> {
    const { apiKey, endpoint, model } = this.config

    if (!apiKey) {
      return { success: false, error: 'API Key 未配置' }
    }

    const requestBody: DeepSeekChatRequest = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: options?.temperature ?? 1,
      top_p: options?.topP ?? 1,
    }

    try {
      const url = `${endpoint}/v1/chat/completions`

      console.log('[DeepSeekService] 发送请求')
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: options?.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, error: `HTTP ${response.status}: ${errorText}` }
      }

      const data: DeepSeekChatResponse = await response.json()

      if (data.error) {
        return { 
          success: false, 
          error: `${data.error.type}: ${data.error.message}` 
        }
      }

      if (!data.choices || data.choices.length === 0) {
        return { success: false, error: '未返回有效内容' }
      }

      const content = data.choices[0].message.content
      return { success: true, text: content }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '未知错误' 
      }
    }
  }

  async convertNovelToScript(novelText: string, customPrompt?: string): Promise<{ success: boolean; script?: string; error?: string }> {
    // 如果有自定义 prompt，直接使用；否则使用默认的剧本转换 prompt
    let systemPrompt: string
    let userMessage: string

    if (customPrompt) {
      // 使用自定义 prompt（如 Seedance2.0 分镜 prompt）
      systemPrompt = customPrompt
      userMessage = novelText
    } else {
      // 使用默认的剧本转换 prompt
      systemPrompt = `你是一位专业的影视编剧，擅长将小说文本改编为标准格式的影视剧本。你的任务是将输入的小说片段转换为规范的剧本格式。

## 输出格式要求

请严格按照以下格式输出剧本：

【场景X】场景名称（内景/外景·时间）

角色名：（动作/神态描述）台词内容

动作描述：场景中的动作、环境变化等

---

## 格式说明

1. **场景标题**：使用【场景X】标注场景序号，后接场景名称和场景属性
   - 内景/外景：室内场景标注"内景"，室外场景标注"外景"
   - 时间：日/夜/黄昏/清晨等

2. **角色台词**：格式为"角色名：（动作/神态）台词内容"
   - 动作和神态描述放在括号内，帮助演员理解表演要求
   - 台词内容直接书写，无需引号

3. **动作描述**：用于描述场景中的重要动作、环境变化、镜头提示等
   - 使用简洁明了的语言
   - 只描述可见可听的内容

4. **场景分隔**：不同场景之间使用"---"分隔

## 改编原则

1. **保留核心情节**：确保故事主线和关键情节完整
2. **台词化处理**：将小说中的心理描写、叙述性文字转化为台词或动作
3. **视觉化表达**：注重画面感，便于拍摄
4. **节奏把控**：合理划分场景，控制每个场景的长度
5. **角色塑造**：通过台词和动作展现角色性格`

      userMessage = `请将以下小说内容改编为影视剧本：\n\n${novelText}`
    }

    const result = await this.generateContent(systemPrompt, userMessage)
    
    if (result.success) {
      return { success: true, script: result.text }
    }
    return { success: false, error: result.error }
  }

  async analyzeScript(scriptText: string, style: string, customPrompt?: string): Promise<{ 
    success: boolean
    characters?: Array<{ name: string; prompt: string }>
    props?: Array<{ name: string; prompt: string }>
    scenes?: Array<{ name: string; prompt: string }>
    error?: string 
  }> {
    console.log('[DeepSeekService] 开始分析剧本, 风格:', style)
    
    const defaultPrompt = `## 系统角色设定

我是一名专业的影视剧本分析师，我的核心工作是：深度解析剧本，过滤所有动态叙事和临时状态，提取出角色、场景、道具等元素数据，并能从专业的角度提供创作该元素图的ai提示词。

## 创作元素图的提示词规则

核心目标：必须是一段能引导AI生成高度标准化、背景绝对纯净、无任何干扰元素的模块化设计素材的中文提示词。所有图像均为后期合成服务。

### 1、 内容构成与格式

格式： 使用中文，关键词之间用中文逗号"， "分隔。结尾必须统一为"， 纯白色背景， 无阴影。"

### 2、分类结构模板（请根据元素类型选择）：

- **a、角色类**

\`纯白色背景，无阴影，2k，高清图，电影质感，[时代/世界观]风格，[职业/身份]标准角色，[年龄与性别]，[发型与面部特征]，身着[功能性与风格化的成套服饰]，脚穿[鞋靴]，**双手自然下垂或呈标准姿势**\`

**关键优化说明：**

"标准角色"： 强调这是一个基础模型，而非某个情景中的角色。

"成套服饰"： 描述完整、有设计感的服装体系。

"双手自然下垂或呈标准姿势"： 强制指令，确保角色空手、姿势中立，这是元件化的核心。避免任何持物或叙事性动作。

"等距视图"： 替代艺术化镜头，使用制图标准视角，确保比例准确，便于测量和对齐。

**示例：**

"纯白色背景，无阴影，2k，高清图，电影质感，赛博朋克风格，公司特工标准角色，青年男性，利落短发与冷峻面容，身着修身黑色纳米纤维西装（带有暗纹线路），脚穿磁吸附正装皮鞋，双手自然下垂。"

- **b、场景类（环境组件模块）：**

\`4k，高清图，电影质感，[时代/风格]的，[功能性质]场景组件模块，[空间结构特征]，核心包含[静态陈设与建筑细节列表]，[材质与表面说明]，**空无一人，无使用痕迹**，组件静帧，正交视角（正视图或45度角）\`

**关键优化说明：**

"场景组件模块"： 明确其为可拼接的零件，如"书房书桌区模块"、"中世纪酒馆吧台模块"。

"静态陈设列表"： 客观列举物体，如"一张书桌、一把椅子、一盏台灯、一排书架"。

"空无一人，无使用痕迹"： 核心禁令。直接禁止人物和任何故事性状态（如"散落的文件"、"打翻的杯子"）。场景必须是崭新的、待使用的状态。

"正交视角（正视图或45度角）"： 使用工程制图视角，放弃艺术性的"广角镜头"，保证所有线条横平竖直，易于在软件中对齐。

**示例：**

"4k，高清图，电影质感，现代北欧风格的，客厅休息区场景组件模块，开放式空间与大面积落地窗，核心包含一张浅灰色布艺沙发、一个圆形地毯、一个木质茶几和一座落地灯，材质为棉麻、橡木与金属，空无一人，无使用痕迹，组件静帧，45度角视角"

- **c、道具类：**

\`[时代/风格]背景下，[所有者身份]所属的[道具名称]，用于[核心功能]，采用[材质与工艺]制作，**呈全新或标准状态**，正交视图，纯白色背景，无阴影。\`

**关键优化说明：**

"所属的"： 弱化强烈的个人归属感，更偏向分类。

"呈全新或标准状态"： 禁止"使用痕迹"。作为元件，道具应以标准、完整的状态出现。锈迹、破损等状态应由后期特效添加，而非固化在底图上。

**示例：**

"奇幻冒险风格，冒险者所属的便携式药剂套装，用于盛装与调和药水，采用皮革与玻璃材质制作，呈全新标准状态， 正交视图，纯白色背景，无阴影。"

### 3、 信息整合与推断逻辑（调整为"设计逻辑"）

必须整合以下维度，但过滤掉所有动态、叙事和临时性状态：

- 世界观定位： 元素所处的年代、地理环境、社会背景（如"唐代长安"、"废土末日"），提供风格坐标（如"蒸汽朋克"、"盛唐"）。

- 核心身份与功能： 元素的社会阶层、职业属性，或物品的核心用途、戏剧功能（如"宫廷乐师的"、"用于暗杀的"），定义元素的基础属性（如"骑士的"、"照明的"）。

- 故事状态与痕迹： 元素的新旧、洁净、完整度等物理状态，这直接反映其经历和剧情（如"风尘仆仆的"、"严重锈蚀的"）。

- 设计规格与材质： 描述元素的标准尺寸、比例、材质、工艺和完好形态。

- 文化符号与情绪： 元素所属的亚文化、美学风格或整体情绪基调（如"赛博朋克风格"、"哥特式阴暗"、"温馨怀旧"）。

- 标志性细节： 剧本中提及或可推断的、能使元素独特的关键细节（如"眼角有疤"、"刻有家族徽记"），保留固有、非临时性的特征（如"剑格上的家徽纹样"、"枪身的制式编号"）。

- 优先顺序： 以剧本中明确描述的信息为最高优先级，其次是基于情节和上下文的强逻辑推断。对于贯穿剧情、状态发生关键变化的元素，应以其最具戏剧张力和象征意义的最终状态为准进行设计。

### 4.生成限制

- 禁止污染元素：

- a. 角色类：禁止手持物品、禁止情景化动作。

- b. 场景类：禁止出现人物、生物、及任何表示"正在使用"的痕迹（灰尘、污渍、凌乱物品）。

- c. 道具类：禁止破损、污渍、临时附加物。

- 静态与标准化： 只描述元素的固有、静态、标准化、特征性的视觉属性。

- 一个提示词只生成一个类别的单一主体（一个角色、一个场景模块、一个道具），不得描述动态场景、复杂叙事或包含多个主体
### 5.回答格式要求:
角色：
- 角色名称：[角色名称]
- AI生成提示词：[AI生成提示词]
道具：
- 道具名称：[道具名称]
- AI生成提示词：[AI生成提示词]
场景：
- 场景名称：[场景名称]
- AI生成提示词：[AI生成提示词]`

    const styleInfo = getStyleInfo(style)
    const systemPrompt = (customPrompt || defaultPrompt) + styleInfo
    const result = await this.generateContent(systemPrompt, `剧本如下：\n${scriptText}`)

    console.log('[DeepSeekService] API返回结果:', result)
    console.log('[DeepSeekService] 返回文本长度:', result.text?.length || 0)
    console.log('[DeepSeekService] 返回文本前500字符:', result.text?.substring(0, 500))

    if (!result.success) {
      return { success: false, error: result.error }
    }

    try {
      const parsed = this.parseAnalysisResult(result.text || '')
      console.log('[DeepSeekService] 解析结果:', parsed)
      return { success: true, ...parsed }
    } catch (err) {
      console.error('[DeepSeekService] 解析失败:', err)
      return { 
        success: true, 
        characters: [], 
        props: [], 
        scenes: [] 
      }
    }
  }

  private parseAnalysisResult(text: string): {
    characters: Array<{ name: string; prompt: string }>
    props: Array<{ name: string; prompt: string }>
    scenes: Array<{ name: string; prompt: string }>
  } {
    console.log('[DeepSeekService] 开始解析文本, 长度:', text.length)
    
    const characters: Array<{ name: string; prompt: string }> = []
    const props: Array<{ name: string; prompt: string }> = []
    const scenes: Array<{ name: string; prompt: string }> = []

    const cleanPrompt = (prompt: string): string => {
      return prompt
        .replace(/`/g, '')
        .replace(/\*\*/g, '')
        .replace(/^>\s*/gm, '')
        .trim()
    }

    const cleanLabel = (line: string): string => {
      return line.replace(/^[-*#\s]+/, '').replace(/\*\*/g, '').trim()
    }

    const extractItems = (sectionText: string, type: 'character' | 'prop' | 'scene') => {
      const targetArray = type === 'character' ? characters : type === 'scene' ? scenes : props
      const namePrefix = type === 'character' ? '角色名称' : type === 'scene' ? '场景名称' : '道具名称'
      
      const lines = sectionText.split('\n')
      let currentName: string | null = null
      
      for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim()
        const cleaned = cleanLabel(trimmedLine)
        
        if (cleaned.startsWith(`${namePrefix}：`) || cleaned.startsWith(`${namePrefix}:`)) {
          currentName = cleaned.split(/[：:]/g).slice(1).join('：').replace(/\*\*/g, '').trim()
          console.log(`[DeepSeekService] 发现${type}名称:`, currentName)
        } else if (cleaned.startsWith('AI生成提示词：') || cleaned.startsWith('AI生成提示词:')) {
          let prompt = cleaned.split(/[：:]/g).slice(1).join('：').trim()
          
          if (!prompt && i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim()
            if (nextLine.startsWith('`') || nextLine.length > 20) {
              prompt = nextLine
              i++
            }
          }
          
          if (currentName && prompt) {
            targetArray.push({ name: currentName, prompt: cleanPrompt(prompt) })
            console.log(`[DeepSeekService] 提取完成 - 名称: ${currentName}, 提示词长度: ${prompt.length}`)
          }
          currentName = null
        }
      }
    }

    // 方式1：标准格式
    let sections = text.split(/(?=^角色：|^道具：|^场景：)/m)
    
    let foundSections = false
    for (const section of sections) {
      const trimmedSection = section.trim()
      if (trimmedSection.startsWith('角色：')) {
        extractItems(trimmedSection, 'character')
        foundSections = true
      } else if (trimmedSection.startsWith('道具：')) {
        extractItems(trimmedSection, 'prop')
        foundSections = true
      } else if (trimmedSection.startsWith('场景：')) {
        extractItems(trimmedSection, 'scene')
        foundSections = true
      }
    }

    // 方式2：Markdown 标题格式
    if (!foundSections || (characters.length === 0 && props.length === 0 && scenes.length === 0)) {
      console.log('[DeepSeekService] 标准格式未匹配，尝试 Markdown 标题格式')
      sections = text.split(/(?=^#{1,3}\s*.*角色|^#{1,3}\s*.*道具|^#{1,3}\s*.*场景)/m)
      
      for (const section of sections) {
        const trimmedSection = section.trim()
        if (/^#{1,3}\s*.*角色/.test(trimmedSection)) {
          extractItems(trimmedSection, 'character')
        } else if (/^#{1,3}\s*.*道具/.test(trimmedSection)) {
          extractItems(trimmedSection, 'prop')
        } else if (/^#{1,3}\s*.*场景/.test(trimmedSection)) {
          extractItems(trimmedSection, 'scene')
        }
      }
    }

    // 方式3：全文逐行扫描（兼容 **角色：** 这种 DeepSeek 常见格式）
    if (characters.length === 0 && props.length === 0 && scenes.length === 0) {
      console.log('[DeepSeekService] 尝试全文逐行扫描')
      const lines = text.split('\n')
      let currentType: 'character' | 'prop' | 'scene' | null = null
      let currentName: string | null = null

      for (let i = 0; i < lines.length; i++) {
        const cleaned = cleanLabel(lines[i].trim())
        
        if (/角色/.test(cleaned) && cleaned.length < 20) currentType = 'character'
        else if (/道具/.test(cleaned) && cleaned.length < 20) currentType = 'prop'
        else if (/场景/.test(cleaned) && cleaned.length < 20) currentType = 'scene'
        
        if (cleaned.startsWith('角色名称：') || cleaned.startsWith('角色名称:')) {
          currentType = 'character'
          currentName = cleaned.split(/[：:]/g).slice(1).join('：').trim()
        } else if (cleaned.startsWith('道具名称：') || cleaned.startsWith('道具名称:')) {
          currentType = 'prop'
          currentName = cleaned.split(/[：:]/g).slice(1).join('：').trim()
        } else if (cleaned.startsWith('场景名称：') || cleaned.startsWith('场景名称:')) {
          currentType = 'scene'
          currentName = cleaned.split(/[：:]/g).slice(1).join('：').trim()
        } else if ((cleaned.startsWith('AI生成提示词：') || cleaned.startsWith('AI生成提示词:')) && currentName && currentType) {
          let prompt = cleaned.split(/[：:]/g).slice(1).join('：').trim()
          if (!prompt && i + 1 < lines.length) {
            prompt = lines[i + 1].trim()
            i++
          }
          if (prompt) {
            const targetArray = currentType === 'character' ? characters : currentType === 'scene' ? scenes : props
            targetArray.push({ name: currentName, prompt: cleanPrompt(prompt) })
            console.log(`[DeepSeekService] 全文扫描提取 - 类型: ${currentType}, 名称: ${currentName}`)
          }
          currentName = null
        } else if (currentType && !currentName && cleaned.endsWith('：') || cleaned.endsWith(':')) {
          // 兜底：DeepSeek 有时直接用 "皇后：" 而不是 "角色名称：皇后"
          const possibleName = cleaned.replace(/[：:]$/, '').trim()
          if (possibleName && possibleName.length < 30 && !possibleName.includes('提示词') && !possibleName.includes('生成')) {
            // 检查下一行是否是 AI生成提示词
            if (i + 1 < lines.length) {
              const nextCleaned = cleanLabel(lines[i + 1].trim())
              if (nextCleaned.startsWith('AI生成提示词') || nextCleaned.startsWith('纯白色背景') || nextCleaned.startsWith('"纯白色背景')) {
                currentName = possibleName
                console.log(`[DeepSeekService] 兜底匹配名称 - 类型: ${currentType}, 名称: ${currentName}`)
              }
            }
          }
        }
      }
    }

    console.log('[DeepSeekService] 最终解析结果 - 角色:', characters.length, '道具:', props.length, '场景:', scenes.length)
    return { characters, props, scenes }
  }

  async generateShots(
    scriptText: string,
    style: string,
    mode: 'dialogue' | 'narration' = 'dialogue',
    customPrompt?: string
  ): Promise<{
    success: boolean
    shots?: Array<{
      shotNumber: string
      novelText: string
      scene: string
      imagePrompt: string
      videoPrompt: string
      characters: string[]
      props: string
    }>
    error?: string
  }> {
    const styleInfo = getStyleInfo(style)
    const effectivePrompt = customPrompt || (mode === 'narration' ? DEFAULT_NARRATION_SHOT_PROMPT : DEFAULT_DIALOGUE_SHOT_PROMPT)
    const systemPrompt = effectivePrompt + styleInfo

    // 预处理：提取角色信息和纯文案
    const preprocessed = preprocessScript(scriptText)

    // 尝试按形象切换标记分批（解说模式）
    const styleSegments = mode === 'narration' ? splitByStyleMarkers(scriptText) : null

    // 将剧本拆分为多个批次的辅助方法
    const splitScriptIntoBatches = (): string[] | null => {
      if (mode === 'narration') {
        if (styleSegments && styleSegments.length > 1) {
          return null // 形象段落分批在下面单独处理
        }
        const contentLines = preprocessed.scriptContent.split('\n').map(l => l.trim()).filter(l => l.length > 0)
        if (contentLines.length <= 5) return null
        const batches: string[] = []
        for (let i = 0; i < contentLines.length; i += 5) {
          batches.push(contentLines.slice(i, i + 5).join('\n'))
        }
        return batches
      } else {
        const scenePattern = /(?:^|\n)(【场景[^】]*】[^\n]*)/g
        const scenes: string[] = []
        let lastIndex = 0
        let match: RegExpExecArray | null
        
        while ((match = scenePattern.exec(scriptText)) !== null) {
          if (scenes.length > 0) {
            scenes[scenes.length - 1] = scriptText.substring(lastIndex, match.index).trim()
          }
          scenes.push('')
          lastIndex = match.index
        }
        if (scenes.length > 0) {
          scenes[scenes.length - 1] = scriptText.substring(lastIndex).trim()
        }
        
        if (scenes.length === 0) {
          const parts = scriptText.split(/\n---+\n/).map(s => s.trim()).filter(s => s.length > 0)
          if (parts.length > 1) scenes.push(...parts)
        }
        
        if (scenes.length <= 2) return null
        
        const MAX_SCENES_PER_BATCH = 2
        const batches: string[] = []
        for (let i = 0; i < scenes.length; i += MAX_SCENES_PER_BATCH) {
          batches.push(scenes.slice(i, i + MAX_SCENES_PER_BATCH).join('\n\n---\n\n'))
        }
        return batches
      }
    }

    const batches = splitScriptIntoBatches()

    // 形象段落分批处理（解说模式专用）
    if (styleSegments && styleSegments.length > 1 && mode === 'narration') {
      console.log(`[DeepSeekService] 解说模式按形象段落分批: ${styleSegments.length} 批`)
      
      const allShots: Array<{
        shotNumber: string; novelText: string; scene: string
        imagePrompt: string; videoPrompt: string; characters: string[]; props: string
      }> = []
      let globalShotIndex = 0

      for (let i = 0; i < styleSegments.length; i++) {
        const seg = styleSegments[i]
        const batchNum = i + 1
        console.log(`[DeepSeekService] 处理形象段落 ${batchNum}/${styleSegments.length}: ${seg.styleContext || '无形象标记'}`)
        
        const charInfoPrefix = preprocessed.characterInfo ? `${preprocessed.characterInfo}\n\n` : ''
        const stylePrefix = seg.styleContext ? `【当前形象设定】${seg.styleContext}\n\n` : ''
        const batchContext = i > 0 
          ? `${charInfoPrefix}${stylePrefix}（这是第${batchNum}批，镜头号从 ${String(globalShotIndex + 1).padStart(2, '0')} 开始编号）\n\n剧本如下：\n${seg.content}`
          : `${charInfoPrefix}${stylePrefix}剧本如下：\n${seg.content}`
        
        const result = await this.generateContent(systemPrompt, batchContext)
        
        if (!result.success) {
          console.error(`[DeepSeekService] 形象段落 ${batchNum} 生成失败:`, result.error)
          continue
        }

        try {
          const batchShots = this.parseShotsResult(result.text || '', mode)
          for (const shot of batchShots) {
            globalShotIndex++
            shot.shotNumber = String(globalShotIndex).padStart(2, '0')
            allShots.push(shot)
          }
          console.log(`[DeepSeekService] 形象段落 ${batchNum} 解析出 ${batchShots.length} 个镜头，累计 ${allShots.length} 个`)
        } catch (err) {
          console.error(`[DeepSeekService] 形象段落 ${batchNum} 解析失败:`, err)
        }
      }

      console.log(`[DeepSeekService] 形象段落分批完成，共 ${allShots.length} 个镜头`)
      return { success: allShots.length > 0, shots: allShots }
    }

    if (batches && batches.length > 1) {
      const modeLabel = mode === 'narration' ? '解说' : '对话'
      console.log(`[DeepSeekService] ${modeLabel}模式分批处理: ${batches.length} 批`)
      
      const allShots: Array<{
        shotNumber: string; novelText: string; scene: string
        imagePrompt: string; videoPrompt: string; characters: string[]; props: string
      }> = []
      let globalShotIndex = 0

      for (let i = 0; i < batches.length; i++) {
        const batchNum = i + 1
        console.log(`[DeepSeekService] 处理第 ${batchNum}/${batches.length} 批`)
        
        const charInfoPrefix = preprocessed.characterInfo ? `${preprocessed.characterInfo}\n\n` : ''
        const batchContext = i > 0 
          ? `${charInfoPrefix}（这是第${batchNum}批，镜头号从 ${String(globalShotIndex + 1).padStart(2, '0')} 开始编号）\n\n剧本如下：\n${batches[i]}`
          : `${charInfoPrefix}剧本如下：\n${batches[i]}`
        
        const result = await this.generateContent(systemPrompt, batchContext)
        
        if (!result.success) {
          console.error(`[DeepSeekService] 第 ${batchNum} 批生成失败:`, result.error)
          continue
        }

        console.log(`[DeepSeekService] 第 ${batchNum} 批响应长度:`, result.text?.length)

        try {
          const batchShots = this.parseShotsResult(result.text || '', mode)
          for (const shot of batchShots) {
            globalShotIndex++
            shot.shotNumber = String(globalShotIndex).padStart(2, '0')
            allShots.push(shot)
          }
          console.log(`[DeepSeekService] 第 ${batchNum} 批解析出 ${batchShots.length} 个镜头，累计 ${allShots.length} 个`)
        } catch (err) {
          console.error(`[DeepSeekService] 第 ${batchNum} 批解析失败:`, err)
        }
      }

      console.log(`[DeepSeekService] 分批处理完成，共 ${allShots.length} 个镜头`)
      return { success: allShots.length > 0, shots: allShots }
    }

    // 短剧本：一次性处理
    const result = await this.generateContent(systemPrompt, `${preprocessed.characterInfo ? preprocessed.characterInfo + '\n\n' : ''}剧本如下：\n${preprocessed.scriptContent || scriptText}`)

    console.log('[DeepSeekService] ========== 分镜生成原始响应 ==========')
    console.log('[DeepSeekService] 成功:', result.success)
    console.log('[DeepSeekService] 错误:', result.error)
    console.log('[DeepSeekService] 响应文本长度:', result.text?.length)
    console.log('[DeepSeekService] 响应文本前2000字符:')
    console.log(result.text?.substring(0, 2000))
    console.log('[DeepSeekService] ========== 原始响应结束 ==========')

    if (!result.success) {
      return { success: false, error: result.error }
    }

    try {
      const shots = this.parseShotsResult(result.text || '', mode)
      console.log('[DeepSeekService] 分镜解析结果:', shots.length, '个镜头')
      console.log('[DeepSeekService] 解析出的分镜:', JSON.stringify(shots, null, 2))
      return { success: true, shots }
    } catch (err) {
      console.error('[DeepSeekService] 分镜解析失败:', err)
      return { success: false, shots: [] }
    }
  }

  public parseShotsResult(text: string, mode: 'dialogue' | 'narration' = 'dialogue'): Array<{
    shotNumber: string
    novelText: string
    scene: string
    imagePrompt: string
    videoPrompt: string
    characters: string[]
    props: string
  }> {
    console.log('[DeepSeekService] 开始解析分镜结果, 文本长度:', text.length)
    
    const cleanName = (name: string): string => {
      let cleaned = name
        .replace(/^[a-zA-Z]\.\s*/i, '')
        .replace(/^[a-zA-Z]\s*/i, '')
        .replace(/\s*\([^)]*\)\s*$/g, '')
        .replace(/\s*（[^）]*）\s*$/g, '')
        .replace(/\*\*/g, '') // 移除 Markdown 加粗标记
        .trim()
      return cleaned || name
    }

    // 过滤掉导演自检、Checklist等非人物/非道具内容
    const isJunkContent = (text: string): boolean => {
      const junkKeywords = [
        '导演自检', '构图自检', '动态逻辑', '叙事张力',
        'Checklist', '氛围检查', '信息检查', '情感检查', '风格统一', '镜头连贯',
        '构图检查', '关系检查', '稳定性', '镜头完整性',
        '叙事检查', '视觉密度', '情绪匹配', '运镜专业', '动作分解', '节奏控制', '配音标注',
        '大门', '桌子', '椅子', '墙壁', '窗户',
      ]
      return junkKeywords.some(kw => text.includes(kw))
    }
    
    const shots: Array<{
      shotNumber: string
      novelText: string
      scene: string
      imagePrompt: string
      videoPrompt: string
      characters: string[]
      props: string
    }> = []

    const lines = text.split('\n')
    const tableRows: string[] = []
    let headerFound = false
    let currentShot = ''
    const shotStartPattern = /^\|\s*\*{0,2}\d{1,3}\*{0,2}\s*\|/
    let hasImagePromptCol = true

    for (const line of lines) {
      const trimmedLine = line.trim()

      if (!headerFound && (
        trimmedLine.includes('| 镜头号 |') ||
        trimmedLine.includes('|旁白/字幕|') ||
        trimmedLine.includes('|小说文案|') ||
        trimmedLine.includes('**镜头号**') ||
        trimmedLine.includes('| :---')
      )) {
        headerFound = true
        if (trimmedLine.includes('生图提示词') || trimmedLine.includes('生图')) {
          hasImagePromptCol = true
        } else if (trimmedLine.includes('镜头号') || trimmedLine.includes('小说文案')) {
          hasImagePromptCol = false
        }
        continue
      }

      if (headerFound && /^\|[\s:*-]+\|/.test(trimmedLine)) {
        continue
      }

      if (headerFound && trimmedLine) {
        if (shotStartPattern.test(trimmedLine)) {
          if (currentShot) {
            tableRows.push(currentShot)
          }
          currentShot = trimmedLine
        } else if (currentShot) {
          if (trimmedLine.startsWith('|')) {
            currentShot += '\n' + trimmedLine
          } else {
            currentShot += ' ' + trimmedLine
          }
        }
      }
    }

    if (currentShot) {
      tableRows.push(currentShot)
    }
    
    console.log('[DeepSeekService] 表格行数:', tableRows.length)
    
    for (let i = 0; i < tableRows.length; i++) {
      const row = tableRows[i]
      const rowLines = row.split('\n')
      const cells: string[] = []
      
      for (let lineIdx = 0; lineIdx < rowLines.length; lineIdx++) {
        const rowLine = rowLines[lineIdx]
        if (!rowLine.trim()) continue
        
        const lineCells = rowLine.split('|').map(c => c.trim()).filter(c => c)
        
        if (lineIdx === 0) {
          cells.push(...lineCells)
        } else {
          for (let j = 0; j < lineCells.length; j++) {
            if (j < cells.length) {
              cells[j] += ' ' + lineCells[j]
            } else {
              cells.push(lineCells[j])
            }
          }
        }
      }

      console.log(`[DeepSeekService] 第${i}行:`, cells.length, '列', 'mode:', mode)

      if (cells.length >= 4 && !cells[0].includes('---') && !cells[0].includes('镜头号')) {
        const characters: string[] = []
        let props = ''
        let scene = ''
        let novelText = ''
        let imagePrompt = ''
        let videoPrompt = ''

        if (mode === 'narration') {
          novelText = cells[1] || ''
          imagePrompt = (cells[2] || '').replace(/\*\*/g, '') // 清理 Markdown 标记
          videoPrompt = (cells[3] || '').replace(/\*\*/g, '') // 清理 Markdown 标记
          scene = ''
          props = ''
          for (let j = 4; j < cells.length; j++) {
            const cell = cells[j]
            if (cell && cell !== '无' && cell !== '-' && cell !== '/') {
              characters.push(cleanName(cell.trim()))
            }
          }
        } else {
          // dialogue 模式：根据表头是否有生图提示词列来决定列映射
          const novelTextIdx = 1
          const sceneIdx = 2
          let imagePromptIdx: number
          let videoPromptIdx: number
          let charsStartIdx: number

          if (hasImagePromptCol) {
            // 有生图提示词列：镜头号 | 小说文案 | 场景 | 生图提示词 | 视频提示词 | 人物1-8 | 道具
            imagePromptIdx = 3
            videoPromptIdx = 4
            charsStartIdx = 5
          } else {
            // 无生图提示词列（文生视频）：镜头号 | 小说文案 | 场景 | 视频提示词 | 人物1-8 | 道具 | 音效
            imagePromptIdx = -1
            videoPromptIdx = 3
            charsStartIdx = 4
          }

          novelText = cells[novelTextIdx] || ''
          scene = cleanName(cells[sceneIdx] || '')
          imagePrompt = imagePromptIdx >= 0 ? (cells[imagePromptIdx] || '').replace(/\*\*/g, '') : '' // 清理 Markdown 标记
          videoPrompt = (cells[videoPromptIdx] || '').replace(/\*\*/g, '') // 清理 Markdown 标记

          // 解析人物和道具
          if (hasImagePromptCol) {
            // 原有逻辑
            if (cells.length >= 14) {
              for (let j = 5; j <= 12; j++) {
                const cell = cells[j]
                if (cell && cell !== '无' && cell !== '-' && cell !== '/') {
                  const cleanedCell = cleanName(cell.trim())
                  if (!isJunkContent(cleanedCell)) {
                    characters.push(cleanedCell)
                  }
                }
              }
              const propsCell = cells[13] || ''
              if (propsCell && !isJunkContent(propsCell)) {
                props = cleanName(propsCell)
              }
            } else if (cells.length >= 9) {
              for (let j = 5; j <= 7; j++) {
                const cell = cells[j]
                if (cell && cell !== '无' && cell !== '-' && cell !== '/') {
                  const cleanedCell = cleanName(cell.trim())
                  if (!isJunkContent(cleanedCell)) {
                    characters.push(cleanedCell)
                  }
                }
              }
              const propsCell = cells[8] || ''
              if (propsCell && !isJunkContent(propsCell)) {
                props = cleanName(propsCell)
              }
            } else if (cells.length >= 7) {
              for (let j = 5; j < cells.length - 1; j++) {
                const cell = cells[j]
                if (cell && cell !== '无' && cell !== '-' && cell !== '/') {
                  const cleanedCell = cleanName(cell.trim())
                  if (!isJunkContent(cleanedCell)) {
                    characters.push(cleanedCell)
                  }
                }
              }
              const propsCell = cells[cells.length - 1] || ''
              if (propsCell && !isJunkContent(propsCell)) {
                props = cleanName(propsCell)
              }
            }
          } else {
            // 文生视频模式：人物从 charsStartIdx 开始，最后两列可能是道具和音效
            const totalRemaining = cells.length - charsStartIdx
            if (totalRemaining >= 10) {
              // 8人物 + 道具 + 音效
              for (let j = charsStartIdx; j < charsStartIdx + 8; j++) {
                const cell = cells[j]
                if (cell && cell !== '无' && cell !== '-' && cell !== '/' && cell !== '—') {
                  const cleanedCell = cleanName(cell.trim())
                  if (!isJunkContent(cleanedCell)) {
                    characters.push(cleanedCell)
                  }
                }
              }
              const propsCell = cells[charsStartIdx + 8] || ''
              if (propsCell && !isJunkContent(propsCell)) {
                props = cleanName(propsCell)
              }
            } else if (totalRemaining >= 2) {
              for (let j = charsStartIdx; j < cells.length - 2; j++) {
                const cell = cells[j]
                if (cell && cell !== '无' && cell !== '-' && cell !== '/' && cell !== '—') {
                  const cleanedCell = cleanName(cell.trim())
                  if (!isJunkContent(cleanedCell)) {
                    characters.push(cleanedCell)
                  }
                }
              }
              const propsCell = cells[cells.length - 2] || ''
              if (propsCell && !isJunkContent(propsCell)) {
                props = cleanName(propsCell)
              }
            }
          }
        }

        const shot = {
          shotNumber: cells[0]?.replace(/\*\*/g, '').trim() || String(i).padStart(2, '0'),
          novelText,
          scene,
          imagePrompt,
          videoPrompt,
          characters,
          props
        }

        console.log('[DeepSeekService] 解析镜头:', shot.shotNumber, '人物:', characters.join(','), '道具:', props)
        shots.push(shot)
      }
    }

    if (shots.length === 0) {
      console.log('[DeepSeekService] 表格解析失败，尝试字段标签格式')
      
      const shotPattern = /镜头\s+([^\n]+)/gi
      let match
      let shotIndex = 0
      
      while ((match = shotPattern.exec(text)) !== null) {
        shotIndex++
        const shotStart = match.index
        const nextShotMatch = text.substring(shotStart + 1).match(/镜头\s+[^\n]+/i)
        const shotEnd = nextShotMatch ? shotStart + 1 + nextShotMatch.index! : text.length
        const shotText = text.substring(shotStart, shotEnd)
        
        console.log(`[DeepSeekService] 找到镜头块 ${shotIndex}:`, shotText.substring(0, 100))
        
        const extractField = (fieldName: string): string => {
          const pattern = new RegExp(`${fieldName}[：:]\\s*([^\\n]*(?:\\n(?!小说文案|场景|生图提示词|视频提示词|参与人物|道具|镜头)[^\\n]*)*)`, 'i')
          const fieldMatch = shotText.match(pattern)
          return fieldMatch ? fieldMatch[1].trim() : ''
        }
        
        const sceneFromHeader = match[1]?.trim() || ''
        
        const novelTextRaw = extractField('小说文案')
        const sceneRaw = extractField('场景')
        const imagePromptRaw = extractField('生图提示词')
        const videoPromptRaw = extractField('视频提示词')
        const charactersRaw = extractField('参与人物')
        const propsRaw = extractField('道具')
        
        const novelText = novelTextRaw || ''
        const scene = cleanName(sceneRaw || sceneFromHeader)
        const imagePrompt = imagePromptRaw || ''
        const videoPrompt = videoPromptRaw || ''
        const props = cleanName(propsRaw || '')
        
        let characters: string[] = []
        if (charactersRaw && charactersRaw.trim() && charactersRaw !== '无' && charactersRaw !== '-') {
          characters = charactersRaw.split(/[,，、]/).map(s => cleanName(s.trim())).filter(s => s && s !== '无' && s !== '-')
        }

        const shot = {
          shotNumber: String(shotIndex).padStart(2, '0'),
          novelText,
          scene,
          imagePrompt,
          videoPrompt,
          characters,
          props
        }
        
        console.log('[DeepSeekService] 解析镜头:', shot.shotNumber)
        console.log('  小说文案:', novelText.substring(0, 50))
        console.log('  场景:', scene.substring(0, 50))
        console.log('  生图提示词:', imagePrompt.substring(0, 50))
        console.log('  视频提示词:', videoPrompt.substring(0, 50))
        console.log('  人物:', characters.join(','))
        console.log('  道具:', props.substring(0, 30))
        
        shots.push(shot)
      }
    }

    console.log('[DeepSeekService] 最终解析镜头数:', shots.length)
    return shots
  }
}

let deepseekServiceInstance: DeepSeekService | null = null

export async function getDeepSeekService(): Promise<DeepSeekService> {
  if (!deepseekServiceInstance) {
    const { useAppStore } = await import('../store/appStore')
    const { apiConfigs } = useAppStore.getState()
    const yunwuConfig = apiConfigs.yunwu
    deepseekServiceInstance = new DeepSeekService({
      apiKey: yunwuConfig?.apiKey || '',
      endpoint: yunwuConfig?.endpoint || DEFAULT_CONFIG.endpoint,
      model: 'deepseek-v3.2-thinking',
    })
  }
  return deepseekServiceInstance
}

export function resetDeepSeekService(): void {
  deepseekServiceInstance = null
}
