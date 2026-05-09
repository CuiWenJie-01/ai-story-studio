# Manju AI 配置文档

## 目录

1. [配置界面概览](#配置界面概览)
2. [服务类型说明](#服务类型说明)
3. [支持的提供商](#支持的提供商)
4. [配置字段详解](#配置字段详解)
5. [各提供商配置示例](#各提供商配置示例)
6. [一键配置](#一键配置)
7. [高级设置](#高级设置)
8. [并发设置](#并发设置)
9. [常见问题](#常见问题)

---

## 配置界面概览

打开应用后，点击右上角 **"AI配置"** 按钮进入配置页面。

配置页面包含 5 个标签页：
- **AI 配置**：管理所有 AI 服务配置
- **高级设置（提示词）**：自定义 AI 提示词模板
- **高级设置（业务场景）**：为不同业务场景配置不同模型
- **生成设置**：配置并发数等性能参数
- **SD2 资产管理**：管理角色库素材

---

## 服务类型说明

| 类型 | 用途 | 使用场景 |
|------|------|----------|
| `text` | 文本生成 | 故事生成、分镜描述生成、提示词优化、角色描述 |
| `image` | 图片生成 | 角色图、场景图、道具图 |
| `storyboard_image` | 分镜图片生成 | 生成分镜图（支持参考图注入）|
| `video` | 视频生成 | 分镜视频生成、视频合并 |
| `tts` | 语音合成 | 分镜对话旁白配音 |

**重要**：每种服务类型必须且只能有一个「默认配置」。

---

## 支持的提供商

| 提供商 | 支持服务 | 说明 |
|--------|----------|------|
| `openai` | text, image, storyboard_image | OpenAI GPT / DALL-E / 兼容 OpenAI 格式的 API |
| `gemini` / `google` | text, image, storyboard_image | Google Gemini API |
| `dashscope` / `qwen_image` | text, image, storyboard_image, video | 阿里云通义（Qwen 模型）|
| `volces` / `volcengine` / `volc` | video, image, storyboard_image | 火山引擎（即梦模型）|
| `nano_banana` | image, storyboard_image | 香蕉 AI（自研模型）|

---

## 配置字段详解

### 基本字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `service_type` | ✓ | 服务类型：text / image / storyboard_image / video / tts |
| `name` | ✓ | 配置名称，便于识别（如「通义-文本」）|
| `provider` | ✓ | 提供商：openai / gemini / dashscope / volces / nano_banana |
| `base_url` | ✓ | API 基础地址（如 `https://api.openai.com/v1`）|
| `api_key` | ✓ | API Key / Access Key |
| `model` | ✓ | 支持的模型列表（数组，如 `["gpt-4", "gpt-3.5-turbo"]`）|
| `default_model` | ✓ | 默认使用的模型（从 `model` 列表中选）|
| `is_default` | - | 是否设为该服务类型的「默认配置」|
| `priority` | - | 优先级（数字越大越优先，默认 0）|
| `is_active` | - | 是否启用（默认启用）|

### 高级字段

| 字段 | 说明 |
|------|------|
| `api_protocol` | API 协议（默认 auto，通常不需要填写）|
| `endpoint` | API 端点（通常根据 provider 自动填充）|
| `query_endpoint` | 查询端点（用于视频生成轮询任务状态）|
| `settings` | JSON 配置，用于高级参数（如 TTS 的 voice_id）|

---

## 各提供商配置示例

### 1. OpenAI / 兼容 OpenAI 格式

#### 文本配置（text）

| 字段 | 值 |
|------|-----|
| service_type | `text` |
| name | `OpenAI-文本` |
| provider | `openai` |
| base_url | `https://api.openai.com/v1` |
| api_key | `sk-xxxxxx...` |
| model | `["gpt-4", "gpt-4o", "gpt-3.5-turbo"]` |
| default_model | `gpt-4o` |
| is_default | ✓ |

#### 图片配置（image / storyboard_image）

| 字段 | 值 |
|------|-----|
| service_type | `image` 或 `storyboard_image` |
| name | `OpenAI-图片` |
| provider | `openai` |
| base_url | `https://api.openai.com/v1` |
| api_key | `sk-xxxxxx...` |
| model | `["dall-e-3"]` |
| default_model | `dall-e-3` |
| is_default | ✓ |

---

### 2. 阿里云通义（DashScope）

#### 文本配置（text）

| 字段 | 值 |
|------|-----|
| service_type | `text` |
| name | `通义-文本` |
| provider | `dashscope` |
| base_url | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| api_key | `sk-xxxxxx...` |
| model | `["qwen-turbo", "qwen-plus", "qwen-max"]` |
| default_model | `qwen-plus` |
| is_default | ✓ |

#### 图片配置（image / storyboard_image）

| 字段 | 值 |
|------|-----|
| service_type | `image` 或 `storyboard_image` |
| name | `通义-图片` |
| provider | `dashscope` / `qwen_image` |
| base_url | `https://dashscope.aliyuncs.com` |
| api_key | `sk-xxxxxx...` |
| model | `["wanx-v1"]` |
| default_model | `wanx-v1` |
| is_default | ✓ |

#### 视频配置（video）

| 字段 | 值 |
|------|-----|
| service_type | `video` |
| name | `通义-视频` |
| provider | `dashscope` |
| base_url | `https://dashscope.aliyuncs.com` |
| api_key | `sk-xxxxxx...` |
| model | `["qwen-v2-turbo-v1"]` |
| default_model | `qwen-v2-turbo-v1` |
| is_default | ✓ |

---

### 3. 火山引擎（VolcEngine / 即梦）

#### 视频配置（video）

| 字段 | 值 |
|------|-----|
| service_type | `video` |
| name | `火山-即梦视频` |
| provider | `volces` / `volcengine` |
| base_url | `https://ark.cn-beijing.volces.com/api/v3` |
| api_key | `sk-xxxxxx...` |
| model | `["ep-20241010xxxxxxx"]` |
| default_model | `ep-20241010xxxxxxx` |
| is_default | ✓ |

> 注意：火山引擎 model 使用 Endpoint ID（形如 `ep-` 开头）

#### 图片配置（image / storyboard_image）

| 字段 | 值 |
|------|-----|
| service_type | `image` 或 `storyboard_image` |
| name | `火山-图片` |
| provider | `volces` |
| base_url | `https://ark.cn-beijing.volces.com/api/v3` |
| api_key | `sk-xxxxxx...` |
| model | `["ep-20241010xxxxxxx"]` |
| default_model | `ep-20241010xxxxxxx` |
| is_default | ✓ |

---

### 4. Google Gemini

| 字段 | 值 |
|------|-----|
| service_type | `text` / `image` / `storyboard_image` |
| name | `Gemini-全能` |
| provider | `gemini` / `google` |
| base_url | `https://generativelanguage.googleapis.com` |
| api_key | `AIzaSyxxxxxx...` |
| model | `["gemini-2.0-flash", "gemini-1.5-pro"]` |
| default_model | `gemini-2.0-flash` |
| is_default | ✓ |

---

## 一键配置

### 一键配置通义

点击「一键配置通义」按钮，系统会自动创建以下配置：
- **通义-文本** (text) - qwen-plus
- **通义-分镜图** (storyboard_image) - wanx-v1
- **通义-视频** (video) - qwen-v2-turbo-v1

你只需要填写 API Key 即可。

### 一键配置火山

点击「一键配置火山」按钮，系统会自动创建火山/即梦相关配置。

---

## 高级设置

### 业务场景模型映射（Scene Model Map）

在「高级设置（业务场景）」标签页，可以为不同的业务场景配置专门的模型：

| 场景 Key | 说明 |
|----------|------|
| `image_polish` | 提示词优化 |
| `video_polish` | 视频提示词优化 |
| `vision_analysis` | 图片分析 |

这样可以：
- 用最智能的模型做提示词优化
- 用性价比高的模型做批量生成

### 自定义提示词

在「高级设置（提示词）」标签页，可以：
- 自定义角色生成提示词
- 自定义场景生成提示词
- 自定义分镜图生成提示词
- 自定义视频生成提示词

---

## 并发设置

在「生成设置」标签页，可以调整：

| 设置项 | 说明 | 建议值 |
|--------|------|--------|
| 图片并发数 | 同时生成的图片任务数 | 3（默认）|
| 视频并发数 | 同时生成的视频任务数 | 3（默认）|

**注意事项**：
- 并发数越高，速度越快，但可能触发 API 限流（429 错误）
- 如果频繁遇到 429，请降低并发数
- 如果配额充足，可以提升到 5-10

---

## 厂商锁定模式（Vendor Lock）

如果你的组织需要统一管理 AI 配置，可以启用「厂商锁定模式」：

1. 编辑 `node/configs/config.yaml`：
```yaml
vendor_lock:
  enabled: true
  config_file: ai-configs-qudao.json
```

2. 将预设的配置文件放在 `node/configs/` 目录

3. 重启后端，用户只能：
   - 修改 API Key
   - 选择默认模型
   - 不能添加/删除配置

---

## 导入导出配置

### 导出配置

点击「导出配置」按钮，可以将当前所有配置导出为 JSON 文件备份。

### 导入配置

点击「导入配置」按钮，选择之前导出的 JSON 文件，可以批量恢复配置。

---

## 测试连接

配置完成后，点击列表中的「测试」按钮验证配置是否正确：
- 文本配置：发送一个简短的 "Hello" 测试
- 图片配置：尝试生成一张小图
- 视频配置：尝试初始化生成任务

---

## 推荐配置组合

### 全通义组合（最稳定）

| 服务 | 提供商 | 模型 |
|------|--------|------|
| text | dashscope | qwen-plus |
| storyboard_image | dashscope | wanx-v1 |
| video | dashscope | qwen-v2-turbo-v1 |

### 火山+通义组合（高性价比）

| 服务 | 提供商 | 模型 |
|------|--------|------|
| text | dashscope | qwen-plus |
| storyboard_image | dashscope | wanx-v1 |
| video | volces | 即梦 Endpoint |

---

## 常见问题

### Q: 如何获取 API Key？

- **OpenAI**：https://platform.openai.com/api-keys
- **通义**：https://dashscope.console.aliyun.com/api-keys
- **火山引擎**：https://console.volcengine.com/iam/keymanage/
- **Gemini**：https://aistudio.google.com/app/apikey

### Q: 配置测试失败怎么办？

1. 检查 base_url 是否正确
2. 确认 api_key 是否有效
3. 检查模型名称是否拼写正确
4. 查看后端日志获取详细错误信息

### Q: 可以使用第三方 OpenAI 兼容 API 吗？

可以！provider 选 `openai`，填入你的 API 地址和 Key 即可。

### Q: 如何知道哪些模型支持？

参考各提供商的官方文档：
- OpenAI：https://platform.openai.com/docs/models
- 通义：https://help.aliyun.com/zh/dashscope/
- 火山引擎：https://www.volcengine.com/docs/
- Gemini：https://ai.google.dev/models

---

## 快速开始

1. 启动 Manju 后端和前端
2. 打开 http://localhost:3013
3. 点击右上角「AI 配置」
4. 点击「一键配置通义」（或手动添加配置）
5. 填入你的 API Key
6. 点击「测试」验证
7. 设置为「默认配置」
8. 开始创作！

---

有问题可以随时查看后端日志获取详细信息！🎉
