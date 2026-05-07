# Manju Web Frontend

Manju 前端项目，基于 Vue 3 + Vite + Element Plus 构建的 AI 短剧/漫剧生成平台 Web 界面。

## 技术栈

- **Framework**: Vue 3 (Composition API)
- **Build Tool**: Vite
- **UI Library**: Element Plus
- **State Management**: Pinia
- **Router**: Vue Router

## 目录结构

```
web/
├── src/
│   ├── api/             # API 接口封装
│   ├── components/      # 公共组件
│   ├── composables/     # 组合式函数
│   ├── constants/       # 常量
│   ├── router/          # 路由配置
│   ├── stores/          # Pinia 状态管理
│   ├── styles/          # 全局样式
│   ├── utils/           # 工具函数
│   └── views/           # 页面视图
├── public/              # 静态资源
└── index.html
```

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产环境
npm run build

# 预览生产构建
npm run preview
```

## 环境要求

- Node.js 22+
- 需要配合 Manju Node 后端服务使用
