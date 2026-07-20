# Desktop Performance Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local workspace-history performance center in SuperWork Desktop without changing QueryEngine or LoopQuery.

**Architecture:** A new Bun Core `DesktopPerformanceService` performs bounded, cached aggregation of existing workspace transcript JSONL files and diagnostic metadata. Typed Desktop protocol events carry numeric snapshots to an independent Renderer page reachable from the existing sidebar.

**Tech Stack:** Bun, TypeScript strict mode, Zod protocol schemas, Electron preload IPC, React 19, bun:test, CSS/SVG.

---

## File Map

- Create `packages/desktop/core/performance-service.ts`: transcript parsing, aggregation, bounds, cache, diagnostics.
- Create `packages/desktop/renderer/src/features/performance/PerformanceCenter.tsx`: performance page presentation and states.
- Create `packages/desktop/tests/performance-service.test.ts`: aggregation and boundary tests.
- Create `packages/desktop/tests/performance-ui.test.tsx`: page rendering and interactions.
- Modify `packages/desktop/shared/schemas.ts`: performance request, response, and snapshot schemas.
- Modify `packages/desktop/shared/types.ts` and `shared/protocol.ts`: export inferred performance types.
- Modify `packages/desktop/core/command-dispatcher.ts`: route `performance.get`.
- Modify `packages/desktop/core/main.ts`: construct and inject the performance service.
- Modify `packages/desktop/electron/desktop-api.ts` and `preload.ts`: expose `getPerformance`.
- Modify `packages/desktop/renderer/src/app/App.tsx`: add performance view, event state, refresh and range behavior.
- Modify `packages/desktop/renderer/src/features/history/SessionSidebar.tsx`: add performance navigation action.
- Modify `packages/desktop/renderer/src/styles.css`: approved dark responsive layout.
- Modify existing protocol, dispatcher, preload, app, and style tests for integration coverage.

### Task 1: Typed performance protocol

**Files:**
- Modify: `packages/desktop/shared/schemas.ts`
- Modify: `packages/desktop/shared/types.ts`
- Modify: `packages/desktop/shared/protocol.ts`
- Test: `packages/desktop/tests/protocol.test.ts`

- [ ] **Step 1: Write failing protocol tests**

Add tests that parse `performance.get` with `cwd`, `range`, and `force`, parse a complete `performance.snapshot`, and reject an invalid range or negative counter.

- [ ] **Step 2: Run RED test**

Run: `bun test packages/desktop/tests/protocol.test.ts`

Expected: FAIL because `performance.get` and `performance.snapshot` are not union members.

- [ ] **Step 3: Add minimal schemas and exports**

Define `DesktopPerformanceRangeSchema`, summary/trend/model/tool/diagnostics schemas, `DesktopPerformanceSnapshotSchema`, then extend command/event unions and export inferred types.

- [ ] **Step 4: Run GREEN test**

Run: `bun test packages/desktop/tests/protocol.test.ts`

Expected: PASS.

### Task 2: Local transcript aggregation service

**Files:**
- Create: `packages/desktop/core/performance-service.ts`
- Create: `packages/desktop/tests/performance-service.test.ts`

- [ ] **Step 1: Write failing aggregation test**

Create temporary workspace transcripts containing user prompts, assistant usage, models, tool-use/result timestamp pairs, interruption/error records, and one malformed line. Assert token categories, cache rate, session/turn/message counts, model grouping, tool call duration, failures, warnings, and absence of content fields.

- [ ] **Step 2: Run RED aggregation test**

Run: `bun test packages/desktop/tests/performance-service.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure record aggregation and snapshot service**

Implement record guards, timestamp parsing, real-user-turn classification, usage normalization, per-model aggregation, matching tool timestamps, daily/monthly buckets, price lookup, debug metadata, and Langfuse boolean status. Inject transcript listing/loading and config lookup dependencies.

- [ ] **Step 4: Run GREEN aggregation test**

Run: `bun test packages/desktop/tests/performance-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Add failing boundary/cache tests**

Test date filtering, newest-file/line bounds, `truncated` warnings, 30-second cache reuse, `force` bypass, and concurrent request promise reuse.

- [ ] **Step 6: Implement bounds and cache, then rerun**

Run: `bun test packages/desktop/tests/performance-service.test.ts`

Expected: all service tests PASS.

### Task 3: Core command routing

**Files:**
- Modify: `packages/desktop/core/command-dispatcher.ts`
- Modify: `packages/desktop/core/main.ts`
- Test: `packages/desktop/tests/command-dispatcher.test.ts`

- [ ] **Step 1: Write failing dispatcher test**

Dispatch `performance.get` and assert the injected service receives `cwd`, `range`, `force`, then emits the matching `performance.snapshot` with the same request id.

- [ ] **Step 2: Run RED dispatcher test**

