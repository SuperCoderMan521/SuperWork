# Desktop 窗口中英文切换设计

## 目标

在 SuperWork 左侧菜单底部增加紧凑的中英文切换按钮。切换后，Electron Renderer 窗口内的导航、设置、状态、权限、文件、Buddy 和辅助提示立即更新，并在应用重启后保持用户选择。

## 范围

包含 `packages/desktop/renderer` 内用户可见的固定界面文案：会话侧栏、欢迎页、聊天输入、设置中心、文件面板、权限面板、诊断抽屉、工具状态、Slash Command 目录、Token 使用报告和 Buddy。

不包含 Electron 原生菜单、系统文件夹选择器、启动错误弹窗、用户输入、模型回答、文件内容、工具原始输出和 Desktop Core 生成的文本。

## 架构

新增无第三方依赖的轻量 i18n 层：

- `i18n/types.ts` 定义 `Locale` 和翻译键类型。
- `i18n/locales/zh-CN.ts` 是完整的基准词典。
- `i18n/locales/en-US.ts` 提供对应英文翻译。
- `i18n/I18nProvider.tsx` 管理当前语言、翻译函数和持久化。
- Renderer 根节点包裹 Provider；子组件通过 `useI18n()` 获取 `locale`、`setLocale` 和 `t()`。

不在组件中散布 `locale === ...` 三元表达式，带动态值的文案由 `t(key, params)` 插值生成。

## 状态与持久化

- 支持语言：`zh-CN`、`en-US`。
- 默认语言：首次运行使用浏览器语言；以 `zh` 开头时选中文，否则选英文。
- 用户选择保存为 `localStorage['superwork.locale']`。
- 无效或损坏的存储值回退到自动检测结果。
- 切换语言仅更新 Renderer 状态，不重启 Core，不中断当前对话。

## 交互

语言按钮位于左侧栏最底部、Core 状态按钮下方，采用紧凑图标和短标签：中文状态显示 `文 EN`，英文状态显示 `文 中`。按钮提供本地化的 `title` 与 `aria-label`。

## 回退与错误处理

- 英文词典缺少键时回退到中文词典。
- 两套词典都缺少键时显示键名，避免渲染空白。
- `localStorage` 读写异常静默处理，不影响应用启动。
- 不翻译外部数据和模型生成内容。

## 测试

- Provider 默认语言检测和持久化。
- `t()` 参数插值及缺失键回退。
- 左侧语言按钮存在且位于菜单底部。
- 切换后侧栏、Composer、设置或 Buddy 的代表性文案同步变化。
- 现有 Desktop 类型检查、测试和 Renderer 构建保持通过。

## 修改边界

只修改 `packages/desktop/renderer`、相关 Desktop 测试和本设计/计划文档，不修改 `src/` 下 Claude Code 原始代码。
