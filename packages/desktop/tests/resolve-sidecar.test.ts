import { describe, expect, test } from 'bun:test'
import { resolveSidecar } from '../electron/resolve-sidecar.js'

describe('resolveSidecar', () => {
  test('uses packaged runtime resources in production', () => {
    expect(
      resolveSidecar({
        packaged: true,
        resourcesPath: 'C:/Program Files/CCB/resources',
        appPath: 'C:/Program Files/CCB/resources/app.asar',
        platform: 'win32',
      }),
    ).toEqual({
      bunPath: 'C:\\Program Files\\CCB\\resources\\runtime\\bun.exe',
      entryPath: 'C:\\Program Files\\CCB\\resources\\core\\main.js',
      cwd: 'C:/Program Files/CCB/resources',
    })
  })

  test('uses PATH and source entry during development', () => {
    expect(
      resolveSidecar({
        packaged: false,
        resourcesPath: 'unused',
        appPath: 'G:/repo/packages/desktop',
        platform: 'win32',
      }),
    ).toEqual({
      bunPath: 'G:\\repo\\packages\\desktop\\dist\\runtime\\bun.exe',
      entryPath: 'G:\\repo\\packages\\desktop\\dist\\core\\main.js',
      cwd: 'G:/repo/packages/desktop',
    })
  })
})