Run: `bun test packages/desktop/tests/command-dispatcher.test.ts`

Expected: FAIL because no routing option exists.

- [ ] **Step 3: Add dispatcher option and route**

Add `getPerformance` to dispatcher options, a `performance.get` switch case, and construct the service in `core/main.ts` using the existing session project-directory and model-config boundaries.

- [ ] **Step 4: Run GREEN dispatcher test**

Run: `bun test packages/desktop/tests/command-dispatcher.test.ts`

Expected: PASS.

### Task 4: Electron preload API

**Files:**
- Modify: `packages/desktop/electron/desktop-api.ts`
- Modify: `packages/desktop/electron/preload.ts`
- Test: `packages/desktop/tests/preload-api.test.ts`

- [ ] **Step 1: Write failing preload test**

Assert `getPerformance(cwd, range, force)` sends a typed `performance.get` command and remains the only new renderer capability.

- [ ] **Step 2: Run RED preload test**

Run: `bun test packages/desktop/tests/preload-api.test.ts`

Expected: FAIL because the method is missing.

- [ ] **Step 3: Implement typed API method and expose it**

Use the existing request-id generator and command sender; do not add filesystem IPC.

- [ ] **Step 4: Run GREEN preload test**

Run: `bun test packages/desktop/tests/preload-api.test.ts`

Expected: PASS.

### Task 5: Performance page component

**Files:**
- Create: `packages/desktop/renderer/src/features/performance/PerformanceCenter.tsx`
- Create: `packages/desktop/tests/performance-ui.test.tsx`
- Modify: `packages/desktop/renderer/src/styles.css`

- [ ] **Step 1: Write failing UI snapshot tests**

Test loading, empty, populated, partial warning, and failure states. In the populated state assert approved summary cards, token composition, trend labels, tool/model tables, diagnostics, and formatted values.

- [ ] **Step 2: Run RED UI test**

Run: `bun test packages/desktop/tests/performance-ui.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement minimal semantic page**

Build accessible buttons/select controls, cards, SVG/CSS trend, composition bar, tables, diagnostic status, and warnings. Keep chart calculations in exported pure helpers for focused tests.

- [ ] **Step 4: Run GREEN UI test**

Run: `bun test packages/desktop/tests/performance-ui.test.tsx`

Expected: PASS.

- [ ] **Step 5: Add responsive and approved-style assertions**

Extend `styles.test.ts` to assert the performance grid, warm dark surfaces, responsive wrap, and no gradient text.

- [ ] **Step 6: Implement styles and rerun tests**

Run: `bun test packages/desktop/tests/performance-ui.test.tsx packages/desktop/tests/styles.test.ts`

Expected: PASS.

### Task 6: App and sidebar integration

**Files:**
- Modify: `packages/desktop/renderer/src/app/App.tsx`
- Modify: `packages/desktop/renderer/src/features/history/SessionSidebar.tsx`
- Modify: `packages/desktop/tests/app.test.tsx`
- Modify: `packages/desktop/tests/chat-ui.test.tsx`

- [ ] **Step 1: Write failing navigation test**

Assert the sidebar exposes `性能中心`, clicking it keeps the sidebar visible, selects current workspace, sends the default `30d` request, and renders the page when the snapshot event arrives.

- [ ] **Step 2: Run RED navigation test**

Run: `bun test packages/desktop/tests/app.test.tsx packages/desktop/tests/chat-ui.test.tsx`

Expected: FAIL because the view and sidebar action are missing.

- [ ] **Step 3: Implement view state and navigation**

Extend `View` with `performance`, store snapshot/loading/error/range, request on entry and workspace/range changes, preserve old snapshot during force refresh, and return to chat without recreating sessions.

- [ ] **Step 4: Run GREEN navigation tests**

Run: `bun test packages/desktop/tests/app.test.tsx packages/desktop/tests/chat-ui.test.tsx packages/desktop/tests/performance-ui.test.tsx`

Expected: PASS.

### Task 7: Verification and documentation alignment

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run all Desktop tests**

Run: `bun test packages/desktop/tests`

Expected: all tests PASS with no warnings attributable to the feature.

- [ ] **Step 2: Run strict typecheck**

Run: `bun run --cwd packages/desktop typecheck`

Expected: zero TypeScript errors.

- [ ] **Step 3: Run production build**

Run: `bun run --cwd packages/desktop build`

Expected: Renderer and Electron/Bun Core processes build successfully.

- [ ] **Step 4: Review privacy and LoopQuery isolation**

Run:

```powershell
git diff -- src/query.ts src/QueryEngine.ts
rg -n "token|secret|content|input|output" packages/desktop/core/performance-service.ts
```

Expected: no LoopQuery changes; snapshot construction includes numeric aggregates and diagnostic metadata only.
