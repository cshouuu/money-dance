import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
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

createRoot(rootElement).render(<StrictMode><App/><BootSignal/></StrictMode>)

const isNativeShell = 'Capacitor' in window
const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
if ('serviceWorker' in navigator && !isNativeShell && !isLocalDev) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(() => undefined)
  })
}
