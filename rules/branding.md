# AI 工作规则 —— 品牌与产品标识

> 优先级仅次于 [base.md](base.md)。本规则约束 AI 对产品标识、持久化键、协议名与发布配置的改动，防止「看起来无害的重命名」破坏安装升级、自动更新或用户历史数据。

## 1. 不得擅自修改的标识

以下标识**不得在普通功能开发中顺手修改**；确需变更时必须单独提出，说明迁移方案（旧数据兼容、旧版本升级路径、发布渠道同步）并获得确认。

| 标识 | 现值 | 位置 | 擅自修改的后果 |
| --- | --- | --- | --- |
| 应用 ID | `com.harley.markit` | [electron-builder.yml](../electron-builder.yml) | 安装 / 升级被识别为另一个应用，用户无法覆盖升级 |
| 产品名 | `Mark It` | [electron-builder.yml](../electron-builder.yml) | 可执行文件名、快捷方式、卸载项全部改名 |
| npm 包名 | `mark-it` | [package.json](../package.json) | 打包产物命名与应用内路径约定变化 |
| 更新端点 | `https://appcenter.witice.top/api/update/ah_q100pquj6kxxj9at/stable/electron` | [electron-builder.yml](../electron-builder.yml) | 客户端收不到更新 |
| apphub 应用标识 | `appKey: ah_q100pquj6kxxj9at`、`channel: stable` | [.apphub-release.json](../.apphub-release.json)（本地，已 gitignore） | 发布到错误应用或错误渠道 |
| 更新缓存目录 | `mark-it-ev-updater` | [dev-app-update.yml](../dev-app-update.yml) | 开发期与正式版缓存互相干扰 |
| 自定义协议 | `markit-file://` | [src/main/index.ts](../src/main/index.ts) | 预览图片全部失效 |
| 持久化键前缀 | `markit-*` | [src/renderer/src/stores/app.ts](../src/renderer/src/stores/app.ts) | 用户主题、布局、窗口配置全部丢失 |
| 版权声明 | `Copyright © 2026 witice.top` | [electron-builder.yml](../electron-builder.yml) | 安装包元信息错误 |

## 2. 产品名称写法

仓库中同时存在两种写法，各有用途，**不要互相「纠正」**：

| 场景 | 写法 | 示例 |
| --- | --- | --- |
| 界面文案、文档、README、更新提示 | `MarkIt`（无空格） | 窗口标题、`welcome.md`、更新弹窗标题 |
| 安装包 / 可执行文件 / 快捷方式 / 卸载项 | `Mark It`（有空格，来自 `productName`） | 开始菜单快捷方式名 |

- 界面与文档中新增的品牌文案统一写 **MarkIt**
- 不要在渲染进程代码里硬编码产品名；需要显示产品名时优先复用已有常量或 `productName` 派生值
- 禁止把品牌名写进 CSS 类名、存储键、协议名等非展示性标识

## 3. 品牌化改动的边界

1. 品牌相关改动**只做展示层**：产品名、窗口标题、图标、界面文案、安装包元信息
2. **不**为了「品牌统一」去改框架层面的标识：目录名、类型名、CSS 变量、组件名、IPC 通道名、存储键前缀。这些改动不产生用户价值，却会制造无意义的冲突与回归
3. 图标资源统一放在 `build/`（安装包图标）与 `resources/`（运行时图标），替换时保持文件名与尺寸规格不变；`.icns` / `.ico` 由 `scripts/pad-icon.cjs` 等脚本生成，不手工二进制替换
