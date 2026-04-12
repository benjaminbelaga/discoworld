import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary'
import { registerSW } from 'virtual:pwa-register'

// Stash the last unhandled error on window so prod crashes are diagnosable
// without source maps. Future ops can read `window.__lastError` in DevTools.
window.addEventListener('error', (e) => {
  window.__lastError = { message: e.message, stack: e.error?.stack, filename: e.filename, lineno: e.lineno }
})
window.addEventListener('unhandledrejection', (e) => {
  window.__lastUnhandledRejection = { reason: String(e.reason), stack: e.reason?.stack }
})

// Register service worker with auto-update + user-visible update banner.
// Without onNeedRefresh, returning users stay on stale JS until hard-reload.
const updateSW = registerSW({
  onRegisteredSW(_swUrl, r) {
    if (r) {
      r.update()
      setInterval(() => { r.update() }, 60 * 60 * 1000)
    }
  },
  onNeedRefresh() {
    if (document.getElementById('dw-update-banner')) return
    const banner = document.createElement('div')
    banner.id = 'dw-update-banner'
    banner.style.cssText = [
      'position:fixed','left:50%','top:16px','transform:translateX(-50%)',
      'background:rgba(10,10,20,0.95)','backdrop-filter:blur(16px)',
      '-webkit-backdrop-filter:blur(16px)','border:1px solid rgba(102,204,255,0.3)',
      'border-radius:10px','padding:10px 14px','display:flex','align-items:center',
      'gap:12px','z-index:9999','box-shadow:0 6px 24px rgba(0,0,0,0.5)',
      "font-family:'JetBrains Mono', monospace",'font-size:12px'
    ].join(';')
    const label = document.createElement('span')
    label.style.color = 'rgba(255,255,255,0.85)'
    label.textContent = 'New version available'
    const btn = document.createElement('button')
    btn.style.cssText = 'background:rgba(102,204,255,0.15);border:1px solid rgba(102,204,255,0.45);border-radius:6px;color:#66ccff;padding:4px 12px;font:inherit;cursor:pointer;'
    btn.textContent = 'Reload'
    btn.addEventListener('click', () => updateSW(true))
    banner.appendChild(label)
    banner.appendChild(btn)
    document.body.appendChild(banner)
  },
  onOfflineReady() {
    console.log('[DiscoWorld] Ready to work offline')
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary name="Root">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
