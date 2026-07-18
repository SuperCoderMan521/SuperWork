import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { DesktopCommandSchema } from '../shared/schemas.js'
import {
  DESKTOP_COMMAND_CHANNEL,
  DESKTOP_DIAGNOSTICS_GET_CHANNEL,
  DESKTOP_EVENT_CHANNEL,
  DESKTOP_LOG_FOLDER_OPEN_CHANNEL,
  DESKTOP_WORKSPACE_SELECT_CHANNEL,
} from './channels.js'
import { createApplicationMenuTemplate } from './app-menu.js'
import { DesktopLogger } from './desktop-logger.js'
import { DiagnosticsService } from './diagnostics-service.js'
import { createNodeSidecarFactory } from './node-sidecar-process.js'
import { resolveSidecar } from './resolve-sidecar.js'
import { SidecarManager } from './sidecar-manager.js'
import { createWindowOptions } from './window-options.js'

let mainWindow: BrowserWindow | null = null
let sidecar: SidecarManager | null = null
let diagnostics: DiagnosticsService | null = null

app.setName('SuperWork')
app.setPath('userData', join(app.getPath('appData'), 'SuperWork'))

function openSettingsFromMenu(): void {
  mainWindow?.webContents.send(DESKTOP_EVENT_CHANNEL, {
    type: 'settings.opened',
  })
}

async function createWindow(): Promise<void> {
  if (!diagnostics) {
    diagnostics = new DiagnosticsService(
      new DesktopLogger({ directory: join(app.getPath('userData'), 'logs') }),
    )
    diagnostics.logger.info(
      'app',
      `starting version=${app.getVersion()} packaged=${app.isPackaged}`,
    )
  }

  const preloadPath = join(import.meta.dirname, 'preload.cjs')
  mainWindow = new BrowserWindow(createWindowOptions(preloadPath))
  mainWindow.setMenuBarVisibility(false)
  mainWindow.webContents.on(
    'console-message',
    (_event, level, message, line, sourceId) => {
      const detail = `${message} (${sourceId}:${line})`
      if (level >= 2) diagnostics?.logger.error('renderer-console', detail)
      else diagnostics?.logger.info('renderer-console', detail)
    },
  )
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    diagnostics?.recordError(
      'renderer',
      new Error(
        `renderer gone reason=${details.reason} exitCode=${details.exitCode}`,
      ),
    )
  })
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    diagnostics?.recordError(
      'renderer',
      new Error(`load failed ${code}: ${description}`),
    )
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', event => event.preventDefault())
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      createApplicationMenuTemplate({
        openSettings: openSettingsFromMenu,
        quit: () => app.quit(),
      }),
    ),
  )
  if (process.platform === 'win32') {
    mainWindow.setAutoHideMenuBar(true)
  }

  const sidecarConfig = resolveSidecar({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    platform: process.platform,
  })
  diagnostics.logger.info(
    'sidecar',
    `spawn bun=${sidecarConfig.bunPath} entry=${sidecarConfig.entryPath} cwd=${sidecarConfig.cwd}`,
  )
  const factory = createNodeSidecarFactory({
    ...sidecarConfig,
    onStderr: chunk => diagnostics?.recordSidecarStderr(chunk),
  })
  sidecar = new SidecarManager(factory, {
    onEvent: event => {
      if (event.type === 'command.failed') {
        diagnostics?.logger.error(
          'core-event',
          `type=${event.type} code=${event.error.code} message=${event.error.message}`,
        )
      } else if (event.type !== 'message.delta') {
        diagnostics?.logger.info('core-event', `type=${event.type}`)
      }
      mainWindow?.webContents.send(DESKTOP_EVENT_CHANNEL, event)
    },
    onStatusChange: status => diagnostics?.setCoreStatus(status),
    onProcessError: error => diagnostics?.recordError('sidecar-spawn', error),
    onPermanentFailure: code => {
      diagnostics?.recordError(
        'sidecar',
        new Error(`Desktop Core stopped unexpectedly (${code ?? 'unknown'})`),
      )
      mainWindow?.webContents.send(DESKTOP_EVENT_CHANNEL, {
        type: 'command.failed',
        requestId: 'sidecar-process',
        error: {
          code: 'SIDECAR_CRASHED',
          message: `Desktop Core stopped unexpectedly (${code ?? 'unknown'})`,
          recoverable: false,
        },
      })
    },
  })
  sidecar.start()
  diagnostics?.logger.info('app', 'electron startup complete, window + sidecar started')

  const devUrl = process.env.CCB_DESKTOP_DEV_URL
  if (devUrl) await mainWindow.loadURL(devUrl)
  else await mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

ipcMain.on(DESKTOP_COMMAND_CHANNEL, (_event, value: unknown) => {
  const parsed = DesktopCommandSchema.safeParse(value)
  if (!parsed.success) {
    diagnostics?.logger.error('ipc', 'rejected invalid desktop command')
    return
  }
  diagnostics?.logger.info(
    'command',
    `type=${parsed.data.type} requestId=${parsed.data.requestId}`,
  )
  try {
    sidecar?.send(parsed.data)
  } catch (error) {
    const sessionId =
      'sessionId' in parsed.data ? parsed.data.sessionId : undefined
    const message = error instanceof Error ? error.message : String(error)
    diagnostics?.logger.error(
      'command',
      `failed type=${parsed.data.type} message=${message}`,
    )
    mainWindow?.webContents.send(DESKTOP_EVENT_CHANNEL, {
      type: 'command.failed',
      requestId: parsed.data.requestId,
      sessionId,
      error: {
        code: 'CORE_UNAVAILABLE',
        message,
        recoverable: true,
      },
    })
  }
})

ipcMain.handle(DESKTOP_DIAGNOSTICS_GET_CHANNEL, () => diagnostics?.snapshot())
ipcMain.handle(DESKTOP_LOG_FOLDER_OPEN_CHANNEL, async () => {
  if (!diagnostics) return
  shell.showItemInFolder(diagnostics.logger.filePath)
})
ipcMain.handle(DESKTOP_WORKSPACE_SELECT_CHANNEL, async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择工作文件夹',
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
})

app.whenReady().then(() => {
  console.log('[electron-main] app ready, creating window + sidecar')
  return createWindow()
}).catch(error => {
  diagnostics?.recordError('app', error)
  dialog.showErrorBox(
    'SuperWork 启动失败',
    `${error instanceof Error ? error.message : String(error)}\n\n日志：${diagnostics?.logger.filePath ?? '不可用'}`,
  )
})
app.on('window-all-closed', () => {
  sidecar?.stop()
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})
