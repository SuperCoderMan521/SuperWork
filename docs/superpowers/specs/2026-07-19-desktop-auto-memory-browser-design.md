# Desktop Auto Memory Browser Design

## Goal

Make the desktop Memory page show every Markdown file used by Claude Code's
project-scoped auto-memory system, including nested team memory, and explain
each entry in Chinese. This change is limited to `packages/desktop`; Claude
Code core memory behavior remains unchanged.

## Current Problem

The desktop service exposes one synthetic Auto Memory entry at
`~/.claude/memory/MEMORY.md`. Claude Code actually resolves auto-memory per
project, normally under
`~/.claude/projects/<sanitized-project-root>/memory/`. Topic files and nested
directories are therefore invisible, and the displayed entry may point to a
file Claude Code never reads.

## Design

### Path resolution

Desktop core will use Claude Code's existing `getAutoMemPath()` resolution
instead of duplicating its path rules. This preserves environment overrides,
trusted `autoMemoryDirectory` settings, canonical Git-root scoping, and future
path changes.

### Discovery

The config service will recursively scan the resolved auto-memory directory.
It will include every `.md` file at every depth, including private topic files,
the root `MEMORY.md`, and files below `team/`. Directories and non-Markdown
files will not become editable memory entries.

The existing three instruction entries remain available:

- project-root `CLAUDE.md`
- project `.claude/CLAUDE.md`
- user `CLAUDE.md`

If the auto-memory directory does not exist or contains no Markdown files, the
UI will show its resolved path and an explicit Chinese empty-state message. It
will not offer to create a synthetic file at the old incorrect path.

### Data model

`DesktopMemoryFile` will carry enough presentation metadata for the renderer:

- stable absolute-path identity
- display label and relative path
- scope (`project`, `user`, `auto`, or `team` as supported by the shared type)
- existence state
- optional Chinese description
- optional nesting depth or parent-relative path for hierarchical rendering

The service will derive descriptions from filename, directory, and parsed
frontmatter when available:

- root `MEMORY.md`: 自动记忆索引
- `type: user`: 用户信息、目标与偏好
- `type: feedback`: 用户对工作方式的反馈与约束
- `type: project`: 无法直接从代码推导的项目背景和长期事项
- `type: reference`: 外部系统与资料入口
- files under `team/`: 团队共享记忆, combined with the type description
- missing or unknown type: 未分类记忆文件

Malformed frontmatter must not prevent the file from appearing.

### Renderer

The Memory tab will render auto-memory entries as a hierarchical list using
their relative path and depth. Each row shows the filename, Chinese
description, and scope. Existing read, edit, save, compact, and collapse
actions continue to operate on the selected absolute path.

Instruction files remain visually separate from the Auto Memory tree so users
can distinguish authored instructions from extracted memories.

### Error handling and safety

Missing or unreadable directories produce an empty list rather than failing
the entire configuration snapshot. Individual unreadable files remain listed
with a generic description when metadata parsing fails. Existing backup-on-save
behavior is preserved.

## Testing

Tests will be written before implementation and will cover:

1. Recursive discovery of root and nested Markdown files.
2. Exclusion of non-Markdown files.
3. Chinese descriptions for all four supported memory types.
4. Graceful handling of malformed frontmatter and missing directories.
5. Use of the real project-scoped auto-memory path.
6. Hierarchical UI rendering and the Chinese empty state.
7. Existing memory read, edit, save, compact, and collapse behavior.

After targeted tests, run desktop tests and repository TypeScript typecheck.

## Out of Scope

- Changing Claude Code extraction triggers or prompts.
- Adding or changing memory types.
- Editing Claude Code core memory files or path resolution.
- Creating new memories automatically from the desktop renderer.
