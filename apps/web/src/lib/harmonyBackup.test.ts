import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('./harmony', () => ({ isHarmonyBuild: true, harmonyFile: vi.fn() }))
import { harmonyFile } from './harmony'
import { backupSource, hasNativeBackupPicker, openNativeBackup, saveBackupFile } from './backupFile'
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })
describe('HarmonyOS backup file integration', () => {
  it('uses the native picker and preserves the portable v1 backup source', async () => {
    vi.stubGlobal('window', {})
    vi.mocked(harmonyFile).mockResolvedValue({})
    expect(hasNativeBackupPicker()).toBe(true)
    expect(backupSource()).toBe('web')
    expect(await saveBackupFile('{"工资":1}', '备份.json')).toBe('saved')
    expect(harmonyFile).toHaveBeenCalledWith('save', '{"工资":1}', '备份.json')
  })
  it('does not treat picker cancellation as a completed backup', async () => {
    vi.mocked(harmonyFile).mockResolvedValue({ cancelled: true })
    expect(await saveBackupFile('{}', '备份.json')).toBe('cancelled')
    expect(await openNativeBackup()).toBeNull()
  })
  it('reads selected content and rejects empty native results', async () => {
    vi.mocked(harmonyFile).mockResolvedValueOnce({ text: '{"工资":1}' }).mockResolvedValueOnce({})
    expect(await openNativeBackup()).toBe('{"工资":1}')
    await expect(openNativeBackup()).rejects.toThrow('没有读取到备份内容')
  })
  it('rejects oversized UTF-8 backups before opening the picker', async () => {
    await expect(saveBackupFile('薪'.repeat(3 * 1024 * 1024), '备份.json')).rejects.toThrow('8 MB')
    expect(harmonyFile).not.toHaveBeenCalled()
  })
})
