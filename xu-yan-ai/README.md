# 序言 AI (XuYan AI)

基于 Tauri + React + TypeScript 构建的 AI 短剧/漫剧生成桌面端应用。

## 技术栈

- **Desktop Framework**: Tauri v2 (Rust)
- **Frontend**: React 19 + TypeScript
- **Build Tool**: Vite
- **UI**: 原生 React + CSS Modules
- **State Management**: Zustand

## 目录结构

```
xu-yan-ai/
├── src/                       # 前端源码
│   ├── components/            # React 组件
│   ├── App.tsx
│   └── App.module.css
├── src-tauri/                 # Tauri / Rust 后端
│   ├── src/                   # Rust 源码
│   ├── binaries/              # 外部二进制工具（如 FFmpeg）
│   ├── icons/                 # 应用图标
│   └── Cargo.toml
├── public/                    # 静态资源
│   └── voice_previews/        # 语音预览文件
└── scripts/                   # 辅助脚本
```

## 快速开始

```bash
# 安装前端依赖
npm install

# 开发模式（启动 Tauri 开发窗口）
npm run tauri:dev

# 构建桌面应用
npm run tauri:build

# 仅构建前端
npm run build
```

## 环境要求

- Node.js 18+
- Rust 1.77.2+
- Tauri CLI

## 功能特性

- AI 短剧/漫剧剧本生成
- 角色管理与形象生成
- 分镜管理与视频生成
- 语音合成与预览
- 本地视频处理（基于 FFmpeg）
- 离线创作支持

## FFmpeg 准备

FFmpeg 二进制文件体积较大，已加入 `.gitignore`，不会随仓库提交。

1. 下载 FFmpeg Windows 构建版：https://ffmpeg.org/download.html
2. 将 `ffmpeg.exe` 放到 `src-tauri/binaries/ffmpeg-7.1.1-essentials_build/bin/ffmpeg.exe`

`npm run tauri:dev` 不要求内置 FFmpeg 存在：项目内未找到时会尝试使用系统 `PATH` 中的 `ffmpeg`。`npm run tauri:build` 和 `npm run tauri:release` 会将上述文件打入安装包，因此发布构建前必须准备该文件。

## 注意事项

- `src-tauri/target/` 为 Rust 编译输出目录，已加入 `.gitignore`。
