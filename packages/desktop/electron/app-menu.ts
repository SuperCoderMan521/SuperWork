import type { MenuItemConstructorOptions } from 'electron'

type AppMenuOptions = {
  openSettings: () => void
  quit: () => void
  platform?: NodeJS.Platform
}

export function createApplicationMenuTemplate({
  openSettings,
  quit,
  platform = process.platform,
}: AppMenuOptions): MenuItemConstructorOptions[] {
  const isMac = platform === 'darwin'
  return [
    {
      label: 'File',
      submenu: [
        {
          label: 'Claude Code 配置',
          accelerator: 'CommandOrControl+,',
          click: openSettings,
        },
        { type: 'separator' },
        isMac
          ? { role: 'close' }
          : {
              label: '退出',
              accelerator: 'Alt+F4',
              click: quit,
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ]
}
