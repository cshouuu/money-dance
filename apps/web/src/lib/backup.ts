import { keys } from './storage'
import { BACKUP_CHECKS, PLANS_KEY, UNDO_KEY, assertSafeTree, validateBackupData } from './backupSchema'

export const MAX_BACKUP_BYTES = 8 * 1024 * 1024
export const RECOVERY_KEY = 'money-dance.backup-recovery.v1'
export const IMPORT_EVENT_KEY = 'money-dance.backup-imported.v1'
export const BACKUP_KEYS = Object.keys(BACKUP_CHECKS)
const REPLACE_KEYS = [...BACKUP_KEYS, keys.activeSlacking, keys.activeOvertime, UNDO_KEY]
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Snapshot = Record<string, string | null>
export interface Backup {
  format: 'moneydance-backup'
  version: 1
  exportedAt: string
  source: 'web' | 'android' | 'desktop'
  data: Record<string, unknown>
}
interface Journal { phase: 'pending' | 'complete'; before: Snapshot; createdAt: string; source?: Backup['source'] }
export class BackupRecoveryRequiredError extends Error {}
const size = (value: string) => new TextEncoder().encode(value).byteLength
const read = (storage: Store, key: string) => {
  const raw = storage.getItem(key)
  try { return raw === null ? null : JSON.parse(raw) as unknown }
  catch { throw new Error('本机有无法读取的数据，请先保留原数据并检查，未进行覆盖。') }
}
function snapshot(storage: Store): Snapshot { return Object.fromEntries(REPLACE_KEYS.map(key => [key, storage.getItem(key)])) }
export function backupFingerprint(storage: Store = localStorage): string { return JSON.stringify(snapshot(storage)) }

export function assertNoActiveTimers(storage: Store = localStorage) {
  if (read(storage, keys.activeSlacking) || read(storage, keys.activeOvertime)) throw new Error('请先结束摸鱼、加班计时并完成结算，再导出或导入。')
  const work = read(storage, keys.workRecords)
  if (Array.isArray(work) && work.some(record => record && (['working', 'paused'].includes(record.status) || record.settlementPending || record.sessions?.some((session: { endTime?: string }) => !session.endTime)))) {
    throw new Error('请先结束弹性工作并完成结算，再导出或导入。')
  }
  const plans = read(storage, PLANS_KEY)
  if (Array.isArray(plans) && plans.some(plan => plan?.status === 'running')) throw new Error('请先完成正在执行的计时预约，再导出或导入。')
}

function fromSnapshot(values: Snapshot, source: Backup['source'], exportedAt = new Date().toISOString()): Backup {
  const data = Object.fromEntries(BACKUP_KEYS.filter(key => values[key] !== null && values[key] !== undefined).map(key => [key, JSON.parse(values[key]!) as unknown]))
  validateBackupData(data)
  const backup: Backup = { format: 'moneydance-backup', version: 1, exportedAt, source, data }
  if (size(serializeBackup(backup)) > MAX_BACKUP_BYTES) throw new Error('备份超过 8 MB，请联系支持协助迁移。')
  return backup
}
export function createBackup(source: Backup['source'], storage: Store = localStorage): Backup {
  assertNoActiveTimers(storage)
  return fromSnapshot(snapshot(storage), source)
}
export function parseBackup(text: string): Backup {
  if (size(text) > MAX_BACKUP_BYTES) throw new Error('文件超过 8 MB，无法导入。')
  let value: Backup
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')) as Backup }
  catch { throw new Error('无法读取备份，请选择 MoneyDance 导出的 JSON 文件。') }
  if (!value || value.format !== 'moneydance-backup') throw new Error('这不是 MoneyDance 备份文件。')
  if (value.version !== 1) throw new Error('不支持此备份版本，请更新应用后再试。')
  if (!['web', 'android', 'desktop'].includes(value.source) || typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) throw new Error('备份来源或导出日期无效。')
  validateBackupData(value.data)
  const work = value.data[keys.workRecords] as { status: string; settlementPending?: boolean; sessions: { endTime?: string }[] }[] | undefined
  if (work?.some(record => ['working', 'paused'].includes(record.status) || record.settlementPending || record.sessions.some(session => !session.endTime))) throw new Error('备份中还有未结算的工作，请在原设备结算后重新导出。')
  const plans = value.data[PLANS_KEY] as { status: string }[] | undefined
  if (plans?.some(plan => plan.status === 'running')) throw new Error('备份中还有正在执行的预约，请在原设备结束后重新导出。')
  return value
}
export function serializeBackup(backup: Backup): string { return JSON.stringify(backup, null, 2) }
export function backupFileName(backup: Backup, prefix = 'MoneyDance备份'): string {
  return `${prefix}-${backup.exportedAt.replace(/[:.]/g, '-')}.json`
}
export function backupSummary(backup: Backup) {
  const count = (key: string) => Array.isArray(backup.data[key]) ? backup.data[key].length : 0
  return [
    { label: '账本记录', count: count(keys.ledger) }, { label: '心愿', count: count(keys.wishes) },
    { label: '出勤记录', count: count(keys.attendanceRecords) }, { label: '工作记录', count: count(keys.workRecords) },
    { label: '摸鱼记录', count: count(keys.sessions) }, { label: '加班记录', count: count(keys.overtimeSessions) },
    { label: '物品', count: count(keys.assets) },
  ]
}

