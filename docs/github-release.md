# GitHub Actions 发版说明

本文档说明 Mark It 如何通过 GitHub Actions 完成 Windows / macOS / Linux 三平台并行打包、上传 apphub 自动发布，并把同一批产物同步到对应版本的 GitHub Release。

适用仓库：[Harley-xk/mark-it](https://github.com/Harley-xk/mark-it)

## 1. 总体流程

```mermaid
flowchart TD
    T["推送 v* 标签（或手动触发）"] --> V["validate<br/>校验 semver 与严格单序列<br/>推断 stable / beta 通道"]
    V --> B["build<br/>matrix 三平台并行构建"]
    B --> W["windows-latest<br/>NSIS exe + blockmap"]
    B --> M["macos-latest<br/>dmg + universal zip"]
    B --> L["ubuntu-latest<br/>AppImage + deb"]
    W --> D["draft<br/>下载全部产物"]
    M --> D
    L --> D
    D --> D1["create-version<br/>同一版本草稿，已存在则复用"]
    D --> D2["逐平台 upload 到 apphub"]
    D1 --> P["publish<br/>自动发布 → 逐平台 verify"]
    D2 --> P
    P --> G["github-release<br/>创建 / 更新 vX.Y.Z 的 GitHub Release<br/>并把同一批产物作为 Release 附件上传"]
```

发布没有人工审批环节：草稿上传完成后立即对客户端可见；GitHub Release 在 apphub 发布并验证通过后生成。

## 2. 前置条件

- 仓库 Actions 已启用（公开仓库默认启用）
- 仓库 Secrets 已配置：
  - `APPHUB_USERNAME`
  - `APPHUB_PASSWORD`
  - `APPHUB_SIGN_SECRET`

Secrets 只在 workflow 运行时注入，不写入仓库文件。

## 3. 推荐发版步骤（标签触发）

```bash
# 1. 切到主分支并同步
git checkout master
git pull origin master

# 2. 更新版本号（只改 package.json / package-lock.json，不自动建 tag）
npm version 1.4.0 --no-git-tag-version

# 3. 提交版本变更
git add package.json package-lock.json
git commit -m "chore(release): 发布 1.4.0"

# 4. 打 tag 并推送，触发 workflow
git tag v1.4.0
git push origin master v1.4.0
```

版本号必须是 semver：`MAJOR.MINOR.PATCH`，可带 `-beta.1` 后缀。通道由版本号自动推断：含 `-` 走 `beta`，否则走 `stable`。版本号必须满足严格单序列（任何新版本大于所有已发布版本），规则与发版节点见 [发版通道与 Beta 更新](./发版通道.md)。

推送 tag 后：

- 版本号 = tag 去掉 `v` 前缀
- 更新说明自动生成：取**上一个同通道 tag** 到当前提交之间的 commit 标题（过滤 `chore(release)`）；没有 tag 时退回到上一个 `chore(release)` 提交；再没有则取最近 10 条
- 构建完成后自动发布，无需任何确认

### 3.0 Beta 发版

beta 与正式版走同一条流水线，只是通道与配置不同：

```bash
node scripts/release/channel-state.mjs status   # 确认两个通道的节点

npm version 1.6.0-beta.1 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore(release): 发布 1.6.0-beta.1"
git tag v1.6.0-beta.1
git push origin master v1.6.0-beta.1
```

发布规则：

1. beta 的 base 必须严格大于最后一个正式版：`1.5.0` 之后只能从 `1.5.1-beta.1` 或 `1.6.0-beta.1` 开始；
2. 同一 base 内递增 `beta.N`；换 base 从 `beta.1` 重新开始；
3. beta 线打开期间不能再发更低的正式版；紧急修复进 beta 线并尽快发布正式版；
4. beta 版本的 GitHub Release 自动标记为 prerelease，不会被当作 latest。

> **注意**：自动生成的是 commit 标题，含技术细节，只能作为素材。正式发版前必须按 [3.1 更新说明撰写规则](#31-更新说明撰写规则) 提炼，并通过第 4 节手动触发传入 `notes`；不要在说明未整理的情况下直接推送 tag 发布。

### 3.1 更新说明撰写规则

更新说明面向**最终用户**，不是提交日志。自动生成的 commit 标题只作为素材，**不得直接对外发布**。

**按通道收集**：beta 的说明只覆盖上一次 beta 之后的改动；正式版的说明必须覆盖自上一次正式版以来的**全部**用户可感知变化，天然包含其间所有 beta 的提交，不能只写最后一个 beta 的增量。

1. **范围按「是否对用户有价值」确定**：不局限于可见的界面变化——新增能力、交互与行为变化、性能 / 稳定性 / 兼容性等体验改善、影响使用的问题修复都应写入；纯内部且对用户没有价值的清理可以不写。**技术实现细节一律不写**：文件名、函数名、模块名、IPC 通道名、依赖版本、CI 与重构实现等，具体见下一条。
2. **去除技术细节**：不出现文件名、函数名、模块名、IPC 通道名、整改编号（如 `R-06`）、依赖版本、构建参数等实现信息；用用户能理解的产品语言描述结果。
3. **合并同类项**：同一功能的多个提交合并为一条；一次发版控制在 3–8 条，每条一句话，以「新增 / 优化 / 修复」开头。
4. **修复类写清影响**：说明用户此前遇到什么现象、现在如何，不描述内部原因与实现方式。
5. **不承诺未验证的能力**：尚未人工验收的改动（如整改清单中 🟡 状态的条目）不得写成已完成的卖点；平台限制（macOS 未签名、Linux deb 不自更新等）不在更新说明中重复。
6. **与 GitHub Release 保持一致**：`notes` 同时用于 apphub 更新弹窗与 GitHub Release 正文，需为纯文本，不使用 Markdown 标题、链接与代码块（客户端按纯文本渲染，见 [自动更新 · 更新说明的渲染方式](./自动更新.md#92-更新说明的渲染方式)）。

**推荐流程**：

```bash
# 1. 整理素材：上一版发布提交到当前 HEAD 的提交标题
git log --oneline --no-merges <上一个发布提交>..HEAD

# 2. 按上述规则提炼为 3–8 条用户语言

# 3. 手动触发发版并传入 notes（不要依赖自动生成后直接发布）
gh workflow run release.yml --ref master \
  -f version=1.5.0 \
  -f notes="- 新增：……
- 优化：……
- 修复：……"
```

示例（素材 → 可发布的更新说明）：

| 提交标题（素材，不直接发布）                                         | 更新说明（用户语言）                                       |
| -------------------------------------------------------------------- | ---------------------------------------------------------- |
| `fix(app): 完成 P2 整改，增强 PDF 健壮性并引入测试体系（R-21~R-31）` | `修复：PDF 长文档分页、图片与图表渲染更稳定`               |
| `feat(preview): 对齐 GitHub 渲染规范并新增代码高亮`                  | `优化：预览渲染对齐 GitHub 规范，代码块新增语法高亮`       |
| `feat(file): 文件变更被动刷新，保存时检测冲突并展示差异`             | `新增：文件被外部修改时自动刷新，保存前提示冲突并对比差异` |

## 4. 手动触发

适用于不想打 tag、或想自定义更新说明的场景；更新说明必须按 [3.1 更新说明撰写规则](#31-更新说明撰写规则) 提炼后传入。

网页：Actions → `Release` → Run workflow，填写参数。

命令行：

```bash
gh workflow run release.yml --ref master \
  -f version=1.4.0 \
  -f notes="- 新增格式工具栏
- 修复标签页残留"
```

参数说明：

| 参数      | 必填           | 说明                                                                   |
| --------- | -------------- | ---------------------------------------------------------------------- |
| `version` | 是（手动触发） | 手动触发时必填；标签触发时取标签名去掉 `v`                             |
| `notes`   | 否             | 更新说明；留空按第 3 节自动生成，自动结果仅作素材，发布前须按 3.1 提炼 |
| `force`   | 否             | `true` 标记为强制更新                                                  |
| `replace` | 否             | `true` 时替换已存在的平台包，仅用于重跑同一版本                        |

无需传通道参数：`validate` 阶段根据版本号是否含预发布后缀选择 `stable` / `beta`，并自动切换到对应的发版配置 `.apphub-release.ci.json` / `.apphub-release.beta.ci.json`。

## 5. 流水线阶段与产物

| 平台            | Runner           | 构建命令                                              | 上传到 apphub               | 上传到 GitHub Release                    |
| --------------- | ---------------- | ----------------------------------------------------- | --------------------------- | ---------------------------------------- |
| Windows x64     | `windows-latest` | `npm run build:win`                                   | `*-setup.exe` + `.blockmap` | `*-setup.exe` + `.blockmap`              |
| macOS universal | `macos-latest`   | `npm run build && electron-builder --mac --universal` | `*-universal.zip`           | `.dmg` + `*-universal.zip` + `.blockmap` |
| Linux x64       | `ubuntu-latest`  | `npm run build && electron-builder --linux`           | `*.AppImage` + `.blockmap`  | `*.AppImage` + `.blockmap` + `.deb`      |

说明：

- `build` 阶段的 workflow artifact 仍保留 14 天，作为构建缓存与排障副本；GitHub Release 附件是长期分发的正式产物。
- macOS 自动更新（Squirrel.Mac）只接受 zip，dmg 仅用于首次安装。
- Linux 只有 AppImage 支持自动更新，deb 供手动安装。
- `snap` 已从默认 target 移除（GitHub 托管 runner 无 snapcraft）。
- GitHub Release 的正文复用 `draft` 阶段生成的更新说明；`1.4.0-beta.1` 这类带后缀的版本会标记为 prerelease，不会被当作 latest。
- beta 版本的产物路径、上传平台与命名规则与正式版完全一致，只是写入 `beta` 通道；客户端是否接收由用户开关决定（见 [发版通道与 Beta 更新](./发版通道.md)）。

## 6. 安全约束

发版凭据（`.apphub-release.json`）**绝不能打进安装包**。项目通过两层防护：

1. [electron-builder.yml](../electron-builder.yml) 的 `files` 排除：

   ```yaml
   - '!.apphub-release*.json'
   - '!scripts'
   - '!scripts/**'
   - '!docs'
   - '!docs/**'
   - '!rules'
   - '!rules/**'
   - '!CLAUDE.md'
   ```

2. workflow 在每个平台构建后检查 `app.asar`，发现 `apphub-release` 或 `signSecret` 立即失败，阻断上传。扫描按 `find -print0` 逐条处理并引用路径，避免 macOS 产物路径中的空格（`Mark It.app`）导致漏检。

本地新增其他含密钥的文件时，务必同步加入 `files` 排除，或放进已被排除的目录。

## 7. 日常操作

### 查看运行

```bash
gh run list --workflow=release.yml
gh run watch
gh run view <run-id> --log
```

### 查看双通道发版节点

```bash
node scripts/release/channel-state.mjs status
```

输出两个通道各自的最后节点、自那以后的提交数与建议的下一个版本。发版前先跑一次，确认没有漏收录的提交：

```bash
# 校验版本是否满足严格单序列
node scripts/release/channel-state.mjs validate --version 1.6.0-beta.2

# 查看某个通道的上一个节点（更新说明收集起点）
node scripts/release/channel-state.mjs previous-tag --channel beta --version 1.6.0-beta.2
```

如果某个 tag 已创建但发布被放弃，必须先删除该 tag，再发下一个版本；否则下一个版本会从失败的 tag 开始收集，漏掉这段提交：

```bash
git tag -d v1.6.0-beta.3
git push origin :refs/tags/v1.6.0-beta.3
```

### GitHub Release 产物同步

`github-release` 任务在 apphub 发布并验证通过后执行，行为如下：

- 标签触发：Release 使用已推送的 `vX.Y.Z` tag
- 手动触发且尚无 tag：自动在当次运行的提交上补建 `vX.Y.Z` tag 后再建 Release
- Release 已存在（重跑）：刷新标题与更新说明，并用 `--clobber` 覆盖同名附件
- 附件为当次三平台全部产物（exe / dmg / zip / AppImage / deb 及 blockmap）

该任务只使用 workflow 内置的 `GITHUB_TOKEN`（job 级 `permissions: contents: write`），不需要额外 Secrets。

### 重跑同一版本

同一版本已有草稿时会自动复用；如果平台包槽位已存在，会报 `300400002`。重新触发时勾选 `replace`：

```bash
gh workflow run release.yml --ref master \
  -f version=1.4.0 \
  -f replace=true
```

**注意**：替换已发布版本的包只影响新下载 / 新安装；已安装客户端按版本号判断，不会重新下载。

### 修改已发布版本的说明或强制标记

```bash
# 读取本地 .apphub-release.json（含凭据）
node scripts/release/apphub.mjs update-version \
  --version 1.4.0 \
  --notes "- 新的更新说明" \
  --force true
```

若使用 `.apphub-release.ci.json`，需同时用环境变量 `APPHUB_USERNAME` / `APPHUB_PASSWORD` / `APPHUB_SIGN_SECRET` 提供凭据。

### 下线版本

```bash
node scripts/release/apphub.mjs offline --version 1.4.0
```

下线是终态操作：客户端会回退看到次新的已发布版本，执行前请确认。

### 撤回已发布平台包

```bash
node scripts/release/apphub.mjs remove-package --version 1.4.0 --platform windows --arch x64
```

该平台会回退到更早的有包版本；执行前请确认。

## 8. 本地发版（备用）

CI 不可用时仍可在本机发版。本地使用仓库根目录下被 gitignore 的 `.apphub-release.json`（含凭据），不要提交。

本地发 beta 需要把配置里的 `channel` 改为 `beta`（另存为 `.apphub-release.beta.json` 并通过 `--config` 指定，或临时修改后改回）。`upload` 子命令只读配置里的 channel，不支持 `--channel`，只改命令行参数会导致安装包被上传到 stable。

```bash
# 连通性自检
node scripts/release/apphub.mjs status

# 构建
npm run build:win

# 建草稿
node scripts/release/apphub.mjs create-version \
  --version 1.4.0 --title "v1.4.0" --notes="- 更新说明"

# 上传
node scripts/release/apphub.mjs upload \
  --version 1.4.0 --platform windows --arch x64 \
  --file dist/mark-it-1.4.0-setup.exe \
  --blockmap dist/mark-it-1.4.0-setup.exe.blockmap

# 发布
node scripts/release/apphub.mjs publish --version 1.4.0

# 验证
node scripts/release/apphub.mjs verify \
  --expect 1.4.0 --platform windows --arch x64
```

macOS / Linux 本地构建分别使用 `npm run build:mac`、`npm run build:linux`，上传参数按第 5 节产物约定替换。

## 9. Secrets 配置与轮换

网页：仓库 Settings → Secrets and variables → Actions → New repository secret。

命令行：

```bash
gh secret set APPHUB_USERNAME --repo Harley-xk/mark-it
gh secret set APPHUB_PASSWORD --repo Harley-xk/mark-it
gh secret set APPHUB_SIGN_SECRET --repo Harley-xk/mark-it
```

命令会提示输入值（不会回显）。轮换 apphub 账号密码后，重新执行以上命令覆盖即可，无需改代码。

## 10. 平台限制

- **macOS 签名**：当前未配置 Apple Developer 证书与公证。未签名应用会被 Gatekeeper 拦截，Squirrel.Mac 也不会执行自动更新；启用签名前 macOS 只能手动安装。
- **Linux 自动更新**：仅 AppImage 支持；deb 供手动安装。
- **Windows**：未配置代码签名证书，安装时可能出现 SmartScreen 提示；自动更新与 blockmap 差分正常。
- **首次多平台发布**：需确认 `verify` 对 `macos` / `linux` 均返回通过，以验证 apphub 更新端点的平台支持。

## 11. 故障排查

| 现象 / 错误码                              | 含义                                 | 处理                                                                            |
| ------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------- |
| `401 签名校验失败`                         | 签名密钥缺失或错误                   | 检查 `APPHUB_SIGN_SECRET`                                                       |
| `401` 且重登仍失败                         | 账号或权限问题                       | 核对 `APPHUB_USERNAME` / `APPHUB_PASSWORD`                                      |
| `300300002`                                | 版本号非 semver                      | 修正版本号后重跑                                                                |
| `300300003`                                | 通道内版本号重复                     | 草稿会自动复用；已发布则递增版本号                                              |
| `validate` 提示版本不大于已发布版本        | 违反严格单序列，或想复用已存在版本号 | 按 [发版通道](./发版通道.md) 递增版本；同版本重跑用 `replace`，不要改版本号绕过 |
| `validate` 提示 beta base 不大于最后正式版 | beta 版本号选错了 base               | 改用大于最后一个正式版的 base，例如 `1.5.1-beta.1`                              |
| `300300005`                                | 发布校验失败（无可用包）             | 至少一个非 web 平台 upload 成功后再发布                                         |
| `300400002`                                | 平台 / 架构槽位重复                  | 重跑时勾选 `replace`                                                            |
| `300400003`                                | 框架产物缺失                         | 检查 electron sha512 与 `latest.yml` 是否一致                                   |
| `300400007`                                | `--replace` 指向的槽位不存在         | 去掉 `replace`，按新增包重传                                                    |
| `verify` 返回无更新                        | 发布未生效 / 通道停用                | 核对版本状态与通道状态后重验                                                    |
| 构建失败                                   | 依赖、签名或平台工具问题             | 查看对应 matrix job 日志；mac/linux 首次运行重点关注                            |

## 12. 相关文件

| 文件                                                                      | 作用                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [.github/workflows/release.yml](../.github/workflows/release.yml)         | 三平台构建、上传 apphub、发布验证、同步 GitHub Release 的 workflow |
| [scripts/release/apphub.mjs](../scripts/release/apphub.mjs)               | apphub 发版 CLI（零依赖）                                          |
| [scripts/release/channel-state.mjs](../scripts/release/channel-state.mjs) | 双通道发版节点查询、版本校验与建议                                 |
| [.apphub-release.ci.json](../.apphub-release.ci.json)                     | CI 使用的 stable 无凭据配置（baseUrl / appKey / channel）          |
| [.apphub-release.beta.ci.json](../.apphub-release.beta.ci.json)           | CI 使用的 beta 无凭据配置                                          |
| [docs/发版通道.md](./发版通道.md)                                         | 双通道模型、版本号规则、发版节点与 Beta 开关语义                   |
| [electron-builder.yml](../electron-builder.yml)                           | 三平台打包配置与凭据文件排除                                       |
| `.apphub-release.json`                                                    | 本地发版凭据（gitignore，不提交）                                  |
