import { useEffect, useRef, useState } from 'react'
import { Download, Upload, DatabaseBackup } from 'lucide-react'
import { Button, Checkbox } from '../ui/BeuiControls'
import { ConfirmDialog } from './ConfirmDialog'
import { synchronizeWidgetsForBackup } from './WidgetSyncController'
import { isAndroidNative } from '../lib/appUpdate'
import { backupSource, openNativeBackup, saveBackupFile } from '../lib/backupFile'
import { assertNoActiveTimers, backupFileName, backupFingerprint, backupSummary, BackupRecoveryRequiredError, createBackup, importBackup, MAX_BACKUP_BYTES, parseBackup, previousBackup, serializeBackup, type Backup } from '../lib/backup'
import './DataBackupCard.css'

export function DataBackupCard() {
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState(() => {
    try { return sessionStorage.getItem('money-dance.backup-notice') || '' } catch { return '' }
  })
  useEffect(() => { try { sessionStorage.removeItem('money-dance.backup-notice') } catch { /* optional notice */ } }, [])
  const [preview, setPreview] = useState<{ backup: Backup; fingerprint: string } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [hasPrevious] = useState(() => { try { return !!previousBackup() } catch { return false } })
  const attempt = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await action() } catch (e) {
      if (e instanceof BackupRecoveryRequiredError) { window.location.reload(); return }
      setError(e instanceof Error ? e.message : '操作失败，请重试。')
    }
    finally { setBusy(false) }
  }
  const download = async (backup: Backup, prefix?: string) => {
    const result = await saveBackupFile(serializeBackup(backup), backupFileName(backup, prefix))
    setMessage(result === 'saved' ? '备份已保存，可以将文件传到另一台设备导入。' : result === 'download' ? '已发起备份下载，请在下载列表中确认文件已保存。' : '已取消保存，数据没有变化。')
  }
  const select = async (text: string) => {
    const backup = parseBackup(text)
    await synchronizeWidgetsForBackup()
    assertNoActiveTimers()
    setPreview({ backup, fingerprint: backupFingerprint() }); setConfirmed(false)
  }
  const choose = () => {
    setPreview(null); setConfirmed(false); setError('')
    if (isAndroidNative()) void attempt(async () => { const text = await openNativeBackup(); if (text !== null) await select(text) })
    else file.current?.click()
  }
  const commit = () => {
    setDialog(false)
    if (!preview || !confirmed) return
    void attempt(async () => {
      await synchronizeWidgetsForBackup()
      importBackup(preview.backup, preview.fingerprint, localStorage, backupSource())
      try { sessionStorage.setItem('money-dance.backup-notice', '导入完成，已保留导入前备份。未执行的计时预约已取消，可按需重新设置。') } catch { /* data already committed */ }
      window.location.reload()
    })
  }
  return <section className="data-backup-card" aria-labelledby="backup-title" aria-busy={busy}>
    <div className="data-backup-heading"><span><DatabaseBackup size={22}/></span><div><h2 id="backup-title">数据备份与迁移</h2><p>把这些日子的积累，带到另一台设备。</p></div></div>
    <p>网页、安卓和桌面端通用。包含工资与历史规则、工作旅程、排班、出勤、账本、心愿、物品、摸鱼与加班记录、成就和主题。</p>
    <div className="data-backup-actions">
      <Button disabled={busy} onClick={() => void attempt(async () => { await synchronizeWidgetsForBackup(); await download(createBackup(backupSource())) })}><Download size={16}/>导出备份</Button>
      <Button disabled={busy} variant="secondary" onClick={choose}><Upload size={16}/>选择备份导入</Button>
      {hasPrevious && <Button disabled={busy} variant="ghost" onClick={() => void attempt(async () => { const backup = previousBackup(); if (backup) await download(backup, 'MoneyDance导入前备份') })}>导出导入前备份</Button>}
    </div>
    <input ref={file} type="file" accept=".json,application/json" aria-label="选择 MoneyDance 备份文件" hidden onChange={event => {
      const selected = event.target.files?.[0]; event.target.value = ''
      if (selected) void attempt(async () => {
        if (selected.size > MAX_BACKUP_BYTES) throw new Error('文件超过 8 MB，无法导入。')
        await select(await selected.text())
      })
    }}/>
    <p className="data-backup-hint">导出的是已保存的数据，请先保存设置并结束正在进行的计时。文件包含工资等个人信息，请妥善保存。桌宠素材、开机启动及系统权限不随此文件迁移。</p>
    {preview && <div className="data-backup-preview">
      <h3>确认要带过来的数据</h3>
      <p>{({ web: '网页端', android: '安卓端', desktop: '桌面端' })[preview.backup.source]} · {new Date(preview.backup.exportedAt).toLocaleString()}</p>
      <div className="data-backup-counts">{backupSummary(preview.backup).map(item => <div key={item.label}><b>{item.count}</b><span>{item.label}</span></div>)}</div>
      <p>导入会替换本机业务数据，不会与现有记录合并。会先保留一份本机备份；尚未执行的计时预约将取消，避免在两台设备重复开始。</p>
      <label className="data-backup-confirm"><Checkbox checked={confirmed} onCheckedChange={setConfirmed} ariaLabel="确认用备份替换本机数据"/><span>我已核对备份，确认替换本机数据，并关闭其他正在使用的 MoneyDance 页面。</span></label>
      <div className="data-backup-actions"><Button disabled={busy || !confirmed} onClick={() => setDialog(true)}>确认导入并刷新</Button><Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>取消</Button></div>
    </div>}
    {busy && <p role="status">正在处理，请稍候…</p>}
    {message && <p className="data-backup-message" role="status">{message}</p>}
    {error && <p className="data-backup-error" role="alert">{error}</p>}
    <ConfirmDialog open={dialog} title="用这份备份替换本机数据？" message="原数据会先保留为导入前备份。完成后页面将刷新，使用导入的工资、记录和设置。" confirmLabel="确认替换" cancelLabel="再核对一下" onConfirm={commit} onCancel={() => setDialog(false)}/>
  </section>
}
