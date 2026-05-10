# 漫剧生成器桌面版 - 命令行使用说明

## 项目信息

- **名称**: manju-desktop
- **版本**: 1.0.0
- **描述**: 漫剧生成器桌面版 - AI Story Video Generator Desktop App
- **技术栈**: Vue 3 + Vite + Tauri v2 + Express + SQLite

---

## 环境要求

- **Node.js**: >= 18.x
- **npm**: >= 9.x
- **Rust**: >= 1.70 (用于 Tauri 构建)
- **操作系统**: Windows 10/11 (x64)

---

## 快速开始

### 1. 安装依赖

```powershell
cd d:\CodeBase\ai-story-studio\manju-desktop
npm install
```

### 2. 开发模式

#### 仅前端开发服务器
```powershell
npm run dev
```
- 访问: http://localhost:5173

#### 仅后端 API 服务
```powershell
npm run server
```
- 服务地址: http://localhost:3001
- 数据库: `./data/manju.db`
- 上传目录: `./data/uploads`

#### 前端 + 后端同时开发
```powershell
npm run electron-dev
```

#### Tauri 桌面端开发模式
```powershell
npm run tauri-dev
```
- 启动带热重载的桌面应用窗口

---

## 构建命令

### 前端生产构建

```powershell
npm run build
```

输出目录: `dist/`

### Tauri 桌面端构建（生成 .exe）

```powershell
npm run tauri-build
```

或完整命令:

```powershell
npx tauri build
```

#### 构建输出

| 文件 | 路径 |
|------|------|
| 可执行文件 | `src-tauri\target\release\manju-desktop.exe` |
| 安装包 | `src-tauri\target\release\bundle\nsis\漫剧生成器_1.0.0_x64-setup.exe` |

### 一键完整打包（前端 + 安装包）

```powershell
npm run dist
```

等价于:
```powershell
npm run build && npm run tauri-build
```

---

## 运行已构建的应用

### 方式一：直接运行可执行文件

```powershell
.\src-tauri\target\release\manju-desktop.exe
```

### 方式二：运行安装包安装后使用

双击运行安装包:
```
src-tauri\target\release\bundle\nsis\漫剧生成器_1.0.0_x64-setup.exe
```

---

## 后端服务独立运行

### 基本启动

```powershell
node src-electron/server.js
```

### 指定端口运行

```powershell
$env:PORT=3002; node src-electron/server.js
```

### 嵌入式模式（从 Tauri 启动时使用）

```powershell
$env:MANJU_EMBEDDED="1"; $env:MANJU_DATA_DIR="C:\\ManjuData"; node src-electron/server.js
```

---

## 常用 npm 脚本速查

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 前端生产构建 |
| `npm run preview` | 预览生产构建 |
| `npm run tauri` | Tauri CLI 入口 |
| `npm run tauri-dev` | Tauri 开发模式 |
| `npm run tauri-build` | Tauri 生产构建（生成 .exe） |
| `npm run server` | 启动后端 API 服务 |
| `npm run electron-dev` | 同时启动前端+后端开发 |
| `npm run dist` | 完整打包（前端构建 + .exe 安装包） |

---

## 项目结构

```
manju-desktop/
├── src/                    # Vue 前端源码
├── src-electron/           # Express 后端服务
│   ├── server.js           # 主服务入口
│   └── migrations/         # 数据库迁移
├── src-tauri/              # Tauri 桌面端
│   ├── src/
│   │   └── main.rs         # Rust 主程序
│   ├── Cargo.toml          # Rust 配置
│   ├── build.rs
│   └── target/release/     # 构建输出
│       ├── manju-desktop.exe
│       └── bundle/nsis/    # 安装包
├── dist/                   # Vite 构建输出
├── data/                   # SQLite 数据库和上传文件
├── package.json
└── vite.config.js
```

---

## 故障排查

### 端口被占用

如果 3001 端口被占用，修改环境变量:

```powershell
$env:PORT=3002; npm run server
```

### Tauri 构建失败

1. 确保已安装 Rust:
```powershell
rustc --version
```

2. 确保已安装 Tauri 依赖:
```powershell
npm install
```

3. 重新构建:
```powershell
npm run tauri-build
```

### 清理构建缓存

```powershell
# 清理前端构建
rmdir dist /s /q

# 清理 Tauri 构建
rmdir src-tauri\target /s /q
```

---

## API 端点

服务启动后，可通过以下地址访问 API:

- 基础地址: `http://localhost:3001`
- 项目列表: `GET http://localhost:3001/api/v1/dramas`
- 设置信息: `GET http://localhost:3001/api/v1/settings`
- AI 配置: `GET http://localhost:3001/api/v1/ai-config`

---

*文档生成时间: 2026-05-10*
