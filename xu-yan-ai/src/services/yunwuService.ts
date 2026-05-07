
﻿import { getStyleInfo } from '../config/stylePresets'
import { preprocessScript, splitByStyleMarkers } from '../utils/scriptPreprocessor'



export const DEFAULT_DIALOGUE_SHOT_PROMPT = `# Role: 资深电影导演 & 摄影指导 (专注于场面调度与构图美学)
# Task: 将剧本拆解为**构图考究、空间感强、叙事张力足**的工业级分镜表。

## 1. 核心叙事与剪辑逻辑

### A. 动作拆分原则
- **核心**: 将一个剧本动作拆分为 2-4 个镜头，**严禁连续使用同一种景别**。
- **拆解逻辑**: 中景(交代关系) -> 特写(情绪/细节) -> 全景(环境/结果)。

### B. 情绪因果逻辑
- **因果链**: 上一镜 Action -> 下一镜 Reaction。
- **连贯性**: 确保人物的情绪反应是对上一镜事件的直接回馈。

### C. 叙事节奏：铺垫-爆发-悬念
- **铺垫**: 固定机位，环境细节。
- **爆发**: 景别跳跃，动作冲击。
- **悬念**: 留白，意味深长的结尾。

## 2. 模型生成规范 (重点升级)

### A. 生图模型：Nano Banana Pro (视觉与构图)
- **核心痛点**: 拒绝平铺直叙的站位。必须强调 **[人物与环境的互动]** 和 **[人物间的空间张力]**。
- **Prompt结构**: 
  [构图与视线引导(CN)], [主体站位与互动(CN)], [环境纵深与前景遮挡(CN)], [特定焦段(Lens)], [光影(CN)], [Global Style Lock]
  
- **必须植入的"电影感"构图技法 (至少选一种)**:
  1.  **前景遮挡**: 透过前景物体（如车窗、叶子、栏杆）拍摄主体，增加窥视感和纵深。
  2.  **对手戏 (OTS / Reverse Shot)**: 拒绝单一，严禁所有对话镜头都使用过肩（OTS）。根据剧情张力合力分配以下镜头。高级空间关系：  纵深分离、高低位关系、侧面双人景、L型/背对构图、镜像/反射**等
  3.  **景深分离**: 主体A在前景虚化，主体B在远景对焦（或反之），强调叙事重点。
  4.  **框架构图**: 利用门框、窗户、镜子将人物框住，体现局促或孤独。
  5.  **三角构图**: 多人场景中，通过高低站位形成稳定或不稳定的三角关系。
  
- **示例**:
  *错误*: 两个人站在废墟里对话, 50mm...
  *正确*: (过肩镜头，前景是A模糊的肩膀), B站在废墟深处，阳光从破洞射入照亮B的脸，(框架构图，B被钢筋结构框住), Shot on 50mm, f/2.8...

### B. 运镜参考库（重要）

以下是专业运镜术语，请根据场景情绪和角色动作合理选择：

#### ① 基础运镜
- **跟拍**：镜头跟随角色移动，保持相对位置不变，适合展示行进过程
- **平移**：镜头水平移动，展示环境或多人互动，节奏平稳
- **推镜头**：镜头向前推进，突出主体或情绪变化，营造紧张感
- **拉远**：镜头向后拉远，展示全局或孤独感，情绪舒缓
- **环绕运镜**：镜头围绕主体旋转，360度展示，强调主体重要性

#### ② 情绪强化运镜
- **特写镜头**：聚焦面部或细节，强烈表达情绪变化
- **希区柯克运镜**：推镜头+变焦拉远同时使用，制造眩晕和不安感
- **低角度急推镜头**：从下往上快速推进，增强压迫感和冲击力
- **荷兰角滚转推运镜**：倾斜角度+推进，表现混乱、失衡、精神异常

#### ③ 视角切换运镜
- **过肩镜头**：越过一角色肩膀拍摄另一角色，建立空间关系
- **反打镜头**：切换对立视角，对话场景中交替使用
- **POV第一人称运镜**：模拟角色视角，增强代入感
- **ACT视角运镜**：游戏第三人称跟随视角，适合动作场景

#### ④ 特殊效果运镜
- **摇臂上升运镜**：从低处上升到高处，展现宏观场景或命运转折
- **FPV运镜**：第一人称视角飞行，快速穿梭，动感强烈
- **手持感运镜**：模拟手持摄影的轻微晃动，增强真实感和紧张感
- **慢动作运镜**：关键瞬间放慢，突出动作细节或情绪爆发
- **跳切镜头**：同一场景突然跳跃剪辑，表现时间流逝或心理断裂
- **定格**：画面突然静止，强调关键时刻或内心独白

#### ⑤ 环境运镜
- **空景**：无人物的环境镜头，用于转场、氛围铺垫或情绪缓冲

**运镜选择原则（严格遵守）：**
1. 运镜必须服务于情绪表达，不能为了炫技而使用
2. 对话场景优先使用：过肩镜头、反打镜头、特写镜头、平移
3. 动作场景优先使用：跟拍、低角度急推、FPV运镜、手持感运镜
4. 情绪转折使用：希区柯克运镜、荷兰角、慢动作、推镜头
5. 场景切换使用：空景、拉远、摇臂上升运镜
6. 同一场景内景别要有变化，严禁连续使用相同运镜
7. 运镜描述要简洁，与角色动作、情绪、氛围相匹配

**使用示例：**
- 正确：'[特写镜头] 张三瞳孔骤缩，额角渗出冷汗，嘴唇微微颤抖'
- 正确：'[过肩镜头-反打] 李四越过王五肩膀，眼神锐利如刀'
- 正确：'[缓慢平移] 两人对坐无言，空气中弥漫着紧张感，烛光摇曳'
- 正确：'[希区柯克运镜] 主角听到噩耗，世界仿佛天旋地转'
- 错误：'[荷兰角滚转推运镜] 两人正常聊天'（情绪不符）
- 错误：'[慢动作运镜] 角色坐下喝水'（动作平凡不适合）

### C. 视频提示词规则（重要简化）
- **核心要求**：简洁动态描述，20-40字以内，一两句话概括
- **格式**：[运镜方式] + [主体动作变化] + [环境氛围]
- **示例**：
  - [缓推镜头] 人物缓缓转身，衣袂随风飘动，背景薄雾弥漫
  - [固定机位] 角色低头沉思，手指轻敲桌面，光线从窗外斜射
  - [缓慢横移] 两人对视无言，空气中弥漫着紧张感，烛光摇曳
- **严禁事项**：
  - ❌ 不要写时间轴分段（0-1.6s、1.6-3.2s...）
  - ❌ 不要写秒数或精确时长
  - ❌ 不要写分步动作剧本
  - ❌ 不要超过50字
- **正确做法**：
  - ✅ 使用动态动词（转身、抬头、缓缓、凝视）
  - ✅ 描述画面整体动态和氛围
  - ✅ 保持简洁，AI视频模型会自动处理节奏

## 3. 表格输出规范

请生成包含以下14列的表格。

1.  **镜头号**: 序号 (01, 02...)
2.  **小说文案**: 旁白/字幕，Max 40字节。
3.  **场景**: 简短中文环境描述。
4.  **生图提示词**: 
    - 每个字段独占一行，格式如下：
    拍摄景别：[全景/中景/近景/特写/面部特写]
    人物景别：[全景/中景/近景/特写/面部特写]
    视角：[平视/俯视/仰视/过肩视角等]
    构图：[前景遮挡/框架/纵深/三分法/对称等]
    核心主体：[参考图1是："人物名"/参考图2是："人物名"等]
    情绪动作：[人物具体动作和表情]
    环境场景：[材质/物件/空间关系]
    艺术风格：[用户指定的风格]
    氛围光线：[光影描述]
    色调：[颜色系形容词]
5.  **视频提示词**: 按 WAN 2.2 规范生成。
6.  **参与人物1**: 角色名称。
7.  **参与人物2**: 角色名称。
8.  **参与人物3**: 角色名称。
9.  **参与人物4**: 角色名称。
10. **参与人物5**: 角色名称。
11. **参与人物6**: 角色名称。
12. **参与人物7**: 角色名称。
13. **参与人物8**: 角色名称。
14. **道具**: 画面关键物品。

## 4. 导演自检 Checklist
- [x] **构图检查**: 这一镜是不是太平了？有没有加**前景**？有没有用**过肩**？
- [x] **关系检查**: 人物和环境有互动吗？（比如靠在墙上、坐在阴影里，而不是单纯站着）。
- [x] **稳定性**: 视频是否以Static为主？
- [x] **风格统一**: 风格锁加上了吗？

## 5. 执行指令
请直接根据以上规范，对提供的剧本进行分镜拆解，输出完整的分镜表格。

## 系统角色
你是一位专业的动画分镜师，精通电影语言和AI动画制作流程。请根据剧本创作详细的分镜表，重点关注动画运动性、AI可执行性和叙事连贯性。请基于专业规范，为提供的剧本创作高质量、AI可执行的动画分镜。每个镜头都应该是完整叙事链中的一环，同时具备独立的美学价值和技术可行性。

## 分镜生成核心原则
### 1. 动画思维优先
- 每个镜头必须考虑时间维度（时长、运动节奏）
- 描述动态变化而非静态画面
- 考虑前后镜头衔接的流畅性
### 2. AI友好设计
- 提供清晰、具体的视觉描述
- 避免模糊、抽象的概念
- 使用AI能理解的影视术语
### 3. 叙事效率
- 每个镜头必须有明确的叙事目的
- 避免冗余镜头
- 通过镜头语言传达情绪和节奏

## 分镜生成工作流程
### 第一步：确定元素
### 第二步：剧本分析
1. 识别场景类型（对话/动作/抒情）
2. 确定节奏曲线（起承转合）
3. 标注关键情节点
### 第三步：镜头规划
1. 建立镜头：展示环境（远景/全景）
2. 关系镜头：建立角色关系（中景/过肩）
3. 动作镜头：推进情节（多角度切换）
4. 反应镜头：传达情绪（特写）
5. 结束镜头：收尾或铺垫（有意味的构图）
### 第四步：技术实现考虑
1. AI可行性：运动描述是否具体可执行
2. 一致性：角色、场景的连贯性
3. 资源效率：避免过于复杂的镜头运动
### 第五步：质量检查
- 每个镜头是否必要？
- 运动描述是否清晰？
- 时长分配是否合理？
- 转场是否流畅？

## AI融图提示词规则（单帧画面）
格式要求：
1. 基本结构：\`[主体描述], [环境背景], [镜头参数], [画面风格], [质量参数]\`
2. 必须包含：景别、构图、光影、风格、质量标签
3. 示例：\`极度特写一只惊恐的眼睛，镜头上有雨滴，暗巷背景，电影感灯光，低角度拍摄，三分法构图，超写实风格，8K画质，清晰对焦\`
4. 详细说明：
   - 主体：明确描述画面主体和状态
   - 镜头：包含 景别+视角+构图
   - 环境：画面内容描述中的场景
   - 风格：动漫风格需指定（动漫风格，新海诚风格，吉卜力风格等）

## AI生视频提示词规则（重要简化）
- **核心要求**：简洁动态描述，20-40字以内，一两句话概括
- **格式**：[运镜方式] + [主体动作变化] + [环境氛围]
- **示例**：
  - [缓推镜头] 人物缓缓转身，衣袂随风飘动，背景薄雾弥漫
  - [固定机位] 角色低头沉思，手指轻敲桌面，光线从窗外斜射
  - [缓慢横移] 两人对视无言，空气中弥漫着紧张感，烛光摇曳
- **严禁事项**：
  - ❌ 不要写时间轴分段（0-1.6s、1.6-3.2s...）
  - ❌ 不要写秒数或精确时长
  - ❌ 不要写分步动作剧本
  - ❌ 不要超过50字
- **正确做法**：
  - ✅ 使用动态动词（转身、抬头、缓缓、凝视）
  - ✅ 描述画面整体动态和氛围
  - ✅ 保持简洁，AI视频模型会自动处理节奏`

