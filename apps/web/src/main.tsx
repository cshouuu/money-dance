import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './mobile.css'

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>)

const isNativeShell = 'Capacitor' in window
if ('serviceWorker' in navigator && !isNativeShell && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
