# IPC 接口与进程契约

> **文档定位**：MarkIt（v1.4.1，2026-11-04 核对）主进程、预加载与渲染进程之间的完整通信契约参考。面向新增 IPC、排查跨进程问题、评审安全边界的维护者。
> 本文以代码为准，通道名、参数顺序与默认值均逐字核对自源码；实现变动时请同步更新本文。

## 1. IPC 设计原则

### 1.1 进程边界

| 进程     | 目录                              | 能力                                                                       |
| -------- | --------------------------------- | -------------------------------------------------------------------------- |
| 主进程   | [`src/main`](../src/main)         | Node / Electron 全部能力：文件读写、窗口、对话框、协议、PDF 打印、自动更新 |
| 预加载   | [`src/preload`](../src/preload)   | 唯一允许同时接触 `ipcRenderer` 与页面 `window` 的层，只做白名单转发        |
| 渲染进程 | [`src/renderer`](../src/renderer) | 视为纯 Web 环境，**禁止 `import 'electron'`**，只能调用 `window.api`       |
| 共享类型 | [`src/shared`](../src/shared)     | 跨进程 **纯类型**，不得引入运行时依赖                                      |

渲染进程拿不到 Node 能力，因此凡是读盘、写盘、弹系统对话框、打开外部程序、退出安装，都必须由主进程执行。

### 1.2 contextBridge 白名单

[`src/preload/index.ts`](../src/preload/index.ts) 用 `contextBridge.exposeInMainWorld` 只暴露一个对象：

| 全局对象     | 内容                                  | 状态     |
| ------------ | ------------------------------------- | -------- |
| `window.api` | 业务白名单方法（本文第 3 节全部通道） | 推荐使用 |

`window.electron`（`@electron-toolkit/preload` 的通用 `electronAPI`）没有调用方，已移除；不得重新暴露通用 `ipcRenderer` / `process`。

`api.platform` 是静态值（`process.platform`），不经过 IPC；其余方法均对应一条通道。

### 1.3 三处同步

新增或修改 IPC 必须同时改三处，任何一处缺失都会造成「调用无响应」或「类型通过但运行时失败」：

| 顺序 | 位置                                                  | 职责                                                                                     |
| ---- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1    | 主进程 `registerHandle` / `registerOn`（[`ipc-guard.ts`](../src/main/ipc-guard.ts)） | 校验调用来源、注册通道、校验入参、执行副作用、返回结果                                   |
| 2    | [`src/preload/index.ts`](../src/preload/index.ts)     | `ipcRenderer.invoke`（请求-响应）或 `ipcRenderer.send` / `ipcRenderer.on`（单向 / 事件） |
| 3    | [`src/preload/index.d.ts`](../src/preload/index.d.ts) | `Window.api: ExposedAPI` 类型契约                                                        |

第 3 处当前通过 `export type ExposedAPI = typeof api` 从 preload 的 `api` 对象自动派生，因此**不需要手写方法签名**；但仍必须保证 preload 的方法名、参数顺序、返回值与主进程一致，并在 preload 中显式标注返回类型（`ipcRenderer.invoke` 的返回值默认是 `any`，不标注会丢失类型检查）。

### 1.4 共享类型放 `src/shared`

只有**纯类型**可以放进 `src/shared`，因为该目录同时被主进程（Node 环境）和渲染进程（浏览器环境）引用：

- [`src/shared/session-types.ts`](../src/shared/session-types.ts)：`SessionTab`、`SessionData`
- [`src/shared/update-types.ts`](../src/shared/update-types.ts)：`UpdateStatus`、`UpdateProgress`、`UpdateState`
- [`src/shared/file-types.ts`](../src/shared/file-types.ts)：`FileReadResult`
- [`src/shared/pdf-types.ts`](../src/shared/pdf-types.ts)：`PdfExportOptions`、`PdfPageSize`、`PdfMargin`

不得在 `src/shared` 中引入 `electron`、`node:*`、Vue、Pinia 等运行时依赖。

## 2. 通道总览

| 方向                                  | 数量   | 说明                                                                             |
| ------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| renderer → main `invoke`（请求-响应） | 22     | 文件 4、对话框 3、窗口 5、系统 1（`shell:openExternal`）、会话 2、导出 1、更新 6 |
| renderer → main `send`（单向）        | 2      | `renderer:ready`、`update:close-window`                                          |
| main → renderer `send`（事件推送）    | 9      | 见 3.7                                                                           |
| **合计**                              | **33** | 全部经 `window.api` 白名单暴露                                                    |

