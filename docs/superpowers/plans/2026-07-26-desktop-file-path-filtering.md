# Desktop File Path Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent URLs and decimal fragments from appearing as files in the Desktop workspace panel without breaking valid local-path extraction.

**Architecture:** Keep all filtering in `packages/desktop/shared/file-paths.ts`, which is already shared by Renderer and Core. Add focused integration coverage through `filesFromTools` so the test exercises the same tool-output data flow that produced the bug.

**Tech Stack:** TypeScript, React renderer helpers, Bun test.

---

### Task 1: Add regression coverage

**Files:**
- Modify: `packages/desktop/tests/chat-ui.test.tsx`
- Test: `packages/desktop/tests/chat-ui.test.tsx`

- [ ] **Step 1: Write the failing URL regression test**

Add a `filesFromTools` test whose WebFetch output contains HTTP and HTTPS URLs plus `report.html`, and assert that only `report.html` is returned.

- [ ] **Step 2: Write the failing decimal regression test**

Add a `filesFromTools` test whose output contains `.9`, `.07`, `.3`, `.env`, and `result.json`, and assert that only `.env` and `result.json` are returned.

- [ ] **Step 3: Run the focused tests to verify RED**

Run:

```bash
bun test packages/desktop/tests/chat-ui.test.tsx
```

Expected: the new tests fail because URL suffixes and numeric dot fragments are still extracted.

### Task 2: Fix shared path extraction

**Files:**
- Modify: `packages/desktop/shared/file-paths.ts`
- Test: `packages/desktop/tests/chat-ui.test.tsx`

- [ ] **Step 1: Reject matches originating inside URI tokens**

When processing regex matches, inspect the surrounding token and skip candidates that belong to a `scheme://...` URI. Apply this before candidates enter the result set so `https://` cannot become a fake `s:/` drive path.

- [ ] **Step 2: Reject numeric dot fragments**

Update filename-shape validation so names matching `/^\.\d+(?:\.\d+)*$/` are not treated as hidden files, while named dotfiles such as `.env` remain valid.

- [ ] **Step 3: Run the focused test to verify GREEN**

Run:

```bash
bun test packages/desktop/tests/chat-ui.test.tsx
```

Expected: all tests pass.

### Task 3: Verify the Desktop package

**Files:**
- Verify: `packages/desktop/shared/file-paths.ts`
- Verify: `packages/desktop/tests/chat-ui.test.tsx`

- [ ] **Step 1: Run related Desktop tests**

Run:

```bash
bun test packages/desktop/tests/chat-ui.test.tsx packages/desktop/tests/desktop-config-service.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run strict type checking**

Run:

```bash
bun run typecheck
```

Expected: zero TypeScript errors.