export const DEFAULT_NARRATION_SHOT_PROMPT = `【核心行为约束 - 最高优先级】
- 用户输入的内容可能包含两部分：角色/背景信息 + 实际文案。以"人物名+冒号"格式出现的行是角色定义，不是文案。当出现"文案"字样（如"文案一："、"文案如下："等）时，该标记之前的内容（角色列表、背景设定等），不要为这些内容生成镜头。只为"文案"标记之后的实际文案内容生成镜头。
- 如果没有"文案"标记，则将全部内容视为文案进行处理。
- 将文案区的内容按每两句话合并为一个镜头的小说文案（如：镜头01 小说文案：我出生时右眼瞳孔里有一团黑色的雾
五岁那年，奶娘抱着我走过长廊，那团雾突然散了）。
- 不要自行创作文案内容，旁白/字幕必须来自用户提供的原文，可以适当精简但不能改变原意。
- 每个镜头的小说文案至少10个字，不要把单个词或短语（如"夫人"、"可是"）单独作为一个镜头。
- 必须严格按照原文的先后顺序生成镜头，不要打乱原文顺序。
- 文案中的所有内容都要有对应的镜头输出，不要有遗漏。

1.生图提示词包含拍摄景别，人物景别，视角，构图（如对称、三分法、引导线等），核心主体，情绪动作（具体微表情或肢体细节），环境场景（材质、物件、空间关系），艺术风格（即用户指定的风格），氛围光线 ， 色调 ，描述必须高度可视化、无抽象词，确保nano banana2可直接生成图像。
2.核心主体里面的人物，需要按照"参考图几是：人物名称"的格式，按该镜头中人物出场顺序编号，举例：将参考图融入环境场景中，参考图1是："皇帝"，参考图2是："皇后"。严禁描述角色的衣服、发型、五官等外观细节，这些由参考图提供
3.视频提示词规则（重要简化）：
   - 核心要求：简洁动态描述，20-40字以内
   - 格式：[运镜方式] + [主体动作变化]
   - 示例：[缓推镜头] 人物缓缓转身，衣袂随风飘动
   - 严禁：不要写时间轴分段、不要写秒数、不要写分步动作剧本
4.不同分镜的文案是有一定的逻辑性的
5.分镜之间要有连贯性
6.每个分镜中小说文案不超过40个字节
7.不要修改小说中的剧本，小说中的所有剧本都要有输出，不要有遗漏
8.根据文案语义合理断句生成镜头，保证每个镜头的旁白完整且有意义
9.图片提示词核心主体里面的人物，使用"参考图X是：人物名"格式引用，严禁描述角色外观（衣服、发型、五官等）。仅当人物有特殊状态时（如受伤、脏乱）才在后面补充状态描述，比如 参考图1是："小王"(身上带有血迹)
10.图片提示词的"情绪动作"要具体完整
11.参考人物的命名完全按照文档给的人物命名来命名，不要简写
12.输出表格里面的内容要跟表头匹配，不要错位
13.同一场景中，不同分镜提示词内环境场景的风格，光线，色调都要一致，有连续性。
14.其中色调仅需对图片有颜色系形容词，不需情绪形容词。
15.环境场景提示词要具体一点，场景视角切换的时候，也有保证风格，光线，色调是一致的
16.换行不要用<br>代码格式表示出来 在表格中换好行
17.环境场景不要描述同镜头几，每一个都重新描述 写出来
18.如果在同一个场景下，场景提示词一定要统一精准，也要考虑多角度，提示词要精准仔细
19.生图提示词在单元格内每个字段独占一行（拍摄景别一行、人物景别一行、视角一行...），不要用+号或逗号连成一整段
20.如果当前很多镜头是在同一个场景下对话，那么提示词要给到场景的多角度做到镜头的切换和场景的统一
21.两人对话的场景分镜头就给上两个人的上半身视角或者是谁的过肩视角看谁，适当要点别的场景进行过渡，比如讲话的时候会有别的镜头只要不是露脸的镜头来进行场景过渡,或者是自己说话
22.两人对话的场景环境场景要遵循当前环境场景的布局，而不是环境场景和人物变为说话的人的背景，注意人物和环境相对位置关系
23.当镜头切换景别或视角时，环境场景的描述可以调整细节（如虚化、强调某部分），但不得改变或遗漏核心元素
24.生图提示词的描述要直观和客观不可出现"鲤鱼越出面，飞的很高，就像是长了翅膀一样"类似于这种提示词就不要出现
25.同一个场景的镜头衔接要流畅，不可出现下一个镜头和上一个镜头是一个视角的情况
26.环境场景中不要把人物放到背景中，并且要注意人物环境的位置关系
27.一段对话中比如谁谁谁说的一段话，你可以拆分为几个镜头，比如第一个镜头是她的动作上半身说话的场景，第二个镜头可能会转向对面的上半身或者过肩视角，或者是当前动作的特写，亦或者是视线的描写，把一段话拆分为多个镜头
28.如果出现回忆或者心理活动描写，给出相应文案的画面，不要一直在同一场景和同一人物的人身上
29.相邻的景别不要连续出现，比如上一个景别是中景那么下一个分镜不要是中景两边的近景或者全景

3. 表格输出规范

请生成包含以下12列的表格。

1. **镜头号**: 序号 (01, 02...)
2. **旁白/字幕**: 旁白内容，Max 40字节。
3. **生图提示词**:
    - 格式如下:
    拍摄景别：[中景/近景/全景/特写/面部特写]
    人物景别：[中景/近景/全景/特写/面部特写]
    视角：[平视/俯视/仰视/过肩视角等]
    构图：[对称/三分法/引导线/中心等]
    核心主体：[参考图1是："人物名"/参考图2是："人物名"等，按出场顺序编号]
    情绪动作：[场景中具体发生的事情]
    环境场景：[材质/物件/空间关系]
    艺术风格：[用户指定的风格]
    氛围光线：[结合文案来描述氛围感]
    色调：[结合文案来描述色调]
4. **视频提示词**: 根据以下规则来
5. **参与人物1**: 角色名称。
6. **参与人物2**: 角色名称。
7. **参与人物3**: 角色名称。
8. **参与人物4**: 角色名称。
9. **参与人物5**: 角色名称。
10. **参与人物6**: 角色名称。
11. **参与人物7**: 角色名称。
12. **参与人物8**: 角色名称。

## 4. 导演自检 Checklist
- [x] **氛围检查**: 这一镜的氛围是否与旁白情绪匹配？
- [x] **信息检查**: 画面是否传递了足够的信息？
- [x] **情感检查**: 镜头是否触动了观众的情绪？
- [x] **风格统一**: 色彩和光影风格是否一致？
- [x] **镜头连贯**: 镜头衔接是否连贯？

## 视频提示词规则（重要简化）
- **核心要求**：简洁动态描述，20-40字以内，一两句话概括
- **格式**：[运镜方式] + [主体动作变化] + [环境氛围]
- **示例**：
  - [缓推镜头] 人物缓缓转身，衣袂随风飘动，背景薄雾弥漫
  - [固定机位] 角色低头沉思，手指轻敲桌面，光线从窗外斜射
  - [缓慢横移] 两人对视无言，空气中弥漫着紧张感，烛光摇曳
- **严禁事项**：
  - ❌ 不要写时间轴分段（0-1.6s、1.6-3.2s...）
  - ❌ 不要写秒数或精确时长
  - ❌ 不要写分步动作剧本
  - ❌ 不要超过50字
- **正确做法**：
  - ✅ 使用动态动词（转身、抬头、缓缓、凝视）
  - ✅ 描述画面整体动态和氛围
  - ✅ 保持简洁，AI视频模型会自动处理节奏`