> 计数口径：按 `registerHandle` / `registerOn` / `webContents.send` 中实际出现的通道名去重统计。`window:zoom-changed` 在两个位置发送但只算一个通道。

## 3. 完整通道清单

方向缩写：**R→M invoke** = 渲染进程请求主进程并等待返回；**R→M send** = 渲染进程单向通知；**M→R send** = 主进程主动推送。

### 3.1 文件

| 通道名        | 方向       | preload 方法              | 参数                              | 返回值                                                           | 主进程处理位置                                  | 备注                                                                                     |
| ------------- | ---------- | ------------------------- | --------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `file:save`   | R→M invoke | `saveFile(path, content)` | `path: string`, `content: string` | `Promise<boolean>`（写盘成功恒为 `true`，失败则 Promise reject） | [`src/main/index.ts:523`](../src/main/index.ts) | 写盘后若目标是当前监视文件，同步 `watchedContent`，避免外部变更回环                      |
| `file:read`   | R→M invoke | `readFile(path)`          | `path: string`                    | `Promise<{ path: string; content: string } \| null>`             | [`src/main/index.ts:530`](../src/main/index.ts) | 读取失败只记录 `console.error` 并返回 `null`，不抛给渲染进程                             |
| `file:watch`  | R→M invoke | `watchFile(path)`         | `path: string \| null`            | `Promise<boolean>`（恒为 `true`）                                | [`src/main/index.ts:541`](../src/main/index.ts) | **只监视当前活跃标签的文件**；传 `null` 或空串取消监视；内部用 `fs.watchFile` 400ms 轮询 |
| `file:reveal` | R→M invoke | `showItemInFolder(path)`  | `path: string`                    | `Promise<boolean>`                                               | [`src/main/index.ts:547`](../src/main/index.ts) | 文件存在则 `shell.showItemInFolder`；文件已删除则打开父目录；父目录也不存在返回 `false`  |

### 3.2 对话框

| 通道名             | 方向       | preload 方法                           | 参数                                                                | 返回值                                         | 主进程处理位置                                  | 备注                                                                              |
| ------------------ | ---------- | -------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `dialog:openFiles` | R→M invoke | `openFiles()`                          | 无                                                                  | `Promise<{ path: string; content: string }[]>` | [`src/main/index.ts`](../src/main/index.ts) | 多选；过滤 `md` / `markdown` / `txt`；用户取消返回 `[]`；单个文件读取失败会被跳过 |
| `dialog:savePath`  | R→M invoke | `chooseSavePath(defaultFileName?)`     | `defaultFileName?: string`                                          | `Promise<string \| null>`                      | [`src/main/index.ts`](../src/main/index.ts) | **只选择路径，不写盘**；默认文件名清洗非法字符；取消返回 `null`；调用方确认无重复标签后走 `file:save` |
| `dialog:saveImage` | R→M invoke | `saveImage(fileName, data, extension)` | `fileName: string`, `data: Uint8Array`, `extension: 'svg' \| 'png'` | `Promise<string \| null>`                      | [`src/main/index.ts`](../src/main/index.ts) | 预览区 Mermaid 图表下载；写 `Buffer.from(data)`；取消返回 `null`                  |

### 3.3 窗口与系统

| 通道名                 | 方向       | preload 方法        | 参数          | 返回值             | 主进程处理位置                                  | 备注                                                                                  |
| ---------------------- | ---------- | ------------------- | ------------- | ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| `window:minimize`      | R→M invoke | `minimize()`        | 无            | `Promise<void>`    | [`src/main/index.ts:661`](../src/main/index.ts) | 最小化主窗口；**仅接受主窗口调用**；当前渲染进程无调用点（Windows 使用系统按钮 overlay） |
| `window:maximize`      | R→M invoke | `maximize()`        | 无            | `Promise<void>`    | [`src/main/index.ts:665`](../src/main/index.ts) | **切换语义**：已最大化则还原，否则最大化；**仅接受主窗口调用**；当前渲染进程无调用点     |
| `window:close`         | R→M invoke | `close(quit?)`      | `quit?: boolean` | `Promise<boolean>` | [`src/main/index.ts:670`](../src/main/index.ts) | 先置 `allowClose = true` 再关闭，**绕过窗口关闭守卫**；调用前必须已完成未保存内容确认。`quit = true` 表示在完成 Cmd+Q / 菜单退出，关窗后继续 `app.quit()`；**仅接受主窗口调用** |
| `window:is-fullscreen` | R→M invoke | `isFullscreen()`    | 无            | `Promise<boolean>` | [`src/main/index.ts:653`](../src/main/index.ts) | 标题栏据此决定是否给系统按钮留位；**仅接受主窗口调用**                                |
| `window:get-zoom`      | R→M invoke | `getZoom()`         | 无            | `Promise<number>`  | [`src/main/index.ts:657`](../src/main/index.ts) | 返回主进程维护的 `currentZoomFactor`（1 = 100%）；**仅接受主窗口调用**                |
| `shell:openExternal`   | R→M invoke | `openExternal(url)` | `url: string` | `Promise<boolean>` | [`src/main/index.ts:553`](../src/main/index.ts) | 仅放行 `http` / `https` / `mailto`；`file:` 转为定位文件；其余协议忽略并返回 `false`  |

