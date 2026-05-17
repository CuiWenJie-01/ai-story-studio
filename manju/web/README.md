# Manju 前端 (manju-web)

Vue 3 + Vite + Element Plus 构建的 AI 短剧/漫剧创作平台前端。

## 技术栈

- **Framework**: Vue 3 (Composition API)
- **Build Tool**: Vite 5.x
- **UI Library**: Element Plus
- **State Management**: Pinia
- **Router**: Vue Router 4
- **HTTP Client**: Axios
- **Icons**: Element Plus Icons Vue

## 项目结构

```
web/
├── src/
│   ├── api/                  # API 请求封装
│   ├── components/           # 公共组件
│   ├── composables/          # 组合式函数
│   ├── constants/            # 常量定义
│   ├── router/               # 路由配置
│   ├── stores/               # Pinia 状态管理
│   ├── styles/               # 全局样式
│   ├── utils/                # 工具函数
│   ├── views/                # 页面视图
│   ├── App.vue               # 根组件
│   └── main.js               # 入口文件
├── index.html
└── vite.config.js
```

## 安装

```bash
npm install
```

## 开发

```bash
# 启动开发服务器（默认端口 3013）
npm run dev
```

开发服务器会自动代理 API 请求到后端：
- `/api` → `http://localhost:5679`
- `/static` → `http://localhost:5679`

## 构建

```bash
# 生产构建
npm run build

# 预览构建产物
npm run preview
```

## 页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | 项目列表 | 剧本项目管理 |
| `/drama/:id` | 剧集管理 | 剧本详情、角色/场景编辑 |
| `/film/:id` | AI 视频生成 | 分镜管理、生成任务监控 |
| `/ai-config` | AI 配置 | 服务商 API 配置 |
| `/free-create` | 自由创作 | 自由模式创作 |
| `/media-library` | 媒体素材库 | 素材资源管理 |

## 开发配置

[vite.config.js](vite.config.js) 中已配置开发代理：

```js
server: {
  host: '0.0.0.0',
  port: 3013,
  proxy: {
    '/api': {
      target: 'http://localhost:5679',
      changeOrigin: true
    },
    '/static': {
      target: 'http://localhost:5679',
      changeOrigin: true
    }
  }
}
```

## 注意事项

- 开发时请确保后端服务已启动（默认端口 5679）
- 前端开发服务器端口为 3013
- 生产构建产物输出到 `dist/` 目录
