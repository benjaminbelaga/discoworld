import { useState } from 'react'
import { initiateLogin } from '../lib/discogsApi'

export default function YoyakuLogin({ onClose }) {
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState(null)

  const handleDiscogs = async () => {
    const callbackUrl = `${window.location.origin}/auth/callback`
    await initiateLogin(callbackUrl)
    // initiateLogin redirects — nothing to do after
  }

  const handleYoyaku = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Login failed')
      }
      const data = await res.json()
      localStorage.setItem('yoyaku-session', JSON.stringify(data))
      setSession(data)
    } catch (err) {
      setError(
        err instanceof TypeError || err.message === 'Failed to fetch'
          ? 'Login service is currently unavailable'
          : err.message
      )
    } finally {
      setLoading(false)
    }
  }

  if (session) {
    const initials = (session.name || session.email || '?').charAt(0).toUpperCase()
    return (
      <div className="yl-panel">
        <button className="yl-close" onClick={onClose}>&times;</button>
        <div className="yl-success">
          <div className="yl-avatar">{initials}</div>
          <h3>{session.name || session.email}</h3>
          {session.tier && <div className="yl-tier">{session.tier}</div>}
          {(session.orders != null || session.collection != null) && (
            <div className="yl-stats">
              {session.orders != null && <span>{session.orders} orders</span>}
              {session.collection != null && <span>{session.collection} collected</span>}
            </div>
          )}
          {session.genres && session.genres.length > 0 && (
            <div className="yl-genres">
              {session.genres.map((g) => (
                <span key={g} className="yl-genre-tag">{g}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="yl-panel">
      <button className="yl-close" onClick={onClose}>&times;</button>

      <div className="yl-logo">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="15" stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>
          <circle cx="16" cy="16" r="11" stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>
          <circle cx="16" cy="16" r="7" stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>
          <circle cx="16" cy="16" r="3" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
          <circle cx="16" cy="16" r="1.5" fill="rgba(255,255,255,0.3)"/>
        </svg>
      </div>

      <h2 className="yl-title">Connect</h2>
      <p className="yl-subtitle">Unlock your collection &amp; recommendations</p>

      {/* Primary: Discogs OAuth */}
      <button className="yl-btn yl-btn-discogs" onClick={handleDiscogs}>
        <svg className="yl-btn-icon" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="11" opacity="0.15"/>
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="12" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="12" cy="12" r="0.8" fill="currentColor"/>
        </svg>
        Continue with Discogs
      </button>

      {/* Secondary: YOYAKU */}
      <button className="yl-btn yl-btn-yoyaku" onClick={() => setShowEmailForm(v => !v)}>
        <svg className="yl-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        Continue with YOYAKU
        <span className="yl-btn-chevron">{showEmailForm ? '▲' : '▼'}</span>
      </button>

      {showEmailForm && (
        <form className="yl-email-form" onSubmit={handleYoyaku}>
          <input
            className="yl-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            className="yl-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="yl-error">{error}</div>}
          <button className="yl-submit" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}

      <div className="yl-footer">
        <a href="https://yoyaku.io/my-account/" target="_blank" rel="noopener noreferrer">
          Create YOYAKU account
        </a>
      </div>
    </div>
  )
}