### 3.4 会话

| 通道名         | 方向       | preload 方法         | 参数                                        | 返回值                         | 主进程处理位置                                  | 备注                                             |
| -------------- | ---------- | -------------------- | ------------------------------------------- | ------------------------------ | ----------------------------------------------- | ------------------------------------------------ |
| `session:load` | R→M invoke | `session.load()`     | 无                                          | `Promise<SessionData \| null>` | [`src/main/index.ts:573`](../src/main/index.ts) | 文件不存在或 JSON 解析失败返回 `null`            |
| `session:save` | R→M invoke | `session.save(data)` | `data: SessionData`（主进程签名 `unknown`） | `Promise<boolean>`             | [`src/main/index.ts:583`](../src/main/index.ts) | 写失败返回 `false`（渲染进程当前未消费该返回值） |

### 3.5 导出

| 通道名       | 方向       | preload 方法               | 参数                                                                                                                          | 返回值                    | 主进程处理位置                                  | 备注                                                                                                                                            |
| ------------ | ---------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `export:pdf` | R→M invoke | `exportPdf(html, options)` | `html: string`；`options: PdfExportOptions`（`pageSize`、`margin`、`showPageNumbers`、`showToc`、`fileName`） | `Promise<string \| null>` | [`src/main/index.ts`](../src/main/index.ts) | 渲染进程生成自包含 HTML；主进程用隐藏 `BrowserWindow` 等待图片加载后 `printToPDF`；`margins` / 页码 / 默认文件名均已生效；取消返回 `null`；`finally` 销毁隐藏窗口 |

### 3.6 更新

| 通道名                   | 方向       | preload 方法              | 参数 | 返回值                 | 主进程处理位置                                      | 备注                                                                                                        |
| ------------------------ | ---------- | ------------------------- | ---- | ---------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `update:get-state`       | R→M invoke | `update.getState()`       | 无   | `Promise<UpdateState>` | [`src/main/updater.ts:244`](../src/main/updater.ts) | 读取主进程内存中的当前状态                                                                                  |
| `update:check`           | R→M invoke | `update.check()`          | 无   | `Promise<UpdateState>` | [`src/main/updater.ts:245`](../src/main/updater.ts) | `disabled` / `checking` / `downloading` 直接返回现状；404 按「无更新」容错                                  |
| `update:download`        | R→M invoke | `update.download()`       | 无   | `Promise<UpdateState>` | [`src/main/updater.ts:246`](../src/main/updater.ts) | 仅在 `available` / `error` 状态执行，其余原样返回                                                           |
| `update:install`         | R→M invoke | `update.install()`        | 无   | `Promise<boolean>`     | [`src/main/updater.ts:249`](../src/main/updater.ts) | **只接受主窗口调用**（必须先完成未保存确认）；仅在 `downloaded` 状态执行；`beforeInstall()` 放行关闭守卫；`setImmediate` 调 `quitAndInstall(false, true)` |
| `update:open-window`     | R→M invoke | `update.openWindow()`     | 无   | `Promise<void>`        | [`src/main/updater.ts:254`](../src/main/updater.ts) | 打开或聚焦单例「更新详情」窗口（560×680，无边框）                                                           |
| `update:close-window`    | R→M send   | `update.closeWindow()`    | 无   | 无返回值               | [`src/main/updater.ts:257`](../src/main/updater.ts) | 只关闭 `event.sender` 所在窗口，**主窗口调用会被忽略**（防止绕过关闭守卫）；用 `send` 避免 `invoke` 的回复随窗口销毁丢失 |
| `update:request-install` | R→M invoke | `update.requestInstall()` | 无   | `Promise<boolean>`     | [`src/main/updater.ts:263`](../src/main/updater.ts) | **只接受更新窗口调用**；仅 `downloaded` 状态生效，向主窗口推送 `update:install-request`                       |

### 3.7 事件推送（main → renderer）

