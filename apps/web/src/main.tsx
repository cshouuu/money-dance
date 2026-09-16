import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './mobile.css'
import { IMPORT_EVENT_KEY, recoverInterruptedImport } from './lib/backup'
import { initializeTheme } from './components/theme'

const rootElement = document.getElementById('root')!

function BootSignal() {
  useEffect(() => {
    const bootWindow = window as Window & { __MONEY_DANCE_BOOTED__?: boolean }
    bootWindow.__MONEY_DANCE_BOOTED__ = true
    window.dispatchEvent(new Event('money-dance:booted'))
  }, [])
  return null
}

// Restore an interrupted multi-key import before any controller can read or
// update business records. A failed recovery must not boot on partial data.
try {
  if (recoverInterruptedImport()) {
    initializeTheme()
    try { sessionStorage.setItem('money-dance.backup-notice', '上次导入未完成，已恢复导入前的数据。') } catch { /* recovery succeeded */ }
  }
  createRoot(rootElement).render(<StrictMode><App/><BootSignal/></StrictMode>)
} catch (error) {
  rootElement.textContent = error instanceof Error ? error.message : '数据恢复失败，请重新打开应用，勿清除应用数据。'
  const retry = document.createElement('button')
  retry.type = 'button'; retry.textContent = '重新尝试恢复'
  retry.addEventListener('click', () => window.location.reload())
  rootElement.append(document.createElement('br'), retry)
  // This is a data-recovery screen, not a missing-script/cache failure.
  ;(window as Window & { __MONEY_DANCE_BOOTED__?: boolean }).__MONEY_DANCE_BOOTED__ = true
  window.dispatchEvent(new Event('money-dance:booted'))
}
window.addEventListener('storage', event => { if (event.key === IMPORT_EVENT_KEY && event.newValue) window.location.reload() })

const isNativeShell = 'Capacitor' in window || 'moneyDanceDesktop' in window
const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
if ('serviceWorker' in navigator && !isNativeShell && !isLocalDev) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(() => undefined)
  })
}
