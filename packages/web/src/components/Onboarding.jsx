import { useState, useEffect, useCallback } from 'react'
import useStore from '../stores/useStore'
import Tooltip from './Tooltip'

/**
 * Onboarding flow for DiscoWorld.
 *
 * Steps:
 *   1. "vibe" — Welcome screen with Login / Just explore
 *   2. "exploring" — Camera flies to genre, samples auto-play
 *   3. "tooltip" — After first genre click, contextual hint
 *   4. "discogs" — After 3 genre interactions, optional Discogs import
 *   5. "complete" — Full UI visible
 */
export default function Onboarding() {
  const onboardingStep = useStore(s => s.onboardingStep)
  const completeOnboarding = useStore(s => s.completeOnboarding)
  const advanceOnboarding = useStore(s => s.advanceOnboarding)
  const setShowYoyakuLogin = useStore(s => s.setShowYoyakuLogin)

  const [showDiscogsDismissed, setShowDiscogsDismissed] = useState(false)

  // 2-minute timer for auto-completing onboarding
  useEffect(() => {
    if (onboardingStep === 'vibe' || onboardingStep === 'complete') return
    const timer = setTimeout(() => {
      completeOnboarding()
    }, 2 * 60 * 1000)
    return () => clearTimeout(timer)
  }, [onboardingStep, completeOnboarding])

  const handleLogin = useCallback(() => {
    completeOnboarding()
    setShowYoyakuLogin(true)
  }, [completeOnboarding, setShowYoyakuLogin])

  const handleSkip = useCallback(() => {
    completeOnboarding()
  }, [completeOnboarding])

  // Esc key on the welcome screen dismisses onboarding (a11y)
  useEffect(() => {
    if (onboardingStep !== 'vibe') return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleSkip()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onboardingStep, handleSkip])

  // Step 1: Welcome screen
  if (onboardingStep === 'vibe') {
    return (
      <div className="onboarding-backdrop onboarding-vibe" role="dialog" aria-label="Welcome to DiscoWorld" aria-modal="true">
        <div className="onboarding-vibe-container">
          <h1 className="onboarding-vibe-title">Welcome to DiscoWorld</h1>
          <p className="onboarding-vibe-subtitle">
            4.8M electronic music releases on a 3D planet
          </p>

          <div className="onboarding-actions" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', marginTop: '32px' }}>
            <button
              className="onboarding-login-btn"
              onClick={handleLogin}
              aria-label="Login to your account"
            >
              Login
            </button>
            <button className="onboarding-skip-link" onClick={handleSkip} aria-label="Skip and explore freely">
              Just explore
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: Tooltip hint after first genre click
  if (onboardingStep === 'tooltip') {
    return (
      <Tooltip
        visible={true}
        text="Click genres to explore. Press R to discover something random."
        position={{ top: '50%', left: '50%' }}
        placement="bottom"
        onDismiss={() => advanceOnboarding()}
        autoDismiss={5000}
      />
    )
  }

  // Step 3: Discogs import prompt
  if (onboardingStep === 'discogs' && !showDiscogsDismissed) {
    return (
      <div className="onboarding-discogs-prompt" role="dialog" aria-label="Import Discogs collection">
        <p>Got a Discogs collection? Bring your crates in.</p>
        <div className="onboarding-discogs-actions">
          <button
            className="onboarding-discogs-btn"
            onClick={() => {
              useStore.setState({ passportOpen: true })
              completeOnboarding()
            }}
          >
            Connect Discogs
          </button>
          <button
            className="onboarding-discogs-dismiss"
            onClick={() => {
              setShowDiscogsDismissed(true)
              completeOnboarding()
            }}
          >
            Maybe later
          </button>
        </div>
      </div>
    )
  }

  // Complete or returning user — render nothing
  return null
}
