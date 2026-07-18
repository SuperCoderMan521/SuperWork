import type { DesktopApi } from '../../electron/desktop-api.js'

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}

export {}
