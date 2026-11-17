# AGENTS.md

本文件是本仓库的 Codex 入口。Claude Code 使用 `CLAUDE.md`。
两个工具共享同一套工程规则，不要维护按模型分离的规则正文副本。

## 强制规则加载

在制定计划、查看代码、编辑或运行项目命令之前，必须完整阅读以下文件：

1. `rules/base.md`（仓库 AI 规则中优先级最高）
2. `rules/code-style.md`
3. `rules/testing.md`
4. `rules/branding.md`
5. `rules/release.md`
6. `CLAUDE.md`（架构、命令与仓库不变量）

请直接读取这些文件。Codex 不会展开 Claude Code 使用的 `@rules/*.md` 导入语法。
不要根据文件名或本摘要推断其内容。若上述文件缺失，应停止操作并先行询问。

## 规则优先级

在本仓库的指导文件之间，`rules/base.md` 的优先级高于其他所有规则以及 `CLAUDE.md`。
用户的直接指令与更高层的系统 / 开发者指令保持其常规优先级。

## 维护共享规则

- `rules/` 是工程规则的唯一事实来源。
- `CLAUDE.md` 是 Claude Code 的适配层与项目概览。
- `AGENTS.md` 是 Codex 的适配层；保持其轻量，不要在此复制规则正文。
- 新增、删除或重命名 `rules/` 下的文件时，必须同步更新 `CLAUDE.md` 的导入列表与上文的强制加载列表。
- 两个 AI 入口文件与 `rules/` 均不得进入打包产物。
