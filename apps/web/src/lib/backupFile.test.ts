import { afterEach, describe, expect, it, vi } from 'vitest'
import { backupSource, openNativeBackup, saveBackupFile } from './backupFile'

afterEach(() => vi.unstubAllGlobals())
function android(result: unknown, reject = false) {
  const nativePromise = reject ? vi.fn().mockRejectedValue(result) : vi.fn().mockResolvedValue(result)
  vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android', nativePromise } })
  return nativePromise
}
describe('Android backup document bridge', () => {
  it('waits for native save completion and forwards UTF-8 JSON', async () => {
    const call = android({ cancelled: false })
    expect(backupSource()).toBe('android')
    expect(await saveBackupFile('{"工资":19000}', '备份.json')).toBe('saved')
    expect(call).toHaveBeenCalledWith('DataBackup', 'save', { text: '{"工资":19000}', filename: '备份.json' })
  })
  it('does not report cancellation as a successful save or import', async () => {
    android({ cancelled: true })
    expect(await saveBackupFile('{}', 'backup.json')).toBe('cancelled')
    expect(await openNativeBackup()).toBeNull()
  })
  it('returns the selected document for schema validation', async () => {
    const call = android({ text: '{"工资":19000}' })
    expect(await openNativeBackup()).toBe('{"工资":19000}')
    expect(call).toHaveBeenCalledWith('DataBackup', 'open', {})
  })
  it('gives older Android installations an actionable upgrade message', async () => {
    android(new Error('DataBackup plugin is not implemented on android'), true)
    await expect(saveBackupFile('{}', 'backup.json')).rejects.toThrow('先更新安卓应用')
  })
  it('does not expose native exception details', async () => {
    android(new Error('content://private/user/document failed'), true)
    await expect(openNativeBackup()).rejects.toThrow('文件操作未完成')
  })
  it('rejects oversized UTF-8 data before opening a native picker', async () => {
    const call = android({})
    await expect(saveBackupFile('薪'.repeat(3 * 1024 * 1024), 'backup.json')).rejects.toThrow('8 MB')
    expect(call).not.toHaveBeenCalled()
  })
})
