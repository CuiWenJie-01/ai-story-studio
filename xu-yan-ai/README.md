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

## 注意事项

- `src-tauri/binaries/` 目录下的 `ffmpeg.exe` 和压缩包体积较大，已加入 `.gitignore`，首次构建或运行前请自行准备 FFmpeg 二进制文件。
- `src-tauri/target/` 为 Rust 编译输出目录，已加入 `.gitignore`。
