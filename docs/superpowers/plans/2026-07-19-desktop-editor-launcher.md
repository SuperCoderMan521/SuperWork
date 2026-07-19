# Desktop Workspace Editor Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Desktop 文件区域动态列出本机可用代码编辑器，并用用户选择的编辑器打开当前工作区目录。

**Architecture:** 新增一个只运行在 Electron 主进程中的 Windows 编辑器发现服务，通过注册表、常见路径、PATH 和 JetBrains Toolbox 合并结果。预加载层只暴露两个具名 IPC 方法；渲染层只传编辑器 ID 与当前工作区，并在文件面板中管理下拉菜单状态。

**Tech Stack:** Electron 40、React 19、TypeScript strict、Bun test、Node `child_process`/`fs`/`path`

---

### Task 1: 编辑器发现与安全启动服务

**Files:**
- Create: `packages/desktop/electron/workspace-editor-service.ts`
- Create: `packages/desktop/tests/workspace-editor-service.test.ts`

- [ ] **Step 1: 写失败测试**

测试注入的注册表、常见路径、PATH 与 JetBrains 候选能被验证、去重并按产品顺序返回；不存在的文件被过滤；未知编辑器 ID 和非目录工作区被拒绝。

```ts
test('merges valid editor candidates in stable product order', async () => {
  const service = new WorkspaceEditorService({
    platform: 'win32',
    fileExists: path => validPaths.has(path),
    isDirectory: path => path === 'G:\\repo',
    queryRegistry: async () => registryCandidates,
    queryPath: async () => pathCandidates,
    knownPathCandidates: () => knownCandidates,
    spawn: (command, args) => launches.push({ command, args }),
  })

  expect((await service.list()).map(item => item.id)).toEqual([
    'vscode',
    'cursor',
    'webstorm',
  ])
  await service.open('cursor', 'G:\\repo')
  expect(launches).toEqual([{ command: cursorExe, args: ['G:\\repo'] }])
})
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd packages/desktop && bun test tests/workspace-editor-service.test.ts`

Expected: FAIL，因为 `WorkspaceEditorService` 尚不存在。

- [ ] **Step 3: 实现最小服务**

定义稳定 ID：`vscode | cursor | windsurf | trae | zed | sublime | notepad-plus-plus | idea | webstorm | pycharm | goland | rider | clion | phpstorm | rubymine | datagrip | android-studio`。候选路径必须通过 `stat`/`access` 验证，启动使用 `spawn(executable, [workspace], { detached: true, stdio: 'ignore', shell: false })`，随后 `unref()`。

