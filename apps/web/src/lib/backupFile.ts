import { MAX_BACKUP_BYTES, type Backup } from './backup'
import { isAndroidNative } from './appUpdate'

export function backupSource(): Backup['source'] {
  return isAndroidNative() ? 'android' : 'moneyDanceDesktop' in window ? 'desktop' : 'web'
}
async function nativeFile<T>(method: string, options: Record<string, unknown> = {}): Promise<T> {
  try { return await window.Capacitor!.nativePromise!<T>('DataBackup', method, options) }
  catch (error) {
    if (/not implemented|not available|UNIMPLEMENTED|not found/i.test(String(error))) throw new Error('此安卓安装包尚不支持文件备份，请先更新安卓应用后再试。')
    throw new Error('文件操作未完成，请检查保存位置或重新选择文件。')
  }
}
export async function saveBackupFile(text: string, filename: string): Promise<'saved' | 'download' | 'cancelled'> {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('备份超过 8 MB，无法保存。')
  if (isAndroidNative()) {
    const result = await nativeFile<{ cancelled?: boolean }>('save', { text, filename })
    return result.cancelled ? 'cancelled' : 'saved'
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = filename
  document.body.append(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  return 'download'
}
export async function openNativeBackup(): Promise<string | null> {
  const result = await nativeFile<{ cancelled?: boolean; text?: string }>('open')
  if (result.cancelled) return null
  if (typeof result.text !== 'string') throw new Error('没有读取到备份内容。')
  return result.text
}
