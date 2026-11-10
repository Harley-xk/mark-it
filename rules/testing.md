# AI 工作规则 —— 测试策略

> 优先级仅次于 [base.md](base.md)。本规则回答「什么时候写测试、写在哪一层、写到什么程度」。
> **当前状态：仓库已引入 Vitest（纯函数单元测试）与 Playwright（Electron e2e 冒烟）。** 命令：`npm test`、`npm run test:e2e`；配置见 `vitest.config.ts`、`playwright.config.ts`。

## 1. 核心原则：风险驱动，不按文件结构驱动

1. 测试的存在理由是**守护风险**，不是凑结构：逐文件配 spec 是仪式性负担，且给人「覆盖完备」的错觉（覆盖的是行数，不是风险）
2. 每个用例应能回答「**它防的是哪个未来错误**」；答不上来的用例应当删除
3. 类型系统能保证的（字段赋值、参数传递形态）不重复用单测守护
4. 「`*.spec.ts` 与源码同目录」是**位置约定**，不是「每个源码文件必须配 spec」的覆盖率要求

## 2. 自动化测试与手工验证的分工

自动化覆盖纯函数与可稳定启动的界面路径；跨进程、系统对话框、平台差异仍以手工验证为主。高风险区域改动后必须实际运行验证，并在交付说明 / 提交信息中写清验证方式：

| 风险区域                 | 代码位置                                                       | 最低验证要求                                                                  |
| ------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 文件读写、路径处理、编码 | `src/main/index.ts`、`src/renderer/src/composables/useFile.ts` | `npm run dev` 下打开、保存、另存为各一次                                      |
| 文件监听与保存冲突检测   | `useFileWatcher.ts`、`utils/text-diff.ts`                      | 外部修改文件后观察被动刷新与差异弹窗；`npm test` 的 diff 用例通过             |
| 会话恢复（多标签）       | `useSession.ts`、`src/shared/session-types.ts`                 | 退出后重启，确认标签、光标、激活项还原                                        |
| 滚动同步 / 布局切换      | `useScrollSync.ts`、`SplitPane.vue`                            | 三种布局各滚动一次，确认双向联动                                              |
| Mermaid 识别与导出       | `utils/mermaid.ts`、`utils/diagram-export.ts`                  | 渲染、弹窗预览、导出图片各一次；`npm test` 的语言标记用例通过                 |
| PDF 导出                 | `usePdfExport.ts`、`PdfExportDialog.vue`                       | 导出一次并打开产物检查分页与目录                                              |
| 自动更新与回退           | `src/main/updater.ts`、`src/main/update-channel.ts`、`stores/update.ts` | 至少验证「检查更新 → 状态渲染」不报错；周期检测可按 MV-27A；Windows / Linux 打包产物还要验证 Beta 主动回退、失败恢复与 Beta 关闭持久化 |
| 本地图片协议             | `markit-file://`（`src/main/index.ts`）                        | 相对路径图片正常显示；非图片扩展名被拒绝                                      |

修复缺陷时，如果缺陷能在纯函数层复现（如 `text-diff.ts`、`mermaid.ts`、`local-image.ts`、`frontmatter.ts`），必须补一条同目录 `*.spec.ts` 回归用例。

## 3. 测试层级与分工

### 3.1 单元测试：Vitest

> 选择 Vitest 而非 Jest：与项目现有 Vite 构建链一致，无需额外的 transform 配置。配置见 `vitest.config.ts`，运行环境为 `node`。

- 适用范围：`src/renderer/src/utils/**`、`src/shared/**`、`src/main` 中可脱离 Electron 运行的纯逻辑
- **必须**重点测：有分支 / 边界 / 易错逻辑（递归与循环引用、状态转换、日期与路径处理、diff 计算）
- **必须**测的契约：「扩展名白名单不得放宽」「敏感信息不得写入会话」「A 必须先于 B 判断」等
- **不写**：纯赋值 / 构造传参 / DTO、纯类型与常量定义
- mock 只 mock **边界**（`fs`、`electron` 模块、`ipcRenderer`），不 mock 被测对象的内部实现
- 纯函数应从当前耦合文件中抽出后再测，不在测试里复制实现
- 涉及 DOM 的纯逻辑（如 `mermaid.ts` 的语言标记识别）可用最小假对象测试；需要真实 DOM 的能力放到 e2e

### 3.2 端到端测试：Playwright（Electron）

- 适用范围：用户可见的完整路径——打开文件、多标签切换、保存冲突、主题切换、导出 PDF、更新提示窗口
- 依赖真实后端 / 网络（如更新检查）的用例，探测失败时应**自动跳过**，不能让 CI 随机红
- 仅测试需要的临时文件与目录放在临时目录，不写入仓库
- `playwright.config.ts` 固定 `workers: 1`：Electron 单实例锁不允许并行启动多个实例
- e2e 依赖 `npm run build` 产物；产物不存在时用例应 `test.skip`，并在交付说明中写清是否执行过

### 3.3 不为测试污染业务代码

不得为了测试在 `src/` 中添加演示入口、调试端点或 `if (isTest)` 分支；测试专用代码只存在于测试文件内。需要测试接缝时，优先抽取纯函数或依赖注入（例如 `normalizePath` 增加可选的大小写参数），不改变生产行为。

## 4. 测试自身的规范

1. 用例名用**中文描述行为**（「应将扩展名白名单外的文件判定为非法」），不照抄函数名
2. 测试文件豁免头部注释（见 [base.md](base.md) 第 1 节）
3. 删除源码时同步删除其 spec；重构使用例失去守护对象时**删除**该用例，而不是改写成形式化断言保绿
4. **测试符号一律显式导入**：从 `vitest` 导入 `describe` / `it` / `expect` / `vi`，从 `@playwright/test` 导入 `test` / `expect`——不依赖全局注入，避免 IDE 类型归属歧义
5. 测试文件命名 `*.spec.ts`，与被测源码同目录；e2e 用例放 `e2e/` 目录

## 5. 横切设施的改动要求

`src/renderer/src/utils/`、`src/shared/`、`src/preload/` 属于被所有功能依赖的底座：

1. 修改这些目录时必须执行**全量** `npm run lint` + `npm run typecheck` + `npm test`，而不是只看当前文件
2. `src/renderer/src/utils/` 的分支覆盖要求高于业务组件，防御性兜底分支（错误回退、空值处理）也要有用例
3. 修改 `src/preload/index.ts` 或 `index.d.ts` 时，必须同时核对调用方，避免类型与运行时暴露面不一致
