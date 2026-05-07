# AI Story Studio

AI 短剧与漫剧生成平台，包含 Web 端创作工具与桌面端应用。

## 项目结构

```
ai-story-studio/
├── manju/                    # Web 端创作平台
│   ├── node/                 # Node.js 后端服务 (Express + SQLite3)
│   └── web/                  # Vue 3 前端界面 (Vite + Element Plus)
└── xu-yan-ai/                # 桌面端应用 (Tauri + React + TypeScript)
```

## 子项目简介

### Manju（Web 端）

基于浏览器的一站式 AI 短剧/漫剧创作平台。

- **后端**: [manju/node](manju/node/) — Node.js + Express，提供剧本生成、分镜管理、角色/场景库、图片/视频生成任务调度等 API。
- **前端**: [manju/web](manju/web/) — Vue 3 + Vite + Element Plus，提供剧本编辑、分镜管理、素材库、生成任务监控等界面。

### 序言 AI（桌面端）

基于 Tauri 构建的跨平台桌面应用，提供离线/本地化更强的创作体验。

- [xu-yan-ai](xu-yan-ai/) — React + TypeScript 前端，Rust Tauri 后端，集成 FFmpeg 进行本地视频处理。

## 快速开始

请进入各子项目目录查看详细的启动说明：

- [Manju 后端启动指南](manju/node/README.md)
- [Manju 前端启动指南](manju/web/README.md)
- [序言 AI 桌面端启动指南](xu-yan-ai/README.md)

## 环境要求

- Node.js 22+（推荐）
- Rust 1.77.2+（桌面端需要）
- FFmpeg（视频处理功能需要）
