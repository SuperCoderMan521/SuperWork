# Desktop Window I18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent Chinese/English switch at the bottom of the Desktop sidebar and translate fixed Renderer UI text immediately.

**Architecture:** A dependency-free React provider owns locale detection, persistence, dictionaries, interpolation, and fallback. Renderer components consume the provider; external/model/file content remains untouched.

**Tech Stack:** React 19, TypeScript, localStorage, Bun tests.

---

### Task 1: Build and test the locale runtime

**Files:** Create `packages/desktop/renderer/src/i18n/I18nProvider.tsx`, `packages/desktop/renderer/src/i18n/locales.ts`; test `packages/desktop/tests/i18n.test.tsx`.

- [ ] Add failing tests for locale detection, persistence, lookup, interpolation, and fallback.
- [ ] Implement `Locale`, `useI18n`, provider state, safe storage, and Chinese/English dictionaries.
- [ ] Run `bun test tests/i18n.test.tsx`; expect all tests to pass.

### Task 2: Add the sidebar switch and root provider

**Files:** Modify `packages/desktop/renderer/src/main.tsx`, `features/history/SessionSidebar.tsx`, `styles.css`; test `app.test.tsx`.

- [ ] Wrap the Renderer root in `I18nProvider`.
- [ ] Add the compact language button after Core status at the bottom of the sidebar.
- [ ] Verify the button switches locale without recreating the session state and remains visually compact.

### Task 3: Translate the window UI

**Files:** Modify Renderer components under `features/chat`, `features/settings`, `features/files`, `features/permissions`, `features/diagnostics`, `features/history`, `features/buddy`, and `app/App.tsx`.

- [ ] Replace fixed user-facing strings with typed `t()` lookups.
- [ ] Translate dynamic status strings with interpolation parameters.
- [ ] Leave user/model/tool/file payloads unchanged.
- [ ] Add representative Chinese/English rendering assertions for sidebar, Composer, settings, files, permissions, usage, and Buddy.

### Task 4: Verify

**Files:** Desktop Renderer and tests only.

- [ ] Run `bun test tests` from `packages/desktop`.
- [ ] Run `bun run typecheck` from `packages/desktop`.
- [ ] Run `bun run build` from `packages/desktop`.
- [ ] Confirm no `src/` Claude Code files changed.