| 通道名                   | 方向     | preload 方法                  | 载荷                                   | 触发时机                                   | 发送位置                                                                        | 备注                                                         |
| ------------------------ | -------- | ----------------------------- | -------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `open-file-from-argv`    | M→R send | `onOpenFile(cb)`              | `{ path: string; content: string }`    | 启动命令行参数 / 二次启动转发              | [`src/main/index.ts:211`](../src/main/index.ts)                                 | 渲染进程未就绪时先排队                                       |
| `renderer:ready`         | R→M send | `onOpenFile` 内部自动发送     | 无                                     | 渲染进程注册 `open-file-from-argv` 监听后  | [`src/main/index.ts:499`](../src/main/index.ts)                                 | 主进程置 `rendererReady = true` 并放行 `pendingFilePaths`    |
| `file:external-change`   | M→R send | `onExternalFileChange(cb)`    | `{ path: string; content: string }`    | 监视文件内容真实变化                       | [`src/main/index.ts:255`](../src/main/index.ts)                                 | 只在内容与 `watchedContent` 不同时发送；**返回取消监听函数** |
| `window:zoom-changed`    | M→R send | `onZoomChange(cb)`            | `number`（缩放比例）                   | 应用缩放、页面加载完成恢复缩放             | [`src/main/index.ts:160`](../src/main/index.ts)、[`:437`](../src/main/index.ts) | 页面重载会重置缩放，`did-finish-load` 后重发                 |
| `window:fullscreen`      | M→R send | `onFullscreenChange(cb)`      | `boolean`                              | 进入 / 退出全屏                            | [`src/main/index.ts:374`](../src/main/index.ts)                                 | 标题栏据此移除两侧留白                                       |
| `window:close-request`   | M→R send | `onCloseRequest(cb)`          | `{ quit: boolean }`                    | 主窗口 `close` 事件被拦截时                | [`src/main/index.ts:406`](../src/main/index.ts)                                 | `quit` 表示本次关闭来自退出应用；渲染进程确认后带着同一标志调用 `window:close` |
| `shortcut:close-tab`     | M→R send | `onCloseTabShortcut(cb)`      | 无                                     | macOS `Cmd+W` 被 `before-input-event` 拦截 | [`src/main/index.ts:353`](../src/main/index.ts)                                 | 仅 macOS；其他平台由渲染进程键盘处理                         |
| `cursor-pos`             | M→R send | `onCursorPos(cb)`             | `{ x: number; y: number }`（页面坐标） | 每 300ms 轮询一次，窗口不可见时跳过        | [`src/main/index.ts:739`](../src/main/index.ts)                                 | 用于滚动条悬停状态自愈（标题栏拖拽区不派发鼠标事件）         |
| `update:state`           | M→R send | `update.onState(cb)`          | `UpdateState`                          | 更新状态任意变化                           | [`src/main/updater.ts:63`](../src/main/updater.ts)                              | **广播给所有窗口**（主窗口 + 更新窗口）                      |
| `update:install-request` | M→R send | `update.onInstallRequest(cb)` | 无                                     | 更新窗口请求安装                           | [`src/main/updater.ts:159`](../src/main/updater.ts)                             | 只发给主窗口；主窗口负责处理未保存内容                       |

> 生命周期：所有 `on*` / `update.on*` 方法都返回取消函数（`() => ipcRenderer.removeListener(...)`）。调用方应在 `onUnmounted` 或模块级 dispose 中调用，避免 HMR / 重复挂载时监听累积。`onOpenFile` 额外承担发送 `renderer:ready` 的职责，注销函数只移除监听，不会重复发送。

## 4. 入参与返回类型

### 4.1 共享类型

**SessionData / SessionTab**（[`src/shared/session-types.ts`](../src/shared/session-types.ts)）：

| 类型          | 字段                   | 说明                                        |
| ------------- | ---------------------- | ------------------------------------------- |
| `SessionTab`  | `path: string \| null` | 文件绝对路径；从未保存过的新建文档为 `null` |
|               | `name: string`         | 标签显示名                                  |
|               | `content: string`      | 关闭时的内容（统一 LF，可能含未保存内容）   |
|               | `isModified: boolean`  | 是否有未保存修改                            |
|               | `cursorLine: number`   | 1 基光标行                                  |
|               | `cursorCol: number`    | 1 基光标列                                  |
|               | `eol?: '\n' \| '\r\n'` | 原文件换行符；旧会话缺失时按 LF 处理        |
|               | `bom?: boolean`        | 原文件是否带 UTF-8 BOM；旧会话按 false 处理 |
| `SessionData` | `tabs: SessionTab[]`   | 全部标签，顺序即标签栏顺序                  |
|               | `activeIndex: number`  | 激活标签在 `tabs` 中的下标                  |

