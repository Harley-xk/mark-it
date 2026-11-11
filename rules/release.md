# AI 工作规则 —— 发版通道

> 优先级仅次于 [base.md](base.md)。本规则约束 stable / beta 双通道的版本号、发版节点、更新说明与发布操作，所有涉及发版的改动与操作都必须遵守。完整设计、客户端行为与发版步骤见 [docs/发版通道.md](../docs/发版通道.md)。

## 1. 通道与版本号

1. 两个通道：`stable`（正式版）、`beta`（预发布）。通道由版本号自动推断：含 `-beta.N` 即 beta，否则为 stable。
2. 版本号必须是 semver：`X.Y.Z` 或 `X.Y.Z-beta.N`。禁止 `-beta-1`、`-beta1`、`-rc.N`、`-alpha.N` 等其它预发布形式。
3. beta 的 base 必须是「下一个要发布的正式版」，且**严格大于最后一个正式版**：
   - `1.5.0` 之后只能从 `1.5.1-beta.1` 或 `1.6.0-beta.1` 开始；
   - 不能是 `1.5.0-beta.1`（低于正式版 1.5.0），也不能是 `1.4.2-beta.1`。
4. 同一 base 内 `beta.N` 递增；换 base 时从 `beta.1` 重新开始。
5. **严格单序列**：任何新版本（不论通道）必须大于已发布的全部版本。
6. beta 线打开期间**禁止发布更低的正式补丁版**（例如已有 `1.6.0-beta.3` 时不能发 `1.5.1`）。
7. 紧急修复只能：进当前 beta 线发布新的 beta，并尽快发布正式版；不得为了抢发补丁破坏版本单调性。
8. 正式版发布后禁止补发同 base 的 beta（如 `1.5.1` 之后不能发 `1.5.1-beta.1`）。

## 2. 发版节点与更新说明

1. **tag 是发版节点的唯一记录**：stable 为 `vX.Y.Z`，beta 为 `vX.Y.Z-beta.N`。不维护人工清单。
2. 禁止用 `git describe --tags --abbrev=0` 取全局最新 tag；必须按通道取上一个节点。
3. 更新说明从**上一个同通道 tag** 开始收集：
   - beta：`<上一个 beta tag>..HEAD`；
   - stable：`<上一个 stable tag>..HEAD`，必须覆盖自上一次正式版以来的**全部**用户可感知变化，包含其间所有 beta 的提交，不能只写最后一个 beta 的增量。
4. 发版前必须运行 `node scripts/release/channel-state.mjs status`，确认两个通道的节点与待收录提交。
5. 发版前必须运行 `node scripts/release/channel-state.mjs validate --version <版本号>`；CI 的 `validate` 阶段会执行同一校验。
6. 如果某个 tag 已创建但发布被放弃，必须删除该 tag 后再发下一个版本，否则下一个版本会漏收录这段提交。
7. 更新说明仍按 [docs/github-release.md 3.1](../docs/github-release.md#31-更新说明撰写规则) 提炼：面向用户、去除技术细节、合并同类项、控制在 3–8 条。

## 3. 发布操作

1. 推荐使用 `workflow_dispatch` 手动触发并传入提炼后的 `notes`；标签触发只用于说明无需人工整理的内部版本。
2. 通道由版本号自动推断，不要额外传通道参数。stable 使用 `.apphub-release.ci.json`，beta 使用 `.apphub-release.beta.ci.json`。
3. `upload` 子命令只读配置文件里的 `channel`，不支持 `--channel`；本地发 beta 必须使用 beta 配置文件，不能只改命令行参数。
4. **不得修改 `scripts/release/apphub.mjs`**：它是会自更新的技能快照，本地改动会被覆盖。需要通道差异时新增配置文件。
5. 发布 beta 前确认 apphub 已存在 `beta` 通道；更新端点返回 404 表示通道暂无发布，属正常状态，不是故障。
6. 发布后必须核对：
   - `verify` 在三平台均通过；
   - beta 的 GitHub Release 带 `prerelease` 标记，不会被当作 latest；
   - stable 的更新说明包含 beta 期间的全部改动；
   - 更新说明与 apphub 上的说明口径一致。
7. 首批上线可以先用正式版带出 Beta 开关，也可以先发 beta；无论哪种顺序，beta 都必须满足第 1 节的版本规则，且旧客户端只会看到 stable。
8. CI 发布必须使用 `prepare` + 三平台并行 `upload` 编排：`prepare` 只创建或复用一次草稿，三个上传任务必须 `fail-fast: false`，`publish` 只能在全部平台上传成功后执行。单平台失败时保留草稿，修复后按同一版本重跑并按需启用 `replace`。

## 4. 客户端契约（不可随意改）

1. `UpdateChannel`、`UpdateState.betaUpdatesEnabled` / `currentChannel` / `latestChannel` 是跨进程契约；修改时必须同步主进程、preload、渲染层，并更新 [docs/自动更新.md](../docs/自动更新.md)、[docs/状态与数据模型.md](../docs/状态与数据模型.md)、[docs/发版通道.md](../docs/发版通道.md)。
2. Beta 开关持久化在主进程 `userData/update-preference.json`，默认关闭。不得改为 localStorage，不得改变默认值。
3. 关闭 Beta 只停止接收 beta，**不得自动降级**已安装的 beta；不得提供常驻降级通道。用户可在设置页主动发起一次回退到 stable 当前最新版本，回退前必须关闭 Beta 开关；下一个正式版发布后仍按正常升级自动归队。
4. beta 通道 404 必须按「没有 beta」处理，不能把开关开启变成错误状态。
5. 双通道选择必须「取大于当前版本的最高版本」；不得简化成先查某个通道、查到就返回。
6. 已下载的更新不因切换开关而中断；下一次检测按新偏好执行。这条行为必须保留并在设置页说明。

## 5. 发版相关完成定义

1. 业务改动先更新 `docs/` 与内置用户手册（[base.md](base.md) 第 4 节）；发版规则或流程变化同步更新本文件与 [docs/发版通道.md](../docs/发版通道.md)。
2. 发版前：`npm run lint`、`npm run typecheck`、`npm test` 通过；涉及 workflow、发版配置或打包配置时执行 `npm run build`。
3. 涉及主进程 / IPC / 更新流程的改动，必须按 [testing.md](testing.md) 执行 `npm run dev` 与打包产物验证。
4. 发版后按 [docs/测试与质量保障.md](../docs/测试与质量保障.md) 的 MV-27 / MV-27A / MV-27B 核对更新状态与 Beta 开关。