```ts
export type WorkspaceEditor = {
  id: WorkspaceEditorId
  name: string
  icon: string
}

export interface WorkspaceEditorServiceContract {
  list(options?: { refresh?: boolean }): Promise<WorkspaceEditor[]>
  open(editorId: WorkspaceEditorId, workspace: string): Promise<void>
}
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `cd packages/desktop && bun test tests/workspace-editor-service.test.ts`

Expected: PASS。

### Task 2: 受限 Electron IPC 与预加载 API

**Files:**
- Modify: `packages/desktop/electron/channels.ts`
- Modify: `packages/desktop/electron/desktop-api.ts`
- Modify: `packages/desktop/electron/preload.ts`
- Modify: `packages/desktop/electron/main.ts`
- Modify: `packages/desktop/tests/preload-api.test.ts`
- Modify: `packages/desktop/tests/protocol.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
expect(Object.keys(api)).toContain('listWorkspaceEditors')
expect(Object.keys(api)).toContain('openWorkspaceInEditor')
await api.listWorkspaceEditors(true)
await api.openWorkspaceInEditor('vscode', 'G:\\repo')
expect(invokeCalls).toEqual([
  ['desktop:workspace-editors:list', { refresh: true }],
  ['desktop:workspace-editors:open', { editorId: 'vscode', workspace: 'G:\\repo' }],
])
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd packages/desktop && bun test tests/preload-api.test.ts tests/protocol.test.ts`

Expected: FAIL，因为 API 与通道尚不存在。

- [ ] **Step 3: 实现具名 IPC**

新增：

```ts
export const DESKTOP_WORKSPACE_EDITORS_LIST_CHANNEL = 'desktop:workspace-editors:list'
export const DESKTOP_WORKSPACE_EDITOR_OPEN_CHANNEL = 'desktop:workspace-editors:open'
```

`DesktopApi` 返回 Promise，主进程通过 `ipcMain.handle` 调用 `WorkspaceEditorService`。主进程在收到 `session.listed` 和 `session.snapshot` 时维护规范化工作区集合；启动前要求传入路径存在于该集合中。API 不暴露可执行文件路径、参数数组或通用 spawn。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `cd packages/desktop && bun test tests/preload-api.test.ts tests/protocol.test.ts`

Expected: PASS。

### Task 3: 文件区域下拉菜单

**Files:**
- Modify: `packages/desktop/renderer/src/features/files/ConversationFilesPanel.tsx`
- Modify: `packages/desktop/renderer/src/app/App.tsx`
- Modify: `packages/desktop/renderer/src/styles.css`
- Modify: `packages/desktop/tests/chat-ui.test.tsx`
- Modify: `packages/desktop/tests/styles.test.ts`

- [ ] **Step 1: 写失败测试**

测试文件面板标题栏包含“在编辑器中打开”按钮；打开状态分别渲染检测中、已安装列表、空状态、启动失败与重新检测按钮；菜单项传递当前会话 `cwd` 而非单个文件路径。

```tsx
expect(html).toContain('在编辑器中打开')
expect(html).toContain('正在检测编辑器')
expect(html).toContain('workspace-editor-menu')
```

样式测试断言菜单锚定在按钮右下方，并使用 `position: absolute`、稳定层级和暖色深色表面。

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd packages/desktop && bun test tests/chat-ui.test.tsx tests/styles.test.ts`

Expected: FAIL，因为菜单尚未渲染。

- [ ] **Step 3: 实现菜单状态机**

`ConversationFilesPanel` 接收 `workspace`、`listWorkspaceEditors`、`openWorkspaceInEditor`。首次展开立即显示 loading；若已有缓存则先显示缓存并后台刷新。点击外部或 Escape 关闭。启动中禁用所选项；成功关闭；失败保留菜单并显示错误。

```ts
type EditorMenuState =
  | { status: 'closed'; editors: WorkspaceEditor[] }
  | { status: 'loading'; editors: WorkspaceEditor[] }
  | { status: 'ready'; editors: WorkspaceEditor[] }
  | { status: 'opening'; editors: WorkspaceEditor[]; editorId: string }
  | { status: 'error'; editors: WorkspaceEditor[]; message: string }
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `cd packages/desktop && bun test tests/chat-ui.test.tsx tests/styles.test.ts`

Expected: PASS。

### Task 4: 完整验证与 Windows 打包

**Files:**
- Verify only

- [ ] **Step 1: 运行完整 Desktop 测试**

Run: `cd packages/desktop && bun test tests`

Expected: 0 fail。

- [ ] **Step 2: 运行严格类型检查**

Run: `cd packages/desktop && bun run typecheck`

Expected: exit 0。

- [ ] **Step 3: 构建并打包 G 盘版本**

Run: `cd packages/desktop && bun run build && bunx electron-builder --win --dir --config electron-builder.yml`

Expected: `packages/desktop/release/win-unpacked/SuperWork.exe` 更新，且 `resources/runtime/bun.exe` 与 `resources/core/main.js` 存在。

- [ ] **Step 4: 手工验收**

启动 G 盘 `SuperWork.exe`，选择已有会话，展开文件区域菜单。确认本机已安装编辑器出现，选择后打开整个工作区；未安装项不出现；关闭编辑器后再次选择仍可正常启动。
