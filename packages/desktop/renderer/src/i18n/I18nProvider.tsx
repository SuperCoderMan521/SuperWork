import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type Locale = 'zh-CN' | 'en-US'
const STORAGE_KEY = 'superwork.locale'

const zhToEn: Record<string, string> = {
  '对话': 'Conversations', '还没有会话': 'No conversations yet', '未命名会话': 'Untitled conversation',
  '模型': 'Model', '插件': 'Plugins', '记忆': 'Memory', '新任务': 'New task', '查看日志': 'View logs',
  '已连接': 'Connected', '启动失败': 'Startup failed', '重启中': 'Restarting', '已停止': 'Stopped', '启动中': 'Starting',
  '选择工作区': 'Choose workspace', '输入问题，或输入 / 使用 Claude Code 指令': 'Ask anything, or type / for Claude Code commands',
  '正在生成，可以随时中断': 'Generating — you can stop at any time', '发送': 'Send', '中断生成': 'Stop generation',
  'Claude Code 配置': 'Claude Code Settings', '返回': 'Back', '请选择一个会话': 'Select a conversation',
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
