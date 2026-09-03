import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { registerMoneyDanceServiceWorker } from './lib/serviceWorker'
import './styles.css'
import './mobile.css'

const rootElement = document.getElementById('root')!

function BootSignal() {
  useEffect(() => {
    const bootWindow = window as Window & { __MONEY_DANCE_BOOTED__?: boolean }
    bootWindow.__MONEY_DANCE_BOOTED__ = true
    window.dispatchEvent(new Event('money-dance:booted'))
  }, [])
  return null
}

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
      <BootSignal />
    </AppErrorBoundary>
  </StrictMode>,
)

const isNativeShell = 'Capacitor' in window
const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
if ('serviceWorker' in navigator && !isNativeShell && !isLocalDev) {
  const register = () => registerMoneyDanceServiceWorker().catch(() => undefined)
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