**UpdateState**（[`src/shared/update-types.ts`](../src/shared/update-types.ts)）：

| 字段             | 类型             | 说明                                                                                                      |
| ---------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `status`         | `UpdateStatus`   | `disabled` / `idle` / `checking` / `available` / `not-available` / `downloading` / `downloaded` / `error` |
| `currentVersion` | `string`         | 当前应用版本（来自 `app.getVersion()`）                                                                   |
| `latestVersion?` | `string`         | 平台返回的最新版本                                                                                        |
| `notes?`         | `string`         | 更新说明；已剔除首行 `[force]` 标记                                                                       |
| `forceUpdate`    | `boolean`        | 是否强制更新（平台在 releaseNotes 首行前置 `[force]`）                                                    |
| `progress?`      | `UpdateProgress` | `percent` / `bytesPerSecond` / `transferred` / `total`                                                    |
| `error?`         | `string`         | 失败原因                                                                                                  |

### 4.2 内联对象类型

| 结构                | 出现通道                                                                                 | 字段                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `{ path, content }` | `dialog:openFiles` 返回、`file:read` 返回、`open-file-from-argv`、`file:external-change` | `path: string`、`content: string`                                                                    |
| 图片保存参数        | `dialog:saveImage`                                                                       | `fileName: string`、`data: Uint8Array`、`extension: 'svg' \| 'png'`                                  |
| PDF 选项            | `export:pdf`                                                                             | `PdfExportOptions`（[`src/shared/pdf-types.ts`](../src/shared/pdf-types.ts)）：`pageSize`、`margin`、`showPageNumbers`、`showToc`、`fileName` |
| 文件读取结果        | `dialog:openFiles` 返回、`file:read` 返回、`open-file-from-argv`、`file:external-change` | `FileReadResult`（[`src/shared/file-types.ts`](../src/shared/file-types.ts)）：`path`、`content` |

> `PdfExportOptions` 与 `FileReadResult` 都放在 `src/shared`，preload、主进程与渲染进程共用同一份声明，不再维护内联重复类型。新增字段时改共享类型即可，类型检查会覆盖三处调用。

## 5. 关键契约与约束

### 5.1 文件监视

1. 主进程同一时刻**只监视一个文件**，即渲染进程当前活跃标签对应的磁盘文件；`watchedFilePath` 是唯一事实来源。
2. `file:watch` 传入 `null`（或空串）取消监视；卸载 `useFileWatcher` 时也会主动取消。
3. 使用 `fs.watchFile` 轮询（400ms）而非 `fs.watch`：Windows 上「写临时文件再重命名」会让 `fs.watch` 丢失目标。
4. 监视事件先做 150ms 短防抖，避免读到其他程序尚未写完的中间内容。
5. 读取后比对 `content === watchedContent`，相同则**不推送**；应用自身 `file:save` 写盘时会同步 `watchedContent`（另存为也走 `file:save`），因此**保存不会产生回环事件**。
6. 读取期间切换了监视目标（`watchSeq` 变化）或路径已不匹配时，丢弃过期结果。
7. 渲染进程侧还有两道防线：`useFileWatcher` 的 `switchSeq`（切换标签序号）与 `generations`（每个文件的代次），丢弃晚到的旧读取结果。

### 5.2 外部变更的应用语义

`file:external-change` 只表示「磁盘内容与主进程已知版本不同」，渲染进程按 [`useFile.applyExternalContent`](../src/renderer/src/composables/useFile.ts) → `reconcileDiskContent` 处理：

| 情形                                             | 行为                                                    |
| ------------------------------------------------ | ------------------------------------------------------- |
| 磁盘内容与编辑器内容一致（比较时忽略 CRLF 差异） | 只同步 `diskContent`（`markSaved`），不标记修改         |
| 磁盘内容与 `diskContent` 一致                    | 没有外部变化，忽略                                      |
| 本地未修改                                       | 直接 `replaceContent`，并删除该标签缓存的 `EditorState` |
| 本地有未保存修改（被动刷新）                     | 静默保留本地内容，不打断编辑；等到保存时再弹冲突确认    |
| 本地有未保存修改（手动 F5）                      | 立即弹出「覆盖磁盘 / 载入磁盘 / 取消」，可查看逐行 diff |

### 5.3 链接与导航

