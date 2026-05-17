# Manju 后端 (manju-node)

Node.js + Express 后端服务，为 AI 短剧/漫剧创作平台提供 API 支持。

## 技术栈

- **Runtime**: Node.js 22+
- **Framework**: Express.js 4.x
- **Database**: SQLite3 (via sql.js)
- **Image Processing**: Sharp
- **Config**: YAML
- **Authentication**: JWT

## 项目结构

```
node/
├── configs/
│   └── config.yaml           # 主配置文件
├── migrations/
│   └── *.sql                 # 数据库迁移脚本
├── src/
│   ├── app.js                # Express 应用入口
│   ├── server.js             # 服务启动脚本
│   ├── logger.js             # 日志工具
│   ├── response.js           # 统一响应封装
│   ├── config/               # 配置加载
│   ├── db/                   # 数据库连接与迁移
│   ├── routes/               # API 路由
│   ├── services/             # 业务逻辑
│   └── utils/                # 工具函数
└── tools/
    └── ffmpeg/               # FFmpeg 工具目录
```

## 安装

```bash
npm install
```

## 配置

复制或编辑 `configs/config.yaml`：

```yaml
app:
  name: manju API
  version: 1.0.0
server:
  port: 5679
  host: 0.0.0.0
database:
  type: sqlite
  path: ./data/drama_generator.db
storage:
  type: local
  local_path: ./data/storage
ai:
  default_text_provider: openai
  default_image_provider: openai
  default_video_provider: doubao
```

## 启动

```bash
# 开发模式（热重载，Node.js --watch）
npm run dev

# 生产模式
npm start
```

服务启动后访问：
- 前端页面: http://localhost:5679
- API 接口: http://localhost:5679/api/v1
- 健康检查: http://localhost:5679/health

## 数据库迁移

```bash
# 执行所有迁移
npm run migrate

# 执行指定迁移
npm run migrate:07
```

## API 概览

| 路由前缀 | 功能 |
|---------|------|
| `/api/v1/dramas` | 剧本管理（CRUD、导出/导入、小说导入） |
| `/api/v1/characters` | 角色管理（生成图片、四视图、上传） |
| `/api/v1/scenes` | 场景管理 |
| `/api/v1/props` | 道具管理 |
| `/api/v1/storyboards` | 分镜管理（生成、编辑、Prompt 优化） |
| `/api/v1/images` | 图片生成任务 |
| `/api/v1/videos` | 视频生成任务 |
| `/api/v1/video-merges` | 视频合并 |
| `/api/v1/assets` | 素材资源管理 |
| `/api/v1/audio` | 音频提取 |
| `/api/v1/tasks` | 异步任务状态查询 |
| `/api/v1/ai-configs` | AI 服务商配置 |
| `/api/v1/settings` | 系统设置 |
| `/api/v1/character-library` | 角色库 |
| `/api/v1/scene-library` | 场景库 |
| `/api/v1/prop-library` | 道具库 |
| `/api/v1/upload` | 文件上传 |

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | 5679 |
| `WEB_DIST_PATH` | 前端构建产物路径 | 自动探测 |

## 注意事项

- 首次启动前请确保 `configs/config.yaml` 存在
- 数据库文件默认存放在 `./data/` 目录
- 生成的媒体文件默认存放在 `./data/storage/` 目录
