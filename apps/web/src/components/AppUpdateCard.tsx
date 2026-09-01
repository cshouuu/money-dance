import { ExternalLink, RefreshCw, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  checkForAndroidUpdate,
  formatAndroidUpdateError,
  getInstalledAppVersion,
  isAndroidNative,
  openPgyerReleasePage,
  type AndroidRelease,
  type InstalledAppVersion,
} from '../lib/appUpdate'
import './AppUpdate.css'

type UpdateStatus = 'idle' | 'checking' | 'latest' | 'available' | 'opening' | 'error'

export function AppUpdateCard() {
  const [visible] = useState(() => isAndroidNative())
  const [current, setCurrent] = useState<InstalledAppVersion | null>(null)
  const [latest, setLatest] = useState<AndroidRelease | null>(null)
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!visible) return
    getInstalledAppVersion().then(setCurrent).catch(() => {
      setStatus('error')
      setMessage('读取当前版本失败，请重启应用后重试。')
    })
  }, [visible])

  if (!visible) return null

  const check = async () => {
    setStatus('checking')
    setMessage('')
    try {
      const result = await checkForAndroidUpdate()
      if (!result) return
      setCurrent(result.current)
      setLatest(result.latest)
      if (!result.latest) {
        setStatus('latest')
        setMessage('目前还没有正式 Android Release。')
      } else if (result.hasUpdate) {
        setStatus('available')
        setMessage(`发现新版本 ${result.latest.tag}`)
      } else {
        setStatus('latest')
        setMessage('已经是最新版本。')
      }
    } catch (error) {
      setStatus('error')
      setMessage(formatAndroidUpdateError(error))
    }
  }

  const openPgyer = async () => {
    setMessage('')
    try {
      await openPgyerReleasePage()
      setStatus('opening')
      setMessage('已打开蒲公英下载页，请在页面中点击安装。')
    } catch {
      setStatus('error')
      setMessage('无法打开蒲公英下载页，请稍后重试。')
    }
  }

  return <section className="app-update-card">
    <div className="app-update-head">
      <div className="app-update-icon"><Smartphone size={19}/></div>
      <div><small>ANDROID APP</small><h3>应用更新</h3></div>
      {current && <span className="version-chip">v{current.versionName}</span>}
    </div>
    <p>通过蒲公英检查并下载新版 APK。安装时仍会由 Android 系统要求你最终确认。</p>
    {latest && status === 'available' && <div className="update-version-row"><span>当前 v{current?.versionName}</span><b>→</b><span>最新 {latest.tag}</span></div>}
    {message && <div className={`update-message ${status}`}>{message}</div>}
    <div className="app-update-actions">
      <button type="button" className="secondary-button" onClick={check} disabled={status === 'checking'}>
        <RefreshCw size={16} className={status === 'checking' ? 'spin' : ''}/>{status === 'checking' ? '检查中…' : '检查更新'}
      </button>
      {latest && status === 'available' && <button type="button" className="primary-button update-now" onClick={openPgyer}><ExternalLink size={16}/>前往蒲公英更新</button>}
      {status === 'error' && <button type="button" className="primary-button update-now" onClick={openPgyer}><ExternalLink size={16}/>打开蒲公英</button>}
    </div>
  </section>
}