1. 渲染进程**不得直接导航**到外部地址；预览中的链接点击统一走 `shell:openExternal` 或 `file:reveal`。
2. 仅 `http` / `https` / `mailto` 放行给系统默认程序；`file:` 转为在文件管理器中定位；`ftp`、`tel`、`javascript:` 等其余协议一律忽略。
3. 主进程还有兜底：`setWindowOpenHandler` 一律拒绝新窗口并转交系统打开；`will-navigate` 对非应用自身页面地址 `preventDefault` 后转交系统打开，避免主窗口被导航走导致界面丢失。
4. 页内锚点（`#heading-N`）保留浏览器原生跳转，不经过主进程。

### 5.4 `markit-file://` 协议

- 仅用于预览本地图片：`markit-file://local/?p=<encodeURIComponent(绝对路径)>`。
- 主进程按**图片扩展名白名单**校验：`png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?`；非图片返回 `415`，缺路径返回 `400`。
- 不得放宽为任意文件读取通道；路径来自 Markdown 内容，属于不可信输入。
- 该协议在 `app.whenReady()` 前通过 `registerSchemesAsPrivileged` 声明为 `standard` / `secure` / `supportFetchAPI` / `stream` / `bypassCSP`。

### 5.5 更新安装顺序

1. `update:install` 只在 `status === 'downloaded'` 且调用方是**主窗口**时生效，否则返回 `false`。
2. 安装前必须由**主窗口**处理所有未保存文档：主窗口监听 `update:install-request`，逐个确认并保存，再 `flushSession()`，最后调用 `update:install`。
3. 更新详情窗口不能直接安装：它调用 `update:request-install`（该通道拒绝主窗口调用），由主进程把请求转交主窗口（还原 / 显示 / 聚焦后发送 `update:install-request`）。
4. 主进程安装前调用 `beforeInstall()` 置 `allowClose = true`，放行窗口关闭守卫，避免安装器等待窗口关闭而卡住。
5. 关闭守卫（`window:close-request`）与安装请求是两条独立链路，二者都必须走「渲染进程确认 → `window:close` / `update:install`」。

### 5.6 会话读写容错

| 场景                                        | 行为                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `session.json` 不存在                       | `session:load` 返回 `null`                                           |
| JSON 解析失败 / 读取异常                    | 记录 `console.error`，返回 `null`                                    |
| 顶层不是对象 / `tabs` 非数组                | `parseSessionData` 返回 `null`，保持现有标签页                       |
| 单个 tab 字段缺失或类型不符                 | 逐字段兜底：`path` 非字符串转 `null`、`content` 非字符串丢弃该 tab、`cursor*` 取正数、`eol` 取 `\n` / `\r\n`、`bom` 取布尔 |
| `tabs` 为空数组                             | 返回 `null`，不替换标签                                              |
| `activeIndex` 越界 / 非数字                 | 收敛到 `0..tabs.length - 1`                                          |
| 写入失败                                    | 记录 `console.error`，返回 `false`；渲染进程在状态栏显示「会话保存失败」 |
| 渲染进程恢复时 `tabs` 非数组或为空          | 保持现有标签页不变                                                   |
| 恢复时某个 `path` 读取失败                  | 回退使用会话中保存的 `content`                                       |
| 恢复时 `path` 读取成功                      | **以磁盘内容为准**覆盖会话内容，并同步磁盘当前的行尾 / BOM 策略     |

### 5.7 启动就绪与排队

- 主进程用 `rendererReady` 标记渲染进程是否已注册 `open-file-from-argv` 监听；不能用 `webContents.isLoading()` 判断（`did-finish-load` 触发时它仍可能为 `true`）。
- `did-start-loading` 时重置 `rendererReady = false`，页面重载后重新等待 `renderer:ready`。
- 渲染进程还有一个独立队列：会话恢复完成前收到的命令行文件先缓存，恢复完成后再打开，避免被 `restoreSession` 整体替换掉。

### 5.8 IPC 调用来源校验

所有通道统一经 [`src/main/ipc-guard.ts`](../src/main/ipc-guard.ts) 的 `registerHandle` / `registerOn` 注册：

| 校验项             | 规则                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| 页面来源           | `event.senderFrame.url` 必须是应用自身页面（开发模式按 `ELECTRON_RENDERER_URL` 的 origin 比较，打包后比较 `renderer/` 目录） |
| 拒绝行为           | `invoke` 通道抛出 `Untrusted IPC sender`；`send` 通道记录 `console.warn` 后忽略                   |
| 窗口控制通道       | `window:*` 额外要求调用方是主窗口的 `webContents`，更新窗口无法借 `window:close` 绕过关闭守卫      |
| `update:close-window` | 只关闭调用方自身窗口，主窗口调用被忽略                                                         |

