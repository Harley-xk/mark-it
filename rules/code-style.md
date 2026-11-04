# AI 工作规则 —— 代码风格

> 优先级仅次于 [base.md](base.md)。本规则描述 Mark It（Electron + Vue 3 + TypeScript 单包工程）的编码约定。
> 格式部分由 Prettier + ESLint 自动约束，命令：`npm run format`（写入）/ `npm run lint`（检查）。

## 1. 通用格式（以仓库配置为准）

实际配置见 `.prettierrc.yaml` 与 `.editorconfig`，**配置是唯一事实来源**，不要手工格式化与之对抗：

1. **结尾无分号**（`semi: false`）
2. **字符串使用单引号**（`singleQuote: true`）；需要插值时用模板字符串；字符串本身含单引号时可用双引号避免转义
3. **缩进 2 空格**，禁止 Tab
4. **多行结构最后一项不保留尾逗号**（`trailingComma: none`）——注意与常见社区习惯相反，以本项目配置为准
5. **单行长度 100 字符**（`printWidth: 100`），超长时优先拆分变量或换行
6. 编码 UTF-8、文件末尾保留空行；**提交内容统一 LF**。仓库 `core.autocrlf=true` 且没有 `.gitattributes`，Windows 工作区检出后可能显示 CRLF，属正常现象——不要为换行符差异制造额外改动

## 2. import 导入

1. **本项目不要求** import 分组顺序、组间空行或字母序：仓库未启用 `eslint-plugin-import-x` / `@stylistic`，也不为此新增依赖；不因排序去重构存量文件
2. 纯类型导入一律使用 `import type`（如 `import type { UpdateState } from '../shared/update-types'`）
3. **渲染进程禁止 `import ... from 'electron'`**，只能通过 preload 暴露的 `window.api` / `window.electron` 调用主进程能力

## 3. 命名规范

| 对象 | 风格 | 示例 |
| --- | --- | --- |
| 变量、函数、参数 | camelCase | `openFile`、`currentZoomFactor` |
| 类、接口、类型、Vue 组件 | PascalCase | `SessionData`、`MarkdownPreview` |
| 常量 | UPPER_SNAKE_CASE | `LOCAL_FILE_SCHEME`、`MERMAID_LANGUAGES` |
| 对象结构 | 优先 `interface`；联合 / 字面量类型用 `type` | `interface HeadingItem`、`type ThemeMode = 'light' \| 'dark' \| 'system'` |
| Vue 组件文件 | PascalCase | `EditorToolbar.vue` |
| Composable 文件 | `useXxx.ts`（camelCase） | `useFile.ts`、`useScrollSync.ts` |
| 工具、store 等非组件 ts 文件 | kebab-case | `text-diff.ts`、`local-image.ts` |
| 入口文件 | `index.ts` | `src/main/index.ts`、`src/preload/index.ts` |
| IPC 通道名 | `模块:动作` | `file:read`、`window:get-zoom`、`update:download` |

## 4. 进程边界与 IPC

1. `src/main` 承载所有 Node / Electron 能力（文件、窗口、更新、协议）；`src/preload` 通过 `contextBridge` 暴露白名单 API；`src/renderer` 视为纯 Web 环境
2. 新增或修改 IPC 时必须三处同步：主进程 `ipcMain.handle`、preload `ipcRenderer.invoke`、`src/preload/index.d.ts` 中的类型声明
3. 跨进程共享的**纯类型**放 `src/shared/`，不得引入运行时依赖（如 `session-types.ts`、`update-types.ts`）
4. 渲染进程拿不到的能力，不要用 `nodeIntegration` 打开的捷径解决，而是新增受控 IPC

## 5. 日志

1. 主进程、preload、渲染进程统一使用 `console.error` / `console.warn` 记录异常，并把错误对象作为后续参数传入：
   ```ts
   console.error('Failed to read file:', filePath, err)
   ```
2. **禁止在业务代码中遗留 `console.log`**（现有代码中为 0 处，保持这一状态）
3. 日志文案使用简短英文（沿用现有 `Failed to ...` 风格）；**注释、文档、界面文案使用中文**
4. 不引入第三方日志库；确需引入时必须在设计文档中说明收益与打包体积影响

## 6. Vue 组件

1. 一律使用 `<script setup lang="ts">` 组合式 API（ESLint `vue/block-lang` 已强制 `lang="ts"`）
2. 组件按领域放在 `src/renderer/src/components/<领域>/` 下（`editor` / `layout` / `preview` / `settings` / `update` / `export` / `common` / `outline`）
3. 状态优先局部 `ref` / `reactive`；跨组件共享或需要持久化时才进 Pinia（`src/renderer/src/stores/`）
4. 模板中 HTML 属性保持双引号（HTML 惯例，与 JS 字符串单引号规则互不影响）
5. 组件内不直接操作 DOM 去绕过状态；编辑器 / 预览等需要 DOM 的场景，通过 `ref` + 显式初始化函数封装

## 7. 持久化与安全契约

1. `localStorage` 键统一使用 `markit-` 前缀（`markit-theme`、`markit-layout` 等），且**集中在 store 中读写**，不在组件里散落
2. `markit-file://` 自定义协议**只用于预览图片**，必须保留现有的图片扩展名白名单，不得放宽为任意文件读取通道
3. 外部链接与文件定位统一走主进程（`shell:openExternal` / `file:reveal`），渲染进程不直接导航到外部地址
4. 涉及文件路径的参数在进入 `fs` 调用前需保持与现有一致的校验方式（存在性、扩展名、错误兜底）

## 8. 样式

1. 预览主题样式集中在 `src/renderer/src/styles/preview/`，通过 `PreviewStyle` 注册（见 `src/renderer/src/types/index.ts`）
2. 新增主题时沿用现有命名与成对结构（深色 `xxx.css` + 浅色 `xxx-light.css`），并在 store 的主题列表同步登记
3. 组件私有样式放在对应 `.vue` 的 `<style>` 中，避免全局选择器污染预览区
