# Desktop 文件路径误识别修复设计

## 问题

Desktop 文件区会从所有工具的摘要和输出中提取疑似文件路径。当前正则会把
`https://example.com/page.html` 的 `s://example.com/page.html` 识别为 Windows
盘符路径，也会把正文中的 `.9`、`.07` 等小数识别为隐藏文件，导致 WebSearch
和 WebFetch 输出污染文件列表。

## 设计

在共享路径解析器 `packages/desktop/shared/file-paths.ts` 中修复源头：

1. 提取前先跳过 URL 内部产生的匹配，覆盖常见 URI scheme。
2. 拒绝纯数字点号项，例如 `.9`、`.07`，但继续允许 `.env`、`.gitignore`。
3. 保留 Windows 盘符、UNC、相对路径、普通文件名和工具输出中的生成文件。
4. Renderer 和 Core 继续复用同一解析器，不增加两套过滤逻辑。

## 测试

在现有 Desktop 文件面板测试中增加回归场景：

- Web 工具输出中的 HTTP/HTTPS URL 不产生文件条目。
- 小数和版本片段不产生隐藏文件条目。
- 同一段输出里的真实本地文件仍会被识别。

运行相关 Desktop 测试及 `bun run typecheck`，确保没有破坏现有路径支持。