export const DEFAULT_NOVEL_NARRATION_PROMPT = `【核心行为约束 - 最高优先级】
- 输入内容是小说文案，每一行就是一个独立的镜头。严格按照每一行生成一个对应的镜头，不要合并、拆分或跳过任何一行。
- 镜头的"小说文案/旁白"必须直接使用输入的原文，禁止自行创作、改写或概括。
- 所有行都要有对应的镜头输出，不要有遗漏。
- 如果输入中包含【角色参考信息】部分，仅用于理解人物关系和生成参考图引用，不要为其生成镜头。

1.生图提示词包含拍摄景别，人物景别，视角，构图（如对称、三分法、引导线等），核心主体，情绪动作（具体微表情或肢体细节），环境场景（材质、物件、空间关系），艺术风格（即用户指定的风格），氛围光线，色调。描述必须高度可视化、无抽象词，确保AI可直接生成图像。
2.核心主体里面的人物，需要按照"参考图几是：人物名称"的格式，按该镜头中人物出场顺序编号。严禁描述角色的衣服、发型、五官等外观细节，这些由参考图提供。
3.视频提示词规则（重要简化）：
   - 核心要求：简洁动态描述，20-40字以内
   - 格式：[运镜方式] + [主体动作变化]
   - 示例：[缓推镜头] 人物缓缓转身，衣袂随风飘动
   - 严禁：不要写时间轴分段、不要写秒数、不要写分步动作剧本
4.不同分镜的文案是有一定的逻辑性的
5.分镜之间要有连贯性
6.每个分镜中小说文案不超过80个字节
7.不要修改小说中的内容，所有内容都要有输出，不要有遗漏
8.图片提示词的"情绪动作"要具体完整
9.参考人物的命名完全按照小说中的人物命名来命名，不要简写
10.输出表格里面的内容要跟表头匹配，不要错位
11.同一场景中，不同分镜提示词内环境场景的风格，光线，色调都要一致，有连续性
12.其中色调仅需对图片有颜色系形容词，不需情绪形容词
13.环境场景提示词要具体一点，场景视角切换的时候，也要保证风格，光线，色调是一致的
14.生图提示词在单元格内每个字段独占一行（拍摄景别一行、人物景别一行、视角一行...），不要用+号或逗号连成一整段
15.生图提示词的描述要直观和客观
16.同一个场景的镜头衔接要流畅
17.相邻的景别不要连续出现

3. 表格输出规范

请生成包含以下12列的表格。

1. **镜头号**: 序号 (01, 02...)
2. **旁白/字幕**: 旁白内容。
3. **生图提示词**:
    - 格式如下（每个字段独占一行）:
    拍摄景别：[中景/近景/全景/特写/面部特写]
    人物景别：[中景/近景/全景/特写/面部特写]
    视角：[平视/俯视/仰视/过肩视角等]
    构图：[对称/三分法/引导线/中心等]
    核心主体：[参考图1是："人物名"/参考图2是："人物名"等]
    情绪动作：[场景中具体发生的事情]
    环境场景：[材质/物件/空间关系]
    艺术风格：[用户指定的风格]
    氛围光线：[结合文案来描述氛围感]
    色调：[结合文案来描述色调]
4. **视频提示词**: 简洁动态描述，20-40字，格式：[运镜方式] + [主体动作变化]
5-12. **参与人物1-8**: 角色名称。

## 4. 导演自检 Checklist
- [x] **氛围检查**: 这一镜的氛围是否与旁白情绪匹配？
- [x] **信息检查**: 画面是否传递了足够的信息？
- [x] **风格统一**: 色彩和光影风格是否一致？
- [x] **镜头连贯**: 镜头衔接是否连贯？

## 视频提示词规则（重要简化）
- **核心要求**：简洁动态描述，20-40字以内，一两句话概括
- **格式**：[运镜方式] + [主体动作变化]
- **示例**：
  - [缓推镜头] 人物缓缓转身，衣袂随风飘动
  - [固定机位] 角色低头沉思，手指轻敲桌面
  - [缓慢横移] 两人对视无言，空气中弥漫着紧张感
- **严禁事项**：
  - ❌ 不要写时间轴分段（0-1.6s、1.6-3.2s...）
  - ❌ 不要写秒数或精确时长
  - ❌ 不要写分步动作剧本
  - ❌ 不要超过50字
- **正确做法**：
  - ✅ 使用动态动词（转身、抬头、缓缓、凝视）
  - ✅ 描述画面整体动态和氛围
  - ✅ 保持简洁，AI视频模型会自动处理节奏`