新增通道必须使用这两个封装，不要直接调用 `ipcMain.handle` / `ipcMain.on`。

## 6. 关键链路

### 6.1 打开文件（含 `renderer:ready` 排队）

```mermaid
sequenceDiagram
    autonumber
    participant OS as 操作系统 / 用户
    participant M as 主进程
    participant R as 渲染进程
    participant S as useSession / useFile

    OS->>M: 双击文件 / 命令行参数 / 二次启动
    M->>M: extractFilePaths(argv)
    alt 渲染进程尚未 ready
        M->>M: pendingFilePaths.push(path)
    else 已 ready
        M->>M: readFile(path, 'utf-8')
        M-->>R: send('open-file-from-argv', { path, content })
    end

    R->>R: preload 注册 on('open-file-from-argv')
    R->>M: send('renderer:ready')
    M->>M: rendererReady = true；splice 取出 pendingFilePaths
    loop 按传入顺序
        M->>M: readFile(path)
        M-->>R: send('open-file-from-argv', { path, content })
    end

    R->>S: onOpenFile 回调
    alt 会话恢复未完成
        S->>S: pendingOpenFiles.push(...)
    else 恢复完成
        S->>S: file.openFileFromPath(result)
        S->>S: docs.openPathDocument(path, content)
        Note over S: 已打开过则激活原标签
        Note over S: 唯一占位标签则直接替换
    end
```

### 6.2 外部文件变更

```mermaid
sequenceDiagram
    autonumber
    participant M as 主进程
    participant R as useFileWatcher
    participant F as useFile
    participant D as documents store

    Note over M: 仅监视 activeDoc.path 对应文件（watchFile 400ms 轮询）
    M->>M: 150ms 防抖后 readFile
    alt 读取失败或 seq 过期
        M->>M: 丢弃，保留编辑器现有内容
    else content === watchedContent
        M->>M: 无真实变化，不推送
    else 内容变化
        M->>M: watchedContent = content
        M-->>R: send('file:external-change', { path, content })
        R->>R: bumpGeneration(path)
        R->>R: 校验 activeDoc.path 一致
        R->>R: enqueue（同文件只保留最新）→ drain 串行处理
        R->>F: applyExternalContent(change)
        F->>D: reconcileDiskContent(doc, content, false)
        alt 本地未修改
            D->>D: replaceContent：content = diskContent = 新内容，清除 EditorState
        else 本地有未保存修改
            D->>D: 保留本地内容，等待保存时冲突确认
        end
    end
```

### 6.3 更新窗口请求安装

```mermaid
sequenceDiagram
    autonumber
    participant U as 更新详情窗口
    participant M as 主进程 updater
    participant W as 主窗口 App.vue

    U->>M: invoke('update:request-install')
    alt status !== 'downloaded'
        M-->>U: false（不转发）
    else 已下载
        M->>M: 主窗口 restore / show / focus
        M-->>W: send('update:install-request')
        W->>W: saveAllBeforeExit('安装更新')
        loop 每个 isModified 标签
            W->>W: confirmUnsaved（保存 / 放弃 / 取消）
            alt 选择保存
                W->>M: invoke('file:save')（另存为先 chooseSavePath）
            else 取消
                W->>W: 中止安装
            end
        end
        W->>M: invoke('session:save', snapshot)
        W->>M: invoke('update:install')
        M->>M: beforeInstall() 置 allowClose = true
        M->>M: setImmediate(quitAndInstall(false, true))
        M-->>U: 应用退出
    end
```

### 6.4 关闭窗口与退出应用

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant M as 主进程
    participant R as 渲染进程

    alt 点击关闭按钮 / Cmd+W 关闭窗口
        U->>M: 窗口 close 事件
        M->>M: pendingQuit = false
    else macOS Cmd+Q / 菜单退出
        U->>M: app.before-quit
        M->>M: pendingQuit = true
        U->>M: 窗口 close 事件
    end

    M->>M: allowClose 为假 → preventDefault
    M-->>R: send('window:close-request', { quit: pendingQuit })
    M->>M: pendingQuit = false（一次性，取消后不残留）
    R->>R: saveAllBeforeExit('关闭窗口')
    alt 用户取消或保存失败
        R->>R: 不调用 close，应用保持运行
    else 已完成确认
        R->>M: invoke('window:close', quit)
        M->>M: allowClose = true；mainWindow.close()
        opt quit === true
            M->>M: app.quit()（macOS 关窗默认不退出，需显式退出）
        end
    end
