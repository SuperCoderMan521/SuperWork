import type {
  DesktopModelConnectionResult,
  DesktopModelConfig,
  PermissionMode,
} from '../../../../shared/protocol.js'

type SessionSettingsProps = {
  model: string
  mode: PermissionMode
  cwd?: string
  configPath?: string | null
  modelConfig?: DesktopModelConfig
  onModelChange: (model: string) => void
  onModeChange: (mode: PermissionMode) => void
  onModelConfigChange?: (config: DesktopModelConfig) => void
  onTestModelConfig?: (config: DesktopModelConfig) => void
  connectionTest?: DesktopModelConnectionResult | null
  connectionTesting?: boolean
}

const modes: Array<{ value: PermissionMode; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'acceptEdits', label: 'Accept edits' },
  { value: 'plan', label: 'Plan' },
  { value: 'dontAsk', label: "Don't ask" },
  { value: 'bypassPermissions', label: 'Bypass permissions' },
]

const providers = ['anthropic', 'openai', 'gemini', 'grok', 'bedrock', 'vertex']

export function SessionSettings({
  model,
  mode,
  cwd,
  configPath,
  modelConfig,
  onModelChange,
  onModeChange,
  onModelConfigChange,
  onTestModelConfig,
  connectionTest,
  connectionTesting = false,
}: SessionSettingsProps): React.ReactNode {
  const currentConfig = (): DesktopModelConfig => ({
    provider: modelConfig?.provider,
    baseUrl: modelConfig?.baseUrl,
    token: modelConfig?.token,
    model: modelConfig?.model,
  })
  const updateConfig = (patch: Partial<DesktopModelConfig>) => {
    onModelConfigChange?.({
      ...currentConfig(),
      ...patch,
    })
  }

  return (
    <div className="session-controls">
      {cwd ? (
        <div className="settings-field">
          <span>项目路径</span>
          <code>{cwd}</code>
        </div>
      ) : null}
      {configPath ? (
        <div className="settings-field">
          <span>配置文件</span>
          <code>{configPath}</code>
        </div>
      ) : null}
      <label>
        <span>模型</span>
        <input
          aria-label="模型"
          value={model}
          onChange={event => onModelChange(event.target.value)}
        />
      </label>
      <label>
        <span>权限模式</span>
        <select
          aria-label="权限模式"
          value={mode}
          onChange={event => onModeChange(event.target.value as PermissionMode)}
        >
          {modes.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <section className="provider-config">
        <h3>模型执行配置</h3>
        <label>
          <span>Provider</span>
          <select
            aria-label="Provider"
            value={modelConfig?.provider ?? 'anthropic'}
            onChange={event => updateConfig({ provider: event.target.value })}
          >
            {providers.map(provider => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Base URL</span>
          <input
            aria-label="Base URL"
            value={modelConfig?.baseUrl ?? ''}
            onChange={event => updateConfig({ baseUrl: event.target.value })}
            placeholder="https://api.anthropic.com 或 OpenAI-compatible endpoint"
          />
        </label>
        <label>
          <span>Token</span>
          <input
            aria-label="Token"
            value={modelConfig?.token ?? ''}
            onChange={event => updateConfig({ token: event.target.value })}
            placeholder="API Token"
            type="password"
          />
        </label>
        <label>
          <span>MODEL</span>
          <input
            aria-label="MODEL"
            value={modelConfig?.model ?? ''}
            onChange={event => updateConfig({ model: event.target.value })}
            placeholder="例如 qwen3-coder / claude-sonnet-4"
          />
        </label>
        <div className="connection-test-row">
          <button
            type="button"
            className="secondary-button"
            disabled={connectionTesting}
            onClick={() => onTestModelConfig?.(currentConfig())}
          >
            {connectionTesting ? '测试中...' : '测试连接'}
          </button>
          {connectionTest ? (
            <span
              className={connectionTest.ok ? 'connection-ok' : 'connection-error'}
              role="status"
            >
              {connectionTest.message}
              {connectionTest.status ? ` · HTTP ${connectionTest.status}` : ''}
              {connectionTest.latencyMs ? ` · ${connectionTest.latencyMs}ms` : ''}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  )
}
