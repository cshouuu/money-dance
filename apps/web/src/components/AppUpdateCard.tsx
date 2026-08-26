import { Download, RefreshCw, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  checkForAndroidUpdate,
  getInstalledAppVersion,
  installAndroidRelease,
  isAndroidNative,
  type AndroidRelease,
  type InstalledAppVersion,
} from '../lib/appUpdate'
import './AppUpdate.css'

type UpdateStatus = 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'permission' | 'error'

export function AppUpdateCard() {
  const [visible] = useState(() => isAndroidNative())
  const [current, setCurrent] = useState<InstalledAppVersion | null>(null)
  const [latest, setLatest] = useState<AndroidRelease | null>(null)
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!visible) return
    getInstalledAppVersion().then(setCurrent).catch(() => setStatus('error'))
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
    } catch {
      setStatus('error')
      setMessage('检查更新失败，请稍后再试。')
    }
  }

  const update = async () => {
    if (!latest) return
    setMessage('')
    try {
      const result = await installAndroidRelease(latest)
      if (result.status === 'permission_required') {
        setStatus('permission')
        setMessage('已打开系统设置。请开启“允许来自此来源”，返回 Money Dance 后再点一次立即更新。')
      } else {
        setStatus('downloading')
        setMessage('新版 APK 正在后台下载。下载完成后 Android 会弹出系统安装确认。')
      }
    } catch {
      setStatus('error')
      setMessage('启动更新失败，请稍后重试。')
    }
  }

  return <section className="app-update-card">
    <div className="app-update-head">
      <div className="app-update-icon"><Smartphone size={19}/></div>
      <div><small>ANDROID APP</small><h3>应用更新</h3></div>
      {current && <span className="version-chip">v{current.versionName}</span>}
    </div>
    <p>从 GitHub Releases 检查新版，并在应用内下载 APK。安装时仍会由 Android 系统要求你最终确认。</p>
    {latest && status === 'available' && <div className="update-version-row"><span>当前 v{current?.versionName}</span><b>→</b><span>最新 {latest.tag}</span></div>}
    {message && <div className={`update-message ${status}`}>{message}</div>}
    <div className="app-update-actions">
      <button type="button" className="secondary-button" onClick={check} disabled={status === 'checking'}>
        <RefreshCw size={16} className={status === 'checking' ? 'spin' : ''}/>{status === 'checking' ? '检查中…' : '检查更新'}
      </button>
      {latest && status === 'available' && <button type="button" className="primary-button update-now" onClick={update}><Download size={16}/>立即更新</button>}
      {latest && (status === 'permission' || status === 'error') && <button type="button" className="primary-button update-now" onClick={update}><Download size={16}/>重新尝试</button>}
    </div>
  </section>
}
