# AGENTS.md

This file is the Codex entry point for this repository. Claude Code uses `CLAUDE.md`.
Both tools share the same engineering rules; do not maintain model-specific copies of the rule text.

## Mandatory rule loading

Before planning, inspecting, editing, or running project commands, read all of the following files in full:

1. `rules/base.md` (highest priority among repository AI rules)
2. `rules/code-style.md`
3. `rules/testing.md`
4. `rules/branding.md`
5. `rules/release.md`
6. `CLAUDE.md` (architecture, commands, and repository invariants)

Read the files directly. Codex does not expand the `@rules/*.md` imports used by Claude Code.
Do not infer their contents from filenames or this summary. If a listed file is missing, stop and ask before continuing.

## Rule precedence

Within repository guidance, `rules/base.md` wins over every other rule and `CLAUDE.md`.
Direct user instructions and higher-level system/developer instructions retain their normal precedence.

## Maintaining the shared rules

- `rules/` is the single source of truth for engineering rules.
- `CLAUDE.md` is the Claude Code adapter and project overview.
- `AGENTS.md` is the Codex adapter; keep it lightweight and do not copy rule bodies here.
- When adding, removing, or renaming a file under `rules/`, update both the `CLAUDE.md` import list and the mandatory loading list above.
- Keep both AI entry files and `rules/` out of packaged application artifacts.
