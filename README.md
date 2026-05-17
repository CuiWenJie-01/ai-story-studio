# AI Story Studio

AI 短剧与漫剧生成平台，包含 Web 端创作工具与桌面端应用。

## 项目结构

```
ai-story-studio/
├── manju/                    # Web 端创作平台（支持 Electron 桌面化）
│   ├── node/                 # Node.js 后端服务 (Express + SQLite3)
│   ├── web/                  # Vue 3 前端界面 (Vite + Element Plus)
│   ├── electron/             # Electron 主进程与预加载脚本
│   └── package.json          # Electron 应用配置
└── xu-yan-ai/                # 桌面端应用 (Tauri + React + TypeScript)
```

## 子项目简介

### Manju（Web 端 + Electron 桌面端）

基于浏览器的一站式 AI 短剧/漫剧创作平台，同时支持通过 Electron 打包为桌面应用，实现 Web 技术的桌面化交付。

- **后端**: [manju/node](manju/node/) — Node.js + Express，提供剧本生成、分镜管理、角色/场景库、图片/视频生成任务调度等 API。
- **前端**: [manju/web](manju/web/) — Vue 3 + Vite + Element Plus，提供剧本编辑、分镜管理、素材库、生成任务监控等界面。
- **桌面壳层**: [manju/electron](manju/electron/) — Electron 主进程，将 Web 端封装为 Windows 桌面应用，支持本地后端集成与系统级能力调用。

> Manju 的核心定位是 **Web 桌面化**：同一套 Vue + Node.js 代码，既可以在浏览器中访问，也可以通过 Electron 打包为独立桌面程序。

### 序言 AI（桌面端）

基于 Tauri 构建的跨平台桌面应用，提供离线/本地化更强的创作体验。

- [xu-yan-ai](xu-yan-ai/) — React + TypeScript 前端，Rust Tauri 后端，集成 FFmpeg 进行本地视频处理。

## 快速开始

请进入各子项目目录查看详细的启动说明：

- [Manju 项目总览与桌面端启动指南](manju/README.md) — Electron 开发/构建、整体架构
- [Manju 后端启动指南](manju/node/README.md) — API、数据库迁移、配置
- [Manju 前端启动指南](manju/web/README.md) — 页面路由、开发配置
- [序言 AI 桌面端启动指南](xu-yan-ai/README.md)

## 核心功能

- AI 剧本生成与编辑
- 角色/场景/道具管理与素材库
- 智能分镜生成与 Prompt 优化
- AI 图片生成与视频生成任务调度
- 视频合并与后期处理
- 小说导入与剧本转换

## 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | 22+ | 推荐，后端和前端都需要 |
| Rust | 1.77.2+ | 桌面端（xu-yan-ai）需要 |
| FFmpeg | - | 视频处理功能需要 |

## 技术栈总览

| 子项目 | 技术栈 | 定位 |
|--------|--------|------|
| manju/node | Node.js + Express + SQLite3 + Sharp | 后端 API 服务 |
| manju/web | Vue 3 + Vite + Element Plus + Pinia | 前端界面 |
| manju/electron | Electron 42 | Web 桌面化壳层 |
| xu-yan-ai | Tauri v2 + React 19 + TypeScript + Zustand | 独立桌面应用 |
