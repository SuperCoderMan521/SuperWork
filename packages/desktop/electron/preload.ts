import { contextBridge, ipcRenderer } from 'electron'
import { DesktopEventSchema } from '../shared/schemas.js'
import {
  DESKTOP_COMMAND_CHANNEL,
  DESKTOP_DIAGNOSTICS_GET_CHANNEL,
  DESKTOP_EVENT_CHANNEL,
  DESKTOP_LOG_FOLDER_OPEN_CHANNEL,
  DESKTOP_WORKSPACE_SELECT_CHANNEL,
  DESKTOP_WORKSPACE_EDITORS_LIST_CHANNEL,
  DESKTOP_WORKSPACE_EDITOR_OPEN_CHANNEL,
} from './channels.js'
import { createDesktopApi } from './desktop-api.js'

const api = createDesktopApi(
  command => ipcRenderer.send(DESKTOP_COMMAND_CHANNEL, command),
  listener => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const parsed = DesktopEventSchema.safeParse(value)
      if (parsed.success) listener(parsed.data)
    }
    ipcRenderer.on(DESKTOP_EVENT_CHANNEL, handler)
    return () => ipcRenderer.removeListener(DESKTOP_EVENT_CHANNEL, handler)
  },
  () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  {
    get: () => ipcRenderer.invoke(DESKTOP_DIAGNOSTICS_GET_CHANNEL),
    openFolder: () => ipcRenderer.invoke(DESKTOP_LOG_FOLDER_OPEN_CHANNEL),
    selectWorkspace: () => ipcRenderer.invoke(DESKTOP_WORKSPACE_SELECT_CHANNEL),
    listWorkspaceEditors: refresh =>
      ipcRenderer.invoke(DESKTOP_WORKSPACE_EDITORS_LIST_CHANNEL, { refresh }),
    openWorkspaceInEditor: (editorId, workspace) =>
      ipcRenderer.invoke(DESKTOP_WORKSPACE_EDITOR_OPEN_CHANNEL, {
        editorId,
        workspace,
      }),
  },
)

contextBridge.exposeInMainWorld('desktopApi', api)
