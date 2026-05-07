# Manju Node Backend

Manju 后端服务，基于 Node.js + Express + SQLite3 构建，为 AI 短剧/漫剧生成平台提供 API 支持。

## 技术栈

- **Runtime**: Node.js 22+
- **Framework**: Express.js
- **Database**: SQLite3 (better-sqlite3)
- **Image Processing**: sharp
- **File Upload**: multer

## 目录结构

```
node/
├── src/
│   ├── config/          # 配置管理
│   ├── constants/       # 常量定义
│   ├── db/              # 数据库连接与迁移
│   ├── routes/          # API 路由
│   ├── services/        # 业务逻辑
│   └── utils/           # 工具函数
├── migrations/          # 数据库迁移脚本
├── tools/ffmpeg/        # FFmpeg 工具（需自行下载）
├── configs/             # 运行时配置
└── data/                # 运行时数据与数据库文件（gitignore）
```

## 快速开始

```bash
# 安装依赖
npm install

# 执行数据库迁移
npm run migrate

# 开发模式
npm run dev

# 生产模式
npm start
```

## 环境要求

- Node.js >= 18
- FFmpeg（如需视频处理功能，请将 ffmpeg.exe 放置于 tools/ffmpeg/ 目录下）
