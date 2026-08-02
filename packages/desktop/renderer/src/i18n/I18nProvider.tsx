import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type Locale = 'zh-CN' | 'en-US'
const STORAGE_KEY = 'superwork.locale'

const zhToEn: Record<string, string> = {
  '对话': 'Conversations', '还没有会话': 'No conversations yet', '未命名会话': 'Untitled conversation',
  '模型': 'Model', '插件': 'Plugins', '记忆': 'Memory', '新任务': 'New task', '新建任务': 'New task', '查看日志': 'View logs',
  '已连接': 'Connected', '启动失败': 'Startup failed', '重启中': 'Restarting', '已停止': 'Stopped', '启动中': 'Starting',
  '正在重启': 'Restarting', '未连接': 'Not connected',
  '选择工作区': 'Choose workspace', '输入问题，或输入 / 使用 SuperWork 指令': 'Ask anything, or type / for SuperWork commands',
  '正在生成，可以随时中断': 'Generating — you can stop at any time', '发送': 'Send', '中断生成': 'Stop generation',
  'SuperWork 配置': 'SuperWork Settings', '返回': 'Back', '请选择一个会话': 'Select a conversation',
  '项目路径': 'Project path', '配置文件': 'Configuration file', '权限模式': 'Permission mode',
  '模型执行配置': 'Model runtime configuration', '测试连接': 'Test connection', '测试中...': 'Testing...',
  '文件': 'Files', '加载中…': 'Loading…', '当前对话还没有产生文件。': 'No files have been created in this conversation.',
  '在编辑器中打开': 'Open in editor', '重新检测': 'Detect again', '打开工作区': 'Open workspace',
  '拒绝': 'Deny', '允许一次': 'Allow once', '本会话允许': 'Allow for session', '处理中…': 'Processing…',
  '关闭': 'Close', '请求失败': 'Request failed', '伙伴': 'Buddy', '打开伙伴': 'Open Buddy', '收起伙伴': 'Collapse Buddy',
  '孵化伙伴': 'Hatch Buddy', '你的编码伙伴还没有孵化。': 'Your coding companion has not hatched yet.',
  '普通': 'Common', '稀有': 'Uncommon', '珍稀': 'Rare', '史诗': 'Epic', '传说': 'Legendary',
  '闪光': 'Shiny', '调试力': 'Debugging', '耐心': 'Patience', '混乱度': 'Chaos', '智慧': 'Wisdom', '毒舌度': 'Snark',
  '抚摸': 'Pet', '重新孵化': 'Rehatch', '静音': 'Mute', '取消静音': 'Unmute',
  '本轮使用': 'Turn usage', '输入 Token': 'Input tokens', '输出 Token': 'Output tokens', '缓存读取': 'Cache read',
  '缓存写入': 'Cache write', '缓存命中率': 'Cache hit rate', '费用': 'Cost', '耗时': 'Duration', 'API 调用': 'API calls',
  '执行中': 'Running', '等待中': 'Pending', '完成': 'Completed', '已拒绝': 'Denied', '已中断': 'Interrupted', '失败': 'Failed',
  '读取': 'Read', '编辑': 'Edit', '写入': 'Write', '命令': 'Command', '搜索': 'Search', '网络': 'Web',
  '配置中心': 'Settings', '模型配置': 'Model settings', '记忆配置': 'Memory settings', '插件配置': 'Plugin settings',
  // Common UI labels
  '取消': 'Cancel', '导入': 'Import', '导入中…': 'Importing…', '导入技能': 'Import skill', '关闭导入技能': 'Close skill import',
  '收起': 'Collapse', '展开': 'Expand', '收起详情': 'Collapse details', '展开详情': 'Expand details',
  '查看原始请求': 'View raw request', '预览': 'Preview', '打开': 'Open', '复制': 'Copy',
  '复制路径': 'Copy path', '复制内容': 'Copy content', '刷新': 'Refresh', '重试': 'Retry',
  '保存记忆': 'Save memory', '压缩记忆': 'Compress memory', '收起编辑': 'Collapse editor',
  '创建': 'Create', '更多': 'More', '技能': 'Skills', '连应用': 'Apps', '模式': 'Mode',
  '选择工作空间': 'Choose workspace', '选择工作区并新建对话': 'Choose workspace and new conversation',
  '内容由 AI 生成，请核实重要信息': 'AI-generated content. Please verify.',
  '确认选择': 'Confirm selection', '上一题': 'Previous',
  // Sidebar
  '侧边栏视图切换': 'Sidebar view switch', '对话历史': 'Conversation history', '删除对话': 'Delete conversation',
  '微信对话': 'WeChat conversations', '未连接微信通道或暂无对话': 'WeChat not connected or no conversations',
  '微信': 'WeChat', '桌面': 'Desktop', '配置入口': 'Configuration', '配置分类': 'Configuration categories',
  '返回主对话': 'Back to conversation',
  // Welcome screen
  '从一个工作区开始': 'Start with a workspace', '默认文件夹': 'Default folder', '当前项目': 'Current project',
  '可做的事情': 'What you can do', '写 PPT': 'Write slides', '整理日报': 'Daily report',
  '代码协作': 'Code collaboration', '分析项目': 'Analyze project',
  'Desktop Core 启动失败': 'Desktop Core failed to start', '查看诊断日志': 'View diagnostic logs',
  '整理提纲、生成页结构、补充演讲要点。': 'Outline, generate page structure, add speaker notes.',
  '把今天的进度、问题、计划自动汇总成日报。': 'Summarize progress, issues, and plans into a daily report.',
  '阅读、修改、写入文件，并在右侧直接看结果。': 'Read, modify, write files, and see results on the right.',
  '归纳架构、查找问题、解释工具输出和差异。': 'Summarize architecture, find issues, explain tool output and diffs.',
  '默认会话会使用当前工作区。你也可以随时切换目录，继续同一组文件和历史。': 'The default session uses the current workspace. You can switch directories anytime to continue with the same files and history.',
  // Skill import
  '拖拽文件或点击上传': 'Drag files or click to upload', '支持 skills zip 或包含 SKILL.md 的文件夹': 'Supports skills zip or folder with SKILL.md',
  '选择 zip': 'Choose zip', '选择文件夹': 'Choose folder', '非高风险自动安装': 'Auto-install non-high-risk',
  '文件要求': 'File requirements', '导入成功，Skills 列表已刷新。': 'Import succeeded. Skills list refreshed.',
  '文件夹或者 .zip 需要包含 SKILL.md 文件': 'Folder or .zip must contain SKILL.md',
  'SKILL.md 文件需包含 YAML 格式的技能名称和描述': 'SKILL.md must include name and description in YAML',
  // Buddy species
  '鸭子': 'Duck', '鹅': 'Goose', '果冻': 'Blob', '猫咪': 'Cat', '龙': 'Dragon', '章鱼': 'Octopus',
  '猫头鹰': 'Owl', '企鹅': 'Penguin', '乌龟': 'Turtle', '蜗牛': 'Snail', '幽灵': 'Ghost',
  '蝾螈': 'Axolotl', '水豚': 'Capybara', '仙人掌': 'Cactus', '机器人': 'Robot', '兔子': 'Rabbit',
  '蘑菇': 'Mushroom', '胖胖': 'Chonk', '收起属性': 'Collapse stats', '展开属性': 'Expand stats',
  // Config center - WeChat
  '微信通道': 'WeChat Channel', '认证配置': 'Auth configuration', '扫码登录': 'Scan to login',
  '启动接收': 'Start receiving', '清除登录': 'Clear login', '微信扫码登录二维码': 'WeChat scan login QR code',
  '打开二维码链接': 'Open QR link', '二维码已生成，请使用微信扫码': 'QR code generated, please scan with WeChat',
  '账号': 'Account', '尚未登录': 'Not logged in', '保存时间': 'Saved at', '暂无': 'N/A',
  '已授权用户': 'Authorized users', '第一次打通': 'First time setup',
  '微信对话记录': 'WeChat conversations', '状态目录': 'State directory', '游标文件': 'Cursor file',
  '已产生': 'Created', '尚未产生': 'Not created', '待配对': 'Pending pairing',
  '接收状态': 'Receive status', '暂无微信对话记录。若首次发送后收到配对码，请先完成授权。': 'No WeChat conversations yet. Complete authorization first if you received a pairing code.',
  // Config center - Memory
  '用户问答记忆': 'User Q&A memory', '自动记忆目录未加载': 'Auto memory directory not loaded',
  '已开启': 'Enabled', '已关闭': 'Disabled', 'CLAUDE.md 规则文件': 'CLAUDE.md rule files',
  '选择一个记忆文件查看或编辑。': 'Select a memory file to view or edit.',
  '未发现 Skills 配置。': 'No Skills configuration found.',
  '未发现 MCP server 配置。': 'No MCP server configuration found.',
  '未发现插件配置。': 'No plugin configuration found.', '未创建': 'Not created',
  // Session settings
  'Token 价格（USD / 1M Tokens）': 'Token pricing (USD / 1M Tokens)',
  '输入价格': 'Input price', '输出价格': 'Output price', '缓存写入价格': 'Cache write price',
  '缓存读取价格': 'Cache read price',
  // Performance center
  '性能中心': 'Performance center', '工作区历史': 'Workspace history', '统计范围': 'Statistics range',
  '最近 7 天': 'Last 7 days', '最近 30 天': 'Last 30 days', '全部': 'All',
  '性能数据加载失败': 'Failed to load performance data', '正在分析本地会话…': 'Analyzing local sessions…',
  '当前范围没有会话数据。': 'No session data in this range.',
  '总 TOKEN': 'Total tokens', '估算费用': 'Estimated cost', '总耗时': 'Total time',
  '失败 / 中断': 'Failed / Interrupted', '会话': 'sessions', '轮': 'turns',
  '缓存命中': 'Cache hit', '价格覆盖': 'Price coverage', 'Token 与耗时趋势': 'Token and time trend',
  'Token 构成': 'Token composition', '输入': 'Input', '输出': 'Output',
  '工具性能': 'Tool performance', '工具': 'Tool', '次数': 'Count', '平均耗时': 'Avg time',
  '模型分布': 'Model distribution', '调用': 'Calls', '诊断状态': 'Diagnostics',
  '可用': 'Available', '未启用': 'Not enabled', '已配置': 'Configured', '未配置': 'Not configured',
  '扫描': 'Scanned', '行': 'lines',
  // Scheduled tasks
  '本地定时任务': 'Local scheduled tasks', '读取中…': 'Reading…', '读取失败': 'Read failed',
  '任务数': 'Task count', '当前工作区暂无本地定时任务': 'No local scheduled tasks in current workspace',
  '循环': 'Recurring', '一次性': 'One-time', '持久': 'Durable', '临时': 'Temporary',
  '永久': 'Permanent', '转为持久': 'Make durable', '创建时间': 'Created at', '上次执行': 'Last fired',
  '主会话': 'Main session', '任务': 'Task',
  // Permission panel
  '工具权限请求': 'Tool permission request', '请求权限': 'requests permission',
  '写入文件': 'Write file', '修改文件': 'Modify file', '读取文件': 'Read file',
  '执行 Shell 命令': 'Execute shell command', '执行 PowerShell 命令': 'Execute PowerShell command',
  '内容预览': 'Content preview', '变更预览': 'Diff preview', '文件内容': 'File content',
  '查看/复制原始内容': 'View/Copy raw content',
  // Agent activity
  '运行中': 'Running', '已完成': 'Completed', '阻塞': 'Blocked', '待处理': 'Pending',
  '等待': 'Waiting', '空闲': 'Idle', '正在执行': 'Executing', '执行完成': 'Execution complete',
  '执行失败': 'Execution failed', '等待响应': 'Waiting for response', '等待任务': 'Waiting for tasks',
  'Agent 观测': 'Agent monitor', '当前会话': 'Current session', '暂无多 Agent 活动': 'No multi-agent activity',
  'Agent 状态摘要': 'Agent status summary', '消息': 'Messages', '任务执行': 'Task execution',
  '执行者': 'Executor', '未分配': 'Unassigned', '委派代理': 'Delegated agents',
  '委派请求': 'Delegation request', '输出结论': 'Output result', '暂无 Agent': 'No agents',
  '通信': 'Communication', '暂无通信消息': 'No messages',
  // Artifacts
  '还没有本地 Artifacts': 'No local artifacts yet', '来自当前对话': 'From current conversation',
  '本地工件操作': 'Artifact actions', '未知错误': 'Unknown error',
  // Workspace
  '右侧工作区': 'Right workspace', '调整左侧宽度': 'Adjust left width',
  '调整文件区宽度': 'Adjust file panel width', '关闭文件区': 'Close file panel',
  '编辑差异': 'Edit diff', '正在检测编辑器…': 'Detecting editors…',
  '未检测到支持的编辑器': 'No supported editors detected', '正在打开…': 'Opening…',
  '选择左侧文件查看内容。': 'Select a file on the left to view content.',
  // Diagnostics
  '关闭诊断日志': 'Close diagnostic logs', '诊断日志': 'Diagnostic logs',
  // AskUserQuestion
  '回答问题': 'Answer question',
  // Misc
  '条': 'messages', '记忆已保存。': 'Memory saved.',
  '确定删除这个对话？此操作不可撤销。': 'Delete this conversation? This cannot be undone.',
}
const enToZh = Object.fromEntries(Object.entries(zhToEn).map(([zh, en]) => [en, zh]))

function detectLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'zh-CN' || stored === 'en-US') return stored
  } catch {}
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function translateText(value: string, locale: Locale): string {
  const map = locale === 'en-US' ? zhToEn : enToZh
  const trimmed = value.trim()
  const translated = map[trimmed]
  return translated ? value.replace(trimmed, translated) : value
}

function translateTree(root: ParentNode, locale: Locale): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const protectedContent = node.parentElement?.closest('.message-row, .markdown-message, .tool-output, .file-viewer, .file-editor')
    if (node.parentElement && !protectedContent && !['SCRIPT', 'STYLE', 'TEXTAREA', 'PRE', 'CODE'].includes(node.parentElement.tagName)) {
      node.nodeValue = translateText(node.nodeValue ?? '', locale)
    }
    node = walker.nextNode()
  }
  const elements = root instanceof Element ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')]
  for (const element of elements) {
    for (const attribute of ['title', 'aria-label', 'placeholder']) {
      const value = element.getAttribute(attribute)
      if (value) element.setAttribute(attribute, translateText(value, locale))
    }
  }
  document.documentElement.lang = locale
}

type I18nContextValue = { locale: Locale; setLocale: (locale: Locale) => void; toggleLocale: () => void }
const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }): React.ReactNode {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)
  const setLocale = (next: Locale) => {
    setLocaleState(next)
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch {}
  }
  useEffect(() => {
    translateTree(document.body, locale)
    const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof Element) translateTree(node, locale)
      else if (node.nodeType === Node.TEXT_NODE) node.nodeValue = translateText(node.nodeValue ?? '', locale)
    })))
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [locale])
  const value = useMemo(() => ({ locale, setLocale, toggleLocale: () => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN') }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext)
  return value ?? { locale: 'zh-CN', setLocale: () => {}, toggleLocale: () => {} }
}
