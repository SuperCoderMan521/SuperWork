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
    pricing: modelConfig?.pricing,
  })
  const updateConfig = (patch: Partial<DesktopModelConfig>) => {
    onModelConfigChange?.({
      ...currentConfig(),
      ...patch,
    })
  }
  const updatePrice = (
    key: Exclude<keyof NonNullable<DesktopModelConfig['pricing']>, 'currency'>,
    value: string,
  ) => {
    const parsed = Number(value)
    updateConfig({
      pricing: {
        currency: 'USD',
        perMillionInputTokens: modelConfig?.pricing?.perMillionInputTokens ?? 0,
        perMillionOutputTokens: modelConfig?.pricing?.perMillionOutputTokens ?? 0,
        perMillionCacheCreationTokens: modelConfig?.pricing?.perMillionCacheCreationTokens ?? 0,
        perMillionCacheReadTokens: modelConfig?.pricing?.perMillionCacheReadTokens ?? 0,
        [key]: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
      },
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
        <fieldset className="pricing-config">
          <legend>Token 价格（USD / 1M Tokens）</legend>
          {([
            ['perMillionInputTokens', '输入价格'],
            ['perMillionOutputTokens', '输出价格'],
            ['perMillionCacheCreationTokens', '缓存写入价格'],
            ['perMillionCacheReadTokens', '缓存读取价格'],
          ] as const).map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                aria-label={label}
                type="number"
                min="0"
                step="0.0001"
                value={modelConfig?.pricing?.[key] ?? 0}
                onChange={event => updatePrice(key, event.target.value)}
              />
            </label>
          ))}
        </fieldset>
      </section>
    </div>
  )
}