function journal(storage: Store): Journal | null {
  const value = read(storage, RECOVERY_KEY) as Journal | null
  if (!value) return null
  assertSafeTree(value)
  if (!['pending', 'complete'].includes(value.phase) || !value.before || typeof value.before !== 'object'
    || !REPLACE_KEYS.every(key => Object.hasOwn(value.before, key) && (value.before[key] === null || typeof value.before[key] === 'string'))
    || Object.keys(value.before).some(key => !REPLACE_KEYS.includes(key))) throw new Error('导入恢复备份无法读取，请勿清除应用数据。')
  return value
}
function restore(storage: Store, before: Snapshot) {
  // Free imported data first, so restoring does not need space for both copies.
  for (const key of REPLACE_KEYS) storage.removeItem(key)
  for (const key of REPLACE_KEYS) if (before[key] !== null) storage.setItem(key, before[key]!)
}
export function recoverInterruptedImport(storage: Store = localStorage): boolean {
  const saved = journal(storage)
  if (saved?.phase !== 'pending') return false
  try { restore(storage, saved.before); storage.removeItem(RECOVERY_KEY); return true }
  catch { throw new Error('上次导入未完成，原数据恢复暂时失败。请释放设备空间后重新打开，勿清除应用数据。') }
}
export function previousBackup(storage: Store = localStorage): Backup | null {
  const saved = journal(storage)
  return saved ? fromSnapshot(saved.before, saved.source ?? 'web', saved.createdAt) : null
}

/** Synchronous commit: no per-key change events expose partially imported data. */
export function importBackup(backup: Backup, expectedFingerprint: string, storage: Store = localStorage, source: Backup['source'] = 'web'): void {
  const checked = parseBackup(serializeBackup(backup))
  assertNoActiveTimers(storage)
  if (backupFingerprint(storage) !== expectedFingerprint) throw new Error('本机数据已发生变化，请重新选择备份并核对后导入。')
  if (journal(storage)?.phase === 'pending') throw new Error('请重新打开应用，先恢复上一次未完成的导入。')
  const before = snapshot(storage)
  const previousJournal = storage.getItem(RECOVERY_KEY)
  const saved: Journal = { phase: 'pending', before, createdAt: new Date().toISOString(), source }
  // Reserve a durable rollback copy before touching any user data.
  try { storage.setItem(RECOVERY_KEY, JSON.stringify(saved)) }
  catch { throw new Error('无法保存导入前备份，可能存储空间不足。原数据未改动。') }
  try {
    for (const key of REPLACE_KEYS) storage.removeItem(key)
    for (const [key, original] of Object.entries(checked.data)) {
      // Plans must not start retroactively or run on two devices after migration.
      const value = key === PLANS_KEY ? (original as Record<string, unknown>[]).map(plan => plan.status === 'scheduled' ? { ...plan, status: 'cancelled', message: '跨设备导入后已取消，请按需重新预约' } : plan) : original
      storage.setItem(key, JSON.stringify(value))
    }
    storage.setItem(RECOVERY_KEY, JSON.stringify({ ...saved, phase: 'complete' }))
  } catch {
    try {
      restore(storage, before)
      if (previousJournal === null) storage.removeItem(RECOVERY_KEY)
      else storage.setItem(RECOVERY_KEY, previousJournal)
    } catch { throw new BackupRecoveryRequiredError('导入未完成，原数据备份已保留。请释放空间后重新打开应用恢复，勿清除应用数据。') }
    throw new Error('导入失败，已恢复原数据。请释放存储空间后重试。')
  }
  // Other open tabs must discard their in-memory copies. Failure to write this
  // advisory key cannot turn a successful import into a failed transaction.
  try { storage.setItem(IMPORT_EVENT_KEY, `${Date.now()}-${Math.random()}`) } catch { /* reload current window below */ }
}