interface YunwuGenerateContentRequest {
  systemInstruction?: {
    parts: Array<{ text: string }>
  }
  contents: Array<{
    role: 'user' | 'model'
    parts: Array<{ text: string }>
  }>
  generationConfig?: {
    temperature?: number
    topP?: number
    thinkingConfig?: {
      includeThoughts?: boolean
      thinkingBudget?: number
    }
  }
}

interface YunwuGenerateContentResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text?: string
        thoughtText?: string
      }>
      role: string
    }
    finishReason: string
  }>
  error?: {
    code: number
    message: string
    status: string
  }
}

export interface YunwuServiceConfig {
  apiKey: string
  endpoint?: string
  model?: string
}

const DEFAULT_CONFIG: Required<Omit<YunwuServiceConfig, 'apiKey'>> = {
  endpoint: 'https://yunwu.ai',
  model: 'gemini-3.1-pro-preview',
}

export class YunwuService {
  private config: Required<YunwuServiceConfig>

  constructor(config: YunwuServiceConfig) {
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
      thinkingBudget?: number
      signal?: AbortSignal
    }
  ): Promise<{ success: boolean; text?: string; thought?: string; error?: string }> {
    const { apiKey, endpoint, model } = this.config

    if (!apiKey) {
      return { success: false, error: 'API Key 未配置' }
    }

    const requestBody: YunwuGenerateContentRequest = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userMessage }],
        },
      ],
      generationConfig: {
        temperature: options?.temperature ?? 1,
        topP: options?.topP ?? 1,
        ...(model.includes('thinking') ? {
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: options?.thinkingBudget ?? 8192,
          },
        } : {}),
      },
    }

    const url = `${endpoint}/v1beta/models/${model}:generateContent?key=${apiKey}`

    try {
      console.log('[YunwuService] 发送请求')
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: options?.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, error: `HTTP ${response.status}: ${errorText}` }
      }

      const data: YunwuGenerateContentResponse = await response.json()

      if (data.error) {
        return { 
          success: false, 
          error: `${data.error.status}: ${data.error.message}` 
        }
      }

      if (!data.candidates || data.candidates.length === 0) {
        return { success: false, error: '未返回有效内容' }
      }

      const candidate = data.candidates[0]
      let text = ''
      let thought = ''

      for (const part of candidate.content.parts) {
        if (part.thoughtText) {
          thought += part.thoughtText
        }
        if (part.text) {
          text += part.text
        }
      }

      return { success: true, text, thought }
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
      systemPrompt = customPrompt + '\n\n请务必全程使用中文输出，不要输出任何英文内容。'
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
      // 过滤掉 thinking 模型可能混入的英文思考过程
      let script = result.text || ''
      const sceneMarker = script.indexOf('【场景')
      if (sceneMarker > 0) {
        // 如果【场景】前面有大段英文内容，截掉
        const beforeScene = script.substring(0, sceneMarker)
        const chineseRatio = (beforeScene.match(/[\u4e00-\u9fff]/g) || []).length / Math.max(beforeScene.length, 1)
        if (chineseRatio < 0.3) {
          script = script.substring(sceneMarker)
        }
      }
      return { success: true, script }
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
    console.log('[YunwuService] 开始分析剧本, 风格:', style)
    
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

    console.log('[YunwuService] API返回结果:', result)
    console.log('[YunwuService] 返回文本长度:', result.text?.length || 0)
    console.log('[YunwuService] 返回文本前500字符:', result.text?.substring(0, 500))

    if (!result.success) {
      return { success: false, error: result.error }
    }

    try {
      const parsed = this.parseAnalysisResult(result.text || '')
      console.log('[YunwuService] 解析结果:', parsed)
      return { success: true, ...parsed }
    } catch (err) {
      console.error('[YunwuService] 解析失败:', err)
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
    console.log('[YunwuService] 开始解析文本, 长度:', text.length)
    
    const characters: Array<{ name: string; prompt: string }> = []
    const props: Array<{ name: string; prompt: string }> = []
    const scenes: Array<{ name: string; prompt: string }> = []

    const cleanPrompt = (prompt: string): string => {
      return prompt
        .replace(/`/g, '')
        .replace(/\*\*/g, '')
        .replace(/^>\s*/gm, '')  // 去掉 > 引用符号
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
        
        // 匹配名称行：支持 "- 角色名称：xxx"、"**角色名称：xxx**"、"角色名称：xxx" 等格式
        if (cleaned.startsWith(`${namePrefix}：`) || cleaned.startsWith(`${namePrefix}:`)) {
          currentName = cleaned.split(/[：:]/g).slice(1).join('：').replace(/\*\*/g, '').trim()
          console.log(`[YunwuService] 发现${type}名称:`, currentName)
        }
        // 匹配提示词行：支持 "- AI生成提示词：xxx"、"**AI生成提示词：**"、"AI生成提示词：xxx" 等格式
        else if (cleaned.startsWith('AI生成提示词：') || cleaned.startsWith('AI生成提示词:')) {
          let prompt = cleaned.split(/[：:]/g).slice(1).join('：').trim()
          
          // 如果提示词在当前行为空，检查下一行（AI 可能把提示词放在下一行的 `` 代码块里）
          if (!prompt && i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim()
            if (nextLine.startsWith('`') || nextLine.length > 20) {
              prompt = nextLine
              i++ // 跳过下一行
            }
          }
          
          if (currentName && prompt) {
            targetArray.push({ name: currentName, prompt: cleanPrompt(prompt) })
            console.log(`[YunwuService] 提取完成 - 名称: ${currentName}, 提示词长度: ${prompt.length}`)
          }
          currentName = null
        }
      }
    }

    // 尝试多种分段方式
    // 方式1：标准格式 "角色：" / "道具：" / "场景：" 开头
    let sections = text.split(/(?=^角色：|^道具：|^场景：)/m)
    
    let foundSections = false
    for (const section of sections) {
      const trimmedSection = section.trim()
      if (trimmedSection.startsWith('角色：')) {
        console.log('[YunwuService] 找到角色section（标准格式）')
        extractItems(trimmedSection, 'character')
        foundSections = true
      } else if (trimmedSection.startsWith('道具：')) {
        console.log('[YunwuService] 找到道具section（标准格式）')
        extractItems(trimmedSection, 'prop')
        foundSections = true
      } else if (trimmedSection.startsWith('场景：')) {
        console.log('[YunwuService] 找到场景section（标准格式）')
        extractItems(trimmedSection, 'scene')
        foundSections = true
      }
    }

    // 方式2：如果标准格式没找到，尝试 Markdown 标题格式 "## 角色" / "## 道具" / "## 场景"
    if (!foundSections || (characters.length === 0 && props.length === 0 && scenes.length === 0)) {
      console.log('[YunwuService] 标准格式未匹配，尝试 Markdown 标题格式')
      sections = text.split(/(?=^#{1,3}\s*.*角色|^#{1,3}\s*.*道具|^#{1,3}\s*.*场景)/m)
      
      for (const section of sections) {
        const trimmedSection = section.trim()
        if (/^#{1,3}\s*.*角色/.test(trimmedSection)) {
          console.log('[YunwuService] 找到角色section（Markdown格式）')
          extractItems(trimmedSection, 'character')
        } else if (/^#{1,3}\s*.*道具/.test(trimmedSection)) {
          console.log('[YunwuService] 找到道具section（Markdown格式）')
          extractItems(trimmedSection, 'prop')
        } else if (/^#{1,3}\s*.*场景/.test(trimmedSection)) {
          console.log('[YunwuService] 找到场景section（Markdown格式）')
          extractItems(trimmedSection, 'scene')
        }
      }
    }

    // 方式3：如果还是没找到，把整个文本当作一个整体，按名称前缀逐行扫描
    if (characters.length === 0 && props.length === 0 && scenes.length === 0) {
      console.log('[YunwuService] Markdown格式也未匹配，尝试全文逐行扫描')
      const lines = text.split('\n')
      let currentType: 'character' | 'prop' | 'scene' | null = null
      let currentName: string | null = null

      for (let i = 0; i < lines.length; i++) {
        const cleaned = cleanLabel(lines[i].trim())
        
        // 检测当前区域类型
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
            console.log(`[YunwuService] 全文扫描提取 - 类型: ${currentType}, 名称: ${currentName}`)
          }
          currentName = null
        } else if (currentType && !currentName && cleaned.endsWith('：') || cleaned.endsWith(':')) {
          // 兜底：AI 有时直接用 "皇后：" 而不是 "角色名称：皇后"
          const possibleName = cleaned.replace(/[：:]$/, '').trim()
          if (possibleName && possibleName.length < 30 && !possibleName.includes('提示词') && !possibleName.includes('生成')) {
            if (i + 1 < lines.length) {
              const nextCleaned = cleanLabel(lines[i + 1].trim())
              if (nextCleaned.startsWith('AI生成提示词') || nextCleaned.startsWith('纯白色背景') || nextCleaned.startsWith('"纯白色背景')) {
                currentName = possibleName
                console.log(`[YunwuService] 兜底匹配名称 - 类型: ${currentType}, 名称: ${currentName}`)
              }
            }
          }
        }
      }
    }

    console.log('[YunwuService] 最终解析结果 - 角色:', characters.length, '道具:', props.length, '场景:', scenes.length)
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
        // 优先使用形象段落分批
        if (styleSegments && styleSegments.length > 1) {
          return null // 形象段落分批在下面单独处理
        }
        // 没有形象标记，退回按行数分批
        const contentLines = preprocessed.scriptContent.split('\n').map(l => l.trim()).filter(l => l.length > 0)
        if (contentLines.length <= 5) return null
        
        const batches: string[] = []
        for (let i = 0; i < contentLines.length; i += 5) {
          batches.push(contentLines.slice(i, i + 5).join('\n'))
        }
        return batches
      } else {
        // 对话模式：按场景拆分
        // 识别场景分隔：【场景X】 或 --- 
        const scenePattern = /(?:^|\n)(【场景[^】]*】[^\n]*)/g
        const scenes: string[] = []
        let lastIndex = 0
        let match: RegExpExecArray | null
        
        while ((match = scenePattern.exec(scriptText)) !== null) {
          if (scenes.length > 0) {
            // 把上一个场景标题到当前场景标题之间的内容作为一个场景
            scenes[scenes.length - 1] = scriptText.substring(lastIndex, match.index).trim()
          }
          scenes.push('') // 占位
          lastIndex = match.index
        }
        // 最后一个场景
        if (scenes.length > 0) {
          scenes[scenes.length - 1] = scriptText.substring(lastIndex).trim()
        }
        
        // 如果没找到场景标记，尝试用 --- 分隔
        if (scenes.length === 0) {
          const parts = scriptText.split(/\n---+\n/).map(s => s.trim()).filter(s => s.length > 0)
          if (parts.length > 1) {
            scenes.push(...parts)
          }
        }
        
        // 场景数 <= 2 或没找到场景标记，不分批
        if (scenes.length <= 2) return null
        
        // 将相邻的短场景合并，每批不超过2个场景（控制单次输入量）
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
      console.log(`[YunwuService] 解说模式按形象段落分批: ${styleSegments.length} 批`)
      
      const allShots: Array<{
        shotNumber: string; novelText: string; scene: string
        imagePrompt: string; videoPrompt: string; characters: string[]; props: string
      }> = []
      let globalShotIndex = 0

      for (let i = 0; i < styleSegments.length; i++) {
        const seg = styleSegments[i]
        const batchNum = i + 1
        console.log(`[YunwuService] 处理形象段落 ${batchNum}/${styleSegments.length}: ${seg.styleContext || '无形象标记'}`)
        
        const charInfoPrefix = preprocessed.characterInfo ? `${preprocessed.characterInfo}\n\n` : ''
        const stylePrefix = seg.styleContext ? `【当前形象设定】${seg.styleContext}\n\n` : ''
        const batchContext = i > 0 
          ? `${charInfoPrefix}${stylePrefix}（这是第${batchNum}批，镜头号从 ${String(globalShotIndex + 1).padStart(2, '0')} 开始编号）\n\n剧本如下：\n${seg.content}`
          : `${charInfoPrefix}${stylePrefix}剧本如下：\n${seg.content}`
        
        const result = await this.generateContent(systemPrompt, batchContext)
        
        if (!result.success) {
          console.error(`[YunwuService] 形象段落 ${batchNum} 生成失败:`, result.error)
          continue
        }

        console.log(`[YunwuService] 形象段落 ${batchNum} 响应长度:`, result.text?.length)

        try {
          const batchShots = this.parseShotsResult(result.text || '', mode)
          for (const shot of batchShots) {
            globalShotIndex++
            shot.shotNumber = String(globalShotIndex).padStart(2, '0')
            allShots.push(shot)
          }
          console.log(`[YunwuService] 形象段落 ${batchNum} 解析出 ${batchShots.length} 个镜头，累计 ${allShots.length} 个`)
        } catch (err) {
          console.error(`[YunwuService] 形象段落 ${batchNum} 解析失败:`, err)
        }
      }

      console.log(`[YunwuService] 形象段落分批完成，共 ${allShots.length} 个镜头`)
      return { success: allShots.length > 0, shots: allShots }
    }

    if (batches && batches.length > 1) {
      const modeLabel = mode === 'narration' ? '解说' : '对话'
      console.log(`[YunwuService] ${modeLabel}模式分批处理: ${batches.length} 批`)
      
      const allShots: Array<{
        shotNumber: string; novelText: string; scene: string
        imagePrompt: string; videoPrompt: string; characters: string[]; props: string
      }> = []
      let globalShotIndex = 0

      for (let i = 0; i < batches.length; i++) {
        const batchNum = i + 1
        console.log(`[YunwuService] 处理第 ${batchNum}/${batches.length} 批`)
        
        const charInfoPrefix = preprocessed.characterInfo ? `${preprocessed.characterInfo}\n\n` : ''
        const batchContext = i > 0 
          ? `${charInfoPrefix}（这是第${batchNum}批，镜头号从 ${String(globalShotIndex + 1).padStart(2, '0')} 开始编号）\n\n剧本如下：\n${batches[i]}`
          : `${charInfoPrefix}剧本如下：\n${batches[i]}`
        
        const result = await this.generateContent(systemPrompt, batchContext)
        
        if (!result.success) {
          console.error(`[YunwuService] 第 ${batchNum} 批生成失败:`, result.error)
          continue
        }

        console.log(`[YunwuService] 第 ${batchNum} 批响应长度:`, result.text?.length)

        try {
          const batchShots = this.parseShotsResult(result.text || '', mode)
          for (const shot of batchShots) {
            globalShotIndex++
            shot.shotNumber = String(globalShotIndex).padStart(2, '0')
            allShots.push(shot)
          }
          console.log(`[YunwuService] 第 ${batchNum} 批解析出 ${batchShots.length} 个镜头，累计 ${allShots.length} 个`)
        } catch (err) {
          console.error(`[YunwuService] 第 ${batchNum} 批解析失败:`, err)
        }
      }

      console.log(`[YunwuService] 分批处理完成，共 ${allShots.length} 个镜头`)
      return { success: allShots.length > 0, shots: allShots }
    }

    // 短剧本：一次性处理
    const result = await this.generateContent(systemPrompt, `${preprocessed.characterInfo ? preprocessed.characterInfo + '\n\n' : ''}剧本如下：\n${preprocessed.scriptContent || scriptText}`)

    console.log('[YunwuService] ========== 分镜生成原始响应 ==========')
    console.log('[YunwuService] 成功:', result.success)
    console.log('[YunwuService] 错误:', result.error)
    console.log('[YunwuService] 思考过程:', result.thought?.substring(0, 500) + '...')
    console.log('[YunwuService] 响应文本长度:', result.text?.length)
    console.log('[YunwuService] 响应文本前2000字符:')
    console.log(result.text?.substring(0, 2000))
    console.log('[YunwuService] ========== 原始响应结束 ==========')

    if (!result.success) {
      return { success: false, error: result.error }
    }

    try {
      const shots = this.parseShotsResult(result.text || '', mode)
      console.log('[YunwuService] 分镜解析结果:', shots.length, '个镜头')
      console.log('[YunwuService] 解析出的分镜:', JSON.stringify(shots, null, 2))
      return { success: true, shots }
    } catch (err) {
      console.error('[YunwuService] 分镜解析失败:', err)
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
    console.log('[YunwuService] 开始解析分镜结果, 文本长度:', text.length)
    
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

    let tableRows: string[] = []
    let headerFound = false
    let shotStartPattern = /^\|\s*\*{0,2}\d+\*{0,2}\s*\|/

    if (text.includes('<Table>') || text.includes('<Row>')) {
      const cellMatches = text.match(/<Cell>(.*?)<\/Cell>/gi) || []
      let currentRow: string[] = []
      let rowIndex = 0

      for (const match of cellMatches) {
        const cellValue = match.replace(/<\/?Cell>/gi, '').trim()
        if (rowIndex === 0 && (cellValue.includes('镜头号') || cellValue.includes('旁白/字幕'))) {
          headerFound = true
          rowIndex++
          continue
        }
        if (headerFound && cellValue && !cellValue.includes('---')) {
          if (shotStartPattern.test('|' + cellValue + '|') || /^\*{0,2}\d+\*{0,2}$/.test(cellValue)) {
            if (currentRow.length > 0) {
              tableRows.push('|' + currentRow.join('|') + '|')
            }
            currentRow = [cellValue]
          } else {
            currentRow.push(cellValue)
          }
        }
        rowIndex++
      }

      if (currentRow.length > 0) {
        tableRows.push('|' + currentRow.join('|') + '|')
      }
    } else {
      const lines = text.split('\n')
      const shotStartPattern = /^\|\s*\*{0,2}(\d+)\*{0,2}\s*\|/
      const headerPattern = /\|.*镜头号.*\|/
      const separatorPattern = /^\|[\s|:‒-]+\|$/

      let headerLineIndex = -1
      let hasImagePromptCol = true
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim()
        if (headerPattern.test(trimmed) || separatorPattern.test(trimmed.replace(/:/g, ''))) {
          headerLineIndex = i
          if (trimmed.includes('镜头号') || trimmed.includes('小说文案')) {
            hasImagePromptCol = trimmed.includes('生图提示词') || trimmed.includes('生图')
          }
          break
        }
      }

      if (headerLineIndex === -1) {
        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim()
          if (trimmed.includes('镜头号') || trimmed.includes('旁白/字幕') || trimmed.includes('小说文案')) {
            headerLineIndex = i
            hasImagePromptCol = trimmed.includes('生图提示词') || trimmed.includes('生图')
            break
          }
        }
      }

      if (headerLineIndex === -1) {
        return shots
      }

      let shotStarts: number[] = []
      for (let i = headerLineIndex + 1; i < lines.length; i++) {
        const trimmed = lines[i].trim()
        if (trimmed && separatorPattern.test(trimmed.replace(/:/g, ''))) {
          continue
        }
        const match = trimmed.match(shotStartPattern)
        if (match) {
          shotStarts.push(i)
        }
      }

      for (let i = 0; i < shotStarts.length; i++) {
        const startIdx = shotStarts[i]
        const endIdx = i < shotStarts.length - 1 ? shotStarts[i + 1] : lines.length
        const shotLines = lines.slice(startIdx, endIdx)
        const mergedLine = shotLines.join(' ')

        const cells = mergedLine.split('|').map(c => c.trim()).filter(c => c)
        if (cells.length < 2) continue

        const firstCell = cells[0].replace(/\*\*/g, '').trim()
        if (!/^\d+$/.test(firstCell)) continue

        const characters: string[] = []
        let props = ''

        if (mode === 'narration') {
          const novelText = cells[1] || ''
          const imagePrompt = cells[2] || ''
          const videoPrompt = cells[3] || ''
          for (let j = 4; j < cells.length; j++) {
            const cell = cells[j]
            if (cell && cell !== '无' && cell !== '-' && cell !== '/' && !/^\d+$/.test(cell)) {
              characters.push(cleanName(cell.trim()))
            }
          }

          shots.push({
            shotNumber: firstCell.padStart(2, '0'),
            novelText,
            scene: '',
            imagePrompt,
            videoPrompt,
            characters,
            props: ''
          })
        } else {
          const novelText = cells[1] || ''
          const scene = cleanName(cells[2] || '')
          let imagePrompt: string
          let videoPrompt: string
          let charsStartIdx: number

          if (hasImagePromptCol) {
            imagePrompt = cells[3] || ''
            videoPrompt = cells[4] || ''
            charsStartIdx = 5
          } else {
            imagePrompt = ''
            videoPrompt = cells[3] || ''
            charsStartIdx = 4
          }

          if (cells.length >= charsStartIdx + 9) {
            for (let j = charsStartIdx; j < charsStartIdx + 8; j++) {
              const cell = cells[j]
              if (cell && cell !== '无' && cell !== '-' && cell !== '/' && cell !== '—' && !/^\d+$/.test(cell)) {
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
          } else if (cells.length >= charsStartIdx + 4) {
            for (let j = charsStartIdx; j < cells.length - 1; j++) {
              const cell = cells[j]
              if (cell && cell !== '无' && cell !== '-' && cell !== '/' && cell !== '—' && !/^\d+$/.test(cell)) {
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
          } else if (cells.length >= charsStartIdx + 2) {
            for (let j = charsStartIdx; j < cells.length - 1; j++) {
              const cell = cells[j]
              if (cell && cell !== '无' && cell !== '-' && cell !== '/' && cell !== '—' && !/^\d+$/.test(cell)) {
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

          shots.push({
            shotNumber: firstCell.padStart(2, '0'),
            novelText,
            scene,
            imagePrompt,
            videoPrompt,
            characters,
            props
          })
        }
      }

      return shots
    }
    
    console.log('[YunwuService] 表格行数:', tableRows.length)
    
    for (let i = 0; i < tableRows.length; i++) {
      const row = tableRows[i]
      const cells = row.split('|').map(c => c.trim()).filter(c => c)

      console.log(`[YunwuService] 第${i}行:`, cells.length, '列', 'mode:', mode)

      if (cells.length >= 6 && !cells[0].includes('---') && !cells[0].includes('镜头号')) {
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
          novelText = cells[1] || ''
          scene = cleanName(cells[2] || '')
          imagePrompt = (cells[3] || '').replace(/\*\*/g, '') // 清理 Markdown 标记
          videoPrompt = (cells[4] || '').replace(/\*\*/g, '') // 清理 Markdown 标记
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

        console.log('[YunwuService] 解析镜头:', shot.shotNumber, '人物:', characters.join(','), '道具:', props)
        shots.push(shot)
      }
    }

    if (shots.length === 0) {
      console.log('[YunwuService] 表格解析失败，尝试字段标签格式')
      
      const shotPattern = /镜头\s+([^\n]+)/gi
      let match
      let shotIndex = 0
      
      while ((match = shotPattern.exec(text)) !== null) {
        shotIndex++
        const shotStart = match.index
        const nextShotMatch = text.substring(shotStart + 1).match(/镜头\s+[^\n]+/i)
        const shotEnd = nextShotMatch ? shotStart + 1 + nextShotMatch.index! : text.length
        const shotText = text.substring(shotStart, shotEnd)
        
        console.log(`[YunwuService] 找到镜头块 ${shotIndex}:`, shotText.substring(0, 100))
        
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
        
        console.log('[YunwuService] 解析镜头:', shot.shotNumber)
        console.log('  小说文案:', novelText.substring(0, 50))
        console.log('  场景:', scene.substring(0, 50))
        console.log('  生图提示词:', imagePrompt.substring(0, 50))
        console.log('  视频提示词:', videoPrompt.substring(0, 50))
        console.log('  人物:', characters.join(','))
        console.log('  道具:', props.substring(0, 30))
        
        shots.push(shot)
      }
    }

    console.log('[YunwuService] 最终解析镜头数:', shots.length)
    return shots
  }
}

let yunwuServiceInstance: YunwuService | null = null

export async function getYunwuService(): Promise<YunwuService> {
  if (!yunwuServiceInstance) {
    const { useAppStore } = await import('../store/appStore')
    const { apiConfigs } = useAppStore.getState()
    const yunwuConfig = apiConfigs.yunwu
    yunwuServiceInstance = new YunwuService({
      apiKey: yunwuConfig?.apiKey || '',
      endpoint: yunwuConfig?.endpoint || DEFAULT_CONFIG.endpoint,
      model: yunwuConfig?.model || DEFAULT_CONFIG.model,
    })
  }
  return yunwuServiceInstance
}

export function resetYunwuService(): void {
  yunwuServiceInstance = null
}