```

> `allowClose` 与 `pendingQuit` 都在 `createWindow()` 中复位：macOS 关闭窗口后进程驻留，Dock 重新开窗的新窗口必须重新走关闭守卫。

## 7. 新增 IPC 操作清单

- [ ] **先确认必要性**：能用现有通道组合完成就不新增；新增通道需在设计文档中说明用途与安全边界。
- [ ] **命名**：`模块:动作`，全小写，动作用连字符（如 `file:read`、`window:get-zoom`）。
- [ ] **主进程注册**：文件 / 窗口 / 会话类放 [`src/main/index.ts`](../src/main/index.ts)，更新类放 [`src/main/updater.ts`](../src/main/updater.ts)；用 `registerHandle`（需要返回值）/ `registerOn`（单向通知）注册，自动带上来源校验。
- [ ] **入参校验**：所有来自渲染进程的参数都视为不可信，校验类型、扩展名、路径与协议白名单；不得放宽 `markit-file` 的图片白名单。
- [ ] **preload 转发**：在 [`src/preload/index.ts`](../src/preload/index.ts) 的 `api` 对象中添加方法；请求-响应用 `ipcRenderer.invoke`，单向用 `ipcRenderer.send`；**显式标注返回类型**，不要依赖 `any`。
- [ ] **事件监听**：返回取消函数（参照 `onExternalFileChange`），并在 `onUnmounted` 中调用，避免 HMR 或重复挂载导致监听累积。
- [ ] **类型契约**：跨进程共享的纯类型放 `src/shared/`；`src/preload/index.d.ts` 通过 `ExposedAPI` 自动派生，无需手写方法，但需确认 `Window` 声明仍生效。
- [ ] **窗口存活判断**：发送事件前检查 `win && !win.isDestroyed()`；高频定时器在窗口不可见时跳过发送。
- [ ] **渲染进程规范**：只调用 `window.api`，禁止 `import 'electron'`，不得重新暴露通用 `window.electron` / `ipcRenderer`。
- [ ] **文档同步**：更新本文第 3 节通道表与第 4 节类型表。
- [ ] **验证**：`npm run lint` + `npm run typecheck`；涉及主进程 / 窗口 / IPC 的改动必须 `npm run dev` 实际启动验证，并在交付说明中写清验证方式。

## 8. 相关文件

| 文件                                                                                                  | 职责                                                                                        |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`src/main/index.ts`](../src/main/index.ts)                                                           | 窗口生命周期、文件读写与监视、`markit-file` 协议、PDF 导出、窗口 / 文件 / 会话 / 对话框 IPC |
| [`src/main/updater.ts`](../src/main/updater.ts)                                                       | `electron-updater` 初始化、`update:*` 通道、状态广播、更新详情窗口                          |
| [`src/preload/index.ts`](../src/preload/index.ts)                                                     | `window.api` 白名单与所有 `ipcRenderer` 调用                                                |
| [`src/preload/index.d.ts`](../src/preload/index.d.ts)                                                 | `Window.api: ExposedAPI` 类型声明                                                           |
| [`src/shared/session-types.ts`](../src/shared/session-types.ts)                                       | `SessionTab`、`SessionData`                                                                 |
| [`src/shared/update-types.ts`](../src/shared/update-types.ts)                                         | `UpdateStatus`、`UpdateProgress`、`UpdateState`                                             |
| [`src/renderer/src/composables/useFile.ts`](../src/renderer/src/composables/useFile.ts)               | 文件打开 / 保存 / 冲突协调 / 外部变更应用                                                   |
| [`src/renderer/src/composables/useFileWatcher.ts`](../src/renderer/src/composables/useFileWatcher.ts) | 活跃文件监视切换、代次校验、变更串行处理                                                    |
| [`src/renderer/src/composables/useSession.ts`](../src/renderer/src/composables/useSession.ts)         | 会话快照、恢复、防抖保存、启动文件排队                                                      |
| [`src/renderer/src/stores/update.ts`](../src/renderer/src/stores/update.ts)                           | 主进程更新状态镜像与操作封装                                                                |
| [`src/renderer/src/App.vue`](../src/renderer/src/App.vue)                                             | 关闭窗口 / 安装更新前处理未保存内容                                                         |
| [`src/renderer/src/update/UpdateWindow.vue`](../src/renderer/src/update/UpdateWindow.vue)             | 更新详情窗口，调用 `update:request-install`                                                 |
| [`CLAUDE.md`](../CLAUDE.md)                                                                           | 项目架构与 IPC 三处同步约定                                                                 |
| [`rules/code-style.md`](../rules/code-style.md)                                                       | IPC 命名、进程边界与日志规范                                                                |
