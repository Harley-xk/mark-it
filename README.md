<p align="center">
  <img src="build/icon.png" width="80" height="80" alt="MarkIt">
</p>

<h1 align="center">MarkIt</h1>

<p align="center">
  一款轻量、精致的本地 Markdown 编辑器<br>
  实时预览 · Mermaid 图表 · 多主题 · PDF 导出
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-39-47848F?logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js" alt="Vue">
  <img src="https://img.shields.io/badge/CodeMirror-6-DB2E2E?logo=codemirror" alt="CodeMirror">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="License">
</p>

---

## 特性

- **实时双栏预览** — 四种布局模式：左编辑右预览 / 左预览右编辑 / 仅编辑 / 仅预览，可拖拽调整分栏比例
- **Markdown 语法高亮** — 基于 CodeMirror 6，支持代码块多语言高亮、行号、活动行标记
- **Mermaid 图表** — 自动渲染流程图、序列图、甘特图等，编辑即时更新
- **自动大纲** — 从文档标题自动生成层级大纲，点击跳转到对应位置
- **主题切换** — 浅色 / 深色 / 跟随系统三种模式，编辑器和预览区同步切换
- **多种预览样式** — GitHub / Dark / Academic / Minimal 四套内置样式，支持导入自定义 CSS
- **PDF 导出** — 保留样式和 Mermaid 图表的高质量 PDF 输出，支持 A4 / Letter 纸张
- **毛玻璃 UI** — 现代化半透明窗口设计，简洁美观
- **格式化快捷操作** — 工具栏提供加粗、斜体、标题、链接、代码块等一键格式化

## 截图

> TODO: 添加应用截图

## 快速开始

### 环境要求

- Node.js >= 22
- npm >= 9

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建打包

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## 技术栈

| 技术 | 用途 |
|------|------|
| [Electron](https://www.electronjs.org/) 39 | 跨平台桌面框架 |
| [Vue 3](https://vuejs.org/) + [Pinia](https://pinia.vuejs.org/) | 响应式 UI + 状态管理 |
| [CodeMirror 6](https://codemirror.net/) | 代码编辑器引擎 |
| [markdown-it](https://github.com/markdown-it/markdown-it) | Markdown 解析 |
| [Mermaid](https://mermaid.js.org/) | 图表渲染 |
| [TypeScript](https://www.typescriptlang.org/) | 类型安全 |
| [electron-vite](https://electron-vite.org/) | 构建工具 |

## 项目结构

```
mark-it/
├── src/
│   ├── main/                          # Electron 主进程
│   │   └── index.ts                   # 窗口管理、IPC、文件操作、PDF 导出
│   ├── preload/                       # 预加载脚本
│   │   └── index.ts                   # contextBridge API
│   └── renderer/                      # Vue 渲染进程
│       └── src/
│           ├── components/
│           │   ├── layout/            # 布局组件（TitleBar, Toolbar, StatusBar, SplitPane）
│           │   ├── editor/            # CodeMirror 编辑器封装
│           │   ├── preview/           # Markdown 预览渲染
│           │   ├── outline/           # 自动大纲面板
│           │   ├── settings/          # 设置对话框
│           │   └── export/            # PDF 导出对话框
│           ├── stores/                # Pinia 状态管理
│           │   ├── app.ts             # 应用全局状态
│           │   ├── editor.ts          # 编辑器状态
│           │   └── style.ts           # 预览样式状态
│           ├── composables/           # 组合式函数
│           ├── styles/preview/        # 预览样式 CSS
│           └── types/                 # TypeScript 类型定义
├── build/                             # 应用图标资源
├── electron-builder.yml               # 打包配置
└── electron.vite.config.ts            # 构建配置
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+N` | 新建文件 |
| `Ctrl+O` | 打开文件 |
| `Ctrl+S` | 保存文件 |
| `Ctrl+B` | 加粗 |
| `Ctrl+I` | 斜体 |
| `Ctrl+K` | 插入链接 |
| `Ctrl+Shift+K` | 插入代码块 |
| `Ctrl+Shift+O` | 切换大纲面板 |
| `Ctrl+P` | 导出 PDF |

## 关于

本项目从架构设计到代码实现，均由 [Claude](https://www.anthropic.com/claude) 完成开发。

## License

[MIT](LICENSE)
