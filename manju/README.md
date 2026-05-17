# Manju（漫剧AI）

基于 Electron + Vue 3 + Node.js 的 AI 短剧/漫剧创作桌面应用。

## 项目结构

```
manju/
├── node/                   # Node.js 后端服务 (Express + SQLite3)
│   ├── src/                # 后端源码
│   ├── configs/            # 配置文件
│   ├── migrations/         # 数据库迁移
│   └── package.json
├── web/                    # Vue 3 前端界面 (Vite + Element Plus)
│   ├── src/                # 前端源码
│   ├── index.html
│   └── package.json
├── electron/               # Electron 主进程与预加载脚本
│   ├── main.js             # Electron 主进程入口
│   └── preload.js          # 预加载脚本
├── package.json            # Electron 应用配置与启动脚本
└── README.md               # 本文档
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳层 | Electron 42 |
| 前端 | Vue 3 + Vite + Element Plus + Pinia |
| 后端 | Node.js + Express + SQLite3 |
| 图片处理 | Sharp |
| 配置 | YAML |

## 快速开始

### 1. 安装依赖

分别安装后端和前端的依赖：

```bash
# 安装后端依赖
cd node && npm install

# 安装前端依赖
cd web && npm install
```

### 2. 配置

编辑后端配置文件 [node/configs/config.yaml](node/configs/config.yaml)，配置 AI 服务商等参数。

### 3. 开发模式

```bash
# 同时启动后端、前端和 Electron 窗口
npm run electron:dev
```

该命令会：
- 启动 Node.js 后端服务（端口 5679）
- 启动 Vue 前端开发服务器（端口 3013）
- 启动 Electron 桌面窗口

### 4. 单独启动

```bash
# 仅启动后端
cd node && npm run dev

# 仅启动前端（需要后端已启动）
cd web && npm run dev
```

### 5. 构建桌面应用

```bash
# 构建前端并打包 Electron 应用
npm run electron:build
```

打包产物输出到 `release/` 目录。

## 常用脚本

| 脚本 | 说明 |
|------|------|
| `npm run electron:dev` | 开发模式（同时启动后端、前端、Electron） |
| `npm run electron:build` | 构建桌面安装包 |
| `npm run dev:node` | 仅启动后端 |
| `npm run dev:web` | 仅启动前端 |
| `npm run build:web` | 仅构建前端 |

## 子项目文档

- [后端详细文档](node/README.md) — API、数据库迁移、配置说明
- [前端详细文档](web/README.md) — 页面路由、开发配置、技术细节

## 环境要求

- Node.js 22+
- Windows（当前打包配置）
