import { useEffect, useState } from 'react'
import { checkForAndroidUpdate, installAndroidRelease, isAndroidNative, type AndroidRelease } from '../lib/appUpdate'
import { ConfirmDialog } from './ConfirmDialog'

const LAST_CHECK_KEY = 'money-dance:last-android-update-check'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export function AppUpdatePrompt() {
  const [release, setRelease] = useState<AndroidRelease | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!isAndroidNative()) return
    const lastCheck = Number(localStorage.getItem(LAST_CHECK_KEY) || 0)
    if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()))

    checkForAndroidUpdate().then(result => {
      if (result?.hasUpdate && result.latest) {
        setRelease(result.latest)
        setOpen(true)
      }
    }).catch(() => undefined)
  }, [])

  const update = async () => {
    if (!release) return
    setOpen(false)
    try {
      const result = await installAndroidRelease(release)
      if (result.status === 'permission_required') {
        window.alert('请在系统设置中开启“允许来自此来源”，返回 Money Dance 后到“我的 → 应用更新”再次点击更新。')
      } else {
        window.alert('新版 APK 已开始下载。下载完成后 Android 会弹出系统安装确认。')
      }
    } catch {
      window.alert('启动更新失败，请稍后到“我的 → 应用更新”重试。')
    }
  }

  return <ConfirmDialog
    open={open}
    title="Money Dance 有新版"
    message={release ? `${release.tag} 已经发布。可以现在下载，安装时 Android 会再让你确认一次。` : undefined}
    confirmLabel="立即更新"
    cancelLabel="稍后"
    onConfirm={update}
    onCancel={() => setOpen(false)}
  />
}
