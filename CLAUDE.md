# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目规则（必须遵守，冲突时以 base.md 为准）

@rules/base.md
@rules/code-style.md
@rules/testing.md
@rules/branding.md

## 项目概览

Mark It（界面写作文案为 **MarkIt**）是基于 **Electron 39 + Vue 3 + TypeScript** 的本地 Markdown 编辑器，单包 npm 工程，构建工具为 `electron-vite`。核心能力：CodeMirror 6 编辑、markdown-it 实时预览、Mermaid 图表、多标签页、多主题、PDF 导出、自动更新。

完整工程文档（架构、IPC 契约、状态模型、功能设计、构建发布、开发与测试）见 [docs/README.md](docs/README.md)。

## 常用命令

```bash
npm run dev            # 开发模式（electron-vite dev，主进程/预加载/渲染进程热更新）
npm run build          # typecheck + 构建到 out/（不生成安装包）
npm run build:win      # 构建并生成 Windows 安装包（mac/linux 同理）
npm run build:unpack   # 仅生成未打包的目录产物，便于本地验证
npm run lint           # ESLint（--cache）
npm run format         # Prettier 写入
npm test               # Vitest 纯函数单元测试（一次性运行）
npm run test:watch     # Vitest 监听模式
npm run test:e2e       # Playwright Electron e2e（需先 npm run build）
npm run typecheck      # 主进程 + 渲染进程双 tsconfig
npm run typecheck:node # 仅 src/main、src/preload、electron.vite.config.*
npm run typecheck:web  # 仅 src/renderer 与 preload 的 .d.ts
npm start              # 预览已构建产物（electron-vite preview）
```

**仓库已引入 Vitest（`src/**/*.spec.ts`）与 Playwright（`e2e/**`）**，但没有 git 钩子。纯函数改动需同步补 `*.spec.ts` 并跑 `npm test`；e2e 依赖 `npm run build` 产物。质量门槛与手工验证要求见 `@rules/testing.md`。

## 架构

### 进程与入口

| 目录                | 职责                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/`         | 主进程：窗口与生命周期、单实例锁、文件读写与监听、会话持久化、`markit-file://` 协议、PDF 导出、自动更新                         |
| `src/preload/`      | `contextBridge` 暴露 `window.api`（业务能力）与 `window.electron`（toolkit）；`index.d.ts` 的 `ExposedAPI` 是渲染进程的类型契约 |
| `src/renderer/src/` | 渲染进程（Vue 3 + Pinia），路径别名 `@renderer`                                                                                 |
| `src/shared/`       | 跨进程**纯类型**（`session-types.ts`、`update-types.ts`），禁止运行时依赖                                                       |

渲染进程有**两个 HTML 入口**，由 `electron.vite.config.ts` 的 rollup input 配置：

- `src/renderer/index.html` → 主编辑器窗口（`main.ts` → `App.vue`）
- `src/renderer/update.html` → 独立的「更新详情」窗口（`update/main.ts` → `update/UpdateWindow.vue`），与主窗口通过主进程的更新状态广播协作

新增 IPC 必须三处同步：主进程 `ipcMain.handle` → preload `ipcRenderer.invoke` → `src/preload/index.d.ts` 类型。**渲染进程不得 `import 'electron'`**。

### 状态模型

- `stores/documents.ts` 是唯一事实来源：每个标签保存 `content`、`diskContent`（最近一次磁盘同步内容，用于冲突判断）、`isModified`、光标、大纲、字数；**CodeMirror `EditorState`、编辑区/预览区滚动位置放在非响应式 Map 中**（体积大且不可序列化），不要挪进 `ref`
- `stores/editor.ts` 是「当前激活标签」的计算视图，不持有文档状态；新增状态应落到 documents store
- `stores/app.ts` 管理主题、布局模式、大纲显隐、预览宽度、分栏比例，并以 `markit-*` 键持久化到 localStorage
- `stores/style.ts` 管理预览主题（`styles/preview/` 下成对的深色/浅色 CSS）；`stores/update.ts` 镜像主进程的更新状态

### 关键数据流

1. **文件打开/保存**：渲染进程 → `window.api` → 主进程 `fs` → 结果回传；`openFiles` 支持多选；`file:save` 写盘并更新 `diskContent`
2. **文件监听**：主进程同一时刻只监听**当前激活标签**的文件，用 `fs.watchFile` 轮询（400ms）而非 `fs.watch`——Windows 上「写临时文件再重命名」会让 `fs.watch` 丢目标。外部变更通过 `file:external-change` 推给渲染进程，保存时用 `diskContent` 判断真实冲突并展示 diff
3. **路径比较**：Windows 大小写/斜杠不敏感，统一走 `samePath`（小写 + 正斜杠归一化）
4. **会话恢复**：`useSession` 把标签（路径、内容、光标、激活项）存到主进程，重启或更新安装后恢复

### 预览与导出

预览和 PDF 各自构建了一条 markdown-it 管线，**修改渲染行为时必须两处同步**（frontmatter 表格化、本地图片规则、Mermaid、链接分流）：

- 预览：[MarkdownPreview.vue](src/renderer/src/components/preview/MarkdownPreview.vue) 负责 frontmatter 表格、标题锚点（`heading-N`，与 `useOutline` 约定一致）、Mermaid 渲染、链接点击分流
- PDF：`usePdfExport` 在渲染进程生成自包含 HTML（含 Mermaid SVG），主进程用隐藏 `BrowserWindow` + `printToPDF` 输出，导出前等待 `<img>` 加载
- 本地图片：相对路径经 `installLocalImageRule` 转成 `markit-file://local/?p=<绝对路径>`，主进程按**图片扩展名白名单**读取；不得放宽为任意文件读取
- 外部链接统一走 `shell:openExternal`；页内锚点保留原生跳转；其余协议忽略，避免主窗口被导航走

### 自动更新

`electron-updater`（generic provider，apphub）在 `src/main/updater.ts` 中初始化：`autoDownload=false`，状态通过 `update:state` 广播到两个窗口；更新详情窗口发起安装时，安装请求转交主窗口，由主窗口先处理未保存文档。发版由 `.github/workflows/release.yml` 在推送 `v*` 标签时三平台并行构建并同步到 GitHub Release。

### 窗口与布局

无边框自定义标题栏，最小化/最大化/关闭、全屏状态、整窗缩放都经 IPC 与主进程同步。布局模式由 `app.layoutMode` 决定（`edit-left` / `edit-right` / `edit-only` / `preview-only`），分栏比例由 `SplitPane` 维护；编辑区与预览区滚动联动在 `useScrollSync` 中实现，切换标签时需保留/恢复各自滚动位置。

## 重要不变量

- `markit-file://` 协议、`markit-*` 存储键、`appId` / `productName` / 更新端点不得顺手改名（后果见 `@rules/branding.md`）
- 主进程的窗口关闭需经渲染进程确认未保存内容；不要在未走该流程时直接 `destroy`
- 修改 `src/preload/**`、`src/shared/**`、`src/renderer/src/utils/**` 属于底座改动，必须跑全量 lint + typecheck
- 涉及架构调整、数据结构、IPC 契约或交互设计的功能，开发前先在 `docs/` 写设计文档（见 `@rules/base.md` 第 4 节）
