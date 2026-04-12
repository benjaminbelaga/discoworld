import { lazy, Suspense, useEffect, useRef, useState, useCallback } from 'react'
import { handleCallback } from './lib/discogsApi'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, AdaptiveDpr, Preload } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import useStore from './stores/useStore'
// import useAudioStore from './stores/useAudioStore' // Disabled — soundscape system off
import useIsMobile from './hooks/useIsMobile'
import useUrlState from './hooks/useUrlState'
import GenreWorld from './components/GenreWorld'
import GenrePanel from './components/GenrePanel'
import Timeline from './components/Timeline'
import FilterBar from './components/FilterBar'
import Header from './components/Header'
import Stars from './components/Stars'
import ReleaseParticles from './components/ReleaseParticles'
import MusicPlayer from './components/MusicPlayer'
import ExploreButton from './components/ExploreButton'
import ShortcutHelp from './components/ShortcutHelp'
import Onboarding from './components/Onboarding'
const EarthGlobe = lazy(() => import('./components/EarthGlobe'))
const GenrePlanet = lazy(() => import('./components/GenrePlanet'))
import ViewTransition from './components/ViewTransition'
import ViewSwitch from './components/ViewSwitch'
import CityPanel from './components/CityPanel'
import Minimap from './components/Minimap'
import LayerControls from './components/LayerControls'
import CollectionPassport from './components/CollectionPassport'
import TasteTopology from './components/TasteTopology'
import RecommendationPanel from './components/RecommendationPanel'
import DriftMode from './components/DriftMode'
// import StrudelPlayer from './components/StrudelPlayer' // Disabled — needs polish, see ROADMAP
import InstallPrompt from './components/InstallPrompt'
import DigPathPanel from './components/DigPathPanel'
import { pathFromUrl } from './lib/pathSerializer'
import { LabelConstellationOverlay } from './components/LabelConstellation'
import { ArtistThreadPanel } from './components/ArtistThread'
import ErrorBoundary from './components/ErrorBoundary'
// import { setBiome, stopSoundscape } from './lib/soundscape' // Disabled — soundscape system off

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="title">DiscoWorld</div>
      <div className="subtitle">non-linear musical exploration</div>
      <div style={{ display: 'flex', gap: 24, marginTop: 16, opacity: 0.3, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
        <span>4.8M releases</span>
        <span>166 genres</span>
        <span>607 styles</span>
        <span>50 years</span>
      </div>
      <div className="loading-bar" style={{ marginTop: 24 }}>
        <div className="loading-bar-fill" />
      </div>
    </div>
  )
}

// Smooth camera fly-to that works WITH OrbitControls
function CameraAnimator({ controlsRef }) {
  const cameraTarget = useStore(s => s.cameraTarget)
  const { camera } = useThree()
  const animating = useRef(false)
  const targetPos = useRef(new THREE.Vector3())
  const targetLook = useRef(new THREE.Vector3())
  const progress = useRef(0)
  const startPos = useRef(new THREE.Vector3())
  const startLook = useRef(new THREE.Vector3())

  useEffect(() => {
    if (!cameraTarget) {
      animating.current = false
      return
    }
    const g = cameraTarget
    // Reset to default home position
    if (g._reset) {
      targetPos.current.set(0, 40, 60)
      targetLook.current.set(0, 0, 0)
    } else {
      const dist = Math.max(14, g.size * 5)
      // Camera offset: above and slightly angled
      const dx = g.x > 0 ? -1 : 1
      targetPos.current.set(
        g.x + dx * dist * 0.4,
        g.y + dist * 0.6,
        g.z + dist * 0.7
      )
      targetLook.current.set(g.x, g.y, g.z)
    }
    startPos.current.copy(camera.position)
    if (controlsRef.current) {
      startLook.current.copy(controlsRef.current.target)
    }
    progress.current = 0
    animating.current = true
  }, [cameraTarget, camera, controlsRef])

  useFrame((_, delta) => {
    if (!animating.current || !controlsRef.current) return

    progress.current = Math.min(1, progress.current + delta * 0.8)
    // Smooth ease-in-out
    const t = progress.current < 0.5
      ? 4 * progress.current * progress.current * progress.current
      : 1 - Math.pow(-2 * progress.current + 2, 3) / 2

    camera.position.lerpVectors(startPos.current, targetPos.current, t)
    controlsRef.current.target.lerpVectors(startLook.current, targetLook.current, t)
    controlsRef.current.update()

    if (progress.current >= 1) {
      animating.current = false
    }
  })

  return null
}

// Bloom — static values (soundscape audio-reactivity disabled)
function AudioReactiveBloom() {
  return (
    <EffectComposer>
      <Bloom
        luminanceThreshold={0.35}
        luminanceSmoothing={0.5}
        intensity={0.5}
        mipmapBlur
      />
    </EffectComposer>
  )
}

function Scene({ isMobile }) {
  const controlsRef = useRef()

  return (
    <>
      {/* Nebula-dusk palette (no pitch black) + extended fog far for peripheral genre visibility */}
      <color attach="background" args={['#0e1220']} />
      <fog attach="fog" args={['#141826', 180, 500]} />
      <ambientLight intensity={0.5} color="#8888cc" />
      {/* Main overhead light — cooler blue */}
      <pointLight position={[0, 50, 0]} intensity={0.8} color="#4466ff" />
      {/* Warm accent from side */}
      <pointLight position={[30, 20, -30]} intensity={0.4} color="#ff6644" />
      {/* Rim light from behind camera — subtle fill */}
      <directionalLight position={[0, 10, 60]} intensity={0.15} color="#8899cc" />
      {/* Low fill from below for depth */}
      <pointLight position={[0, -10, 0]} intensity={0.08} color="#221133" />

      <Stars count={isMobile ? 500 : 3000} />
      <ReleaseParticles maxCount={isMobile ? 500 : undefined} />
      <GenreWorld />

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.03}
        minDistance={5}
        maxDistance={120}
        maxPolarAngle={Math.PI * 0.85}
        target={[0, 0, 0]}
        rotateSpeed={0.7}
        zoomSpeed={0.8}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
      />

      <CameraAnimator controlsRef={controlsRef} />
      {!isMobile && <AudioReactiveBloom />}

      <AdaptiveDpr pixelated />
      <Preload all />
    </>
  )
}

// Progressive disclosure: hide UI elements until onboarding advances
// Phase 1 (after genre select): 3D world + genre panel only
// Phase 2 (after 30s or 3 interactions): timeline, filter bar, view switch
// Phase 3 (after Discogs import or 2min): everything
function useProgressiveUI() {
  const step = useStore(s => s.onboardingStep)
  const interactions = useStore(s => s.onboardingInteractions)
  const advanceOnboarding = useStore(s => s.advanceOnboarding)
  const [minimapVisible, setMinimapVisible] = useState(step === 'complete')
  const [midUIVisible, setMidUIVisible] = useState(step === 'complete')
  const hasMoved = useRef(false)
  const prevGenreRef = useRef(null)

  // Sync visibility when step changes to 'complete'
  if (step === 'complete' && !minimapVisible) {
    setMinimapVisible(true)
  }
  if (step === 'complete' && !midUIVisible) {
    setMidUIVisible(true)
  }

  // Phase 2: show mid-tier UI after 30s or 3 interactions
  useEffect(() => {
    if (midUIVisible || step === 'vibe') return
    if (interactions >= 3) {
      setMidUIVisible(true)
      return
    }
    const timer = setTimeout(() => setMidUIVisible(true), 30 * 1000)
    return () => clearTimeout(timer)
  }, [step, interactions, midUIVisible])

  // Detect first manual camera movement to show minimap
  useEffect(() => {
    if (step === 'complete' || hasMoved.current) return
    const handler = (e) => {
      if (e.target?.closest('canvas') || e.target?.closest('.earth-globe-container')) {
        hasMoved.current = true
        setMinimapVisible(true)
      }
    }
    window.addEventListener('mousedown', handler)
    window.addEventListener('wheel', handler)
    window.addEventListener('touchstart', handler)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('wheel', handler)
      window.removeEventListener('touchstart', handler)
    }
  }, [step])

  // Track genre interactions for progressive disclosure
  useEffect(() => {
    if (step === 'complete') return
    const unsub = useStore.subscribe((state) => {
      if (state.activeGenre && state.activeGenre !== prevGenreRef.current) {
        prevGenreRef.current = state.activeGenre
        advanceOnboarding()
      }
    })
    return unsub
  }, [step, advanceOnboarding])

  const isFullUI = step === 'complete'
  const isVibe = step === 'vibe'

  return { isFullUI, isVibe, midUIVisible, minimapVisible }
}

export default function App() {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)

  // Handle Discogs OAuth callback redirect (/auth/callback?session_token=...)
  useEffect(() => {
    if (window.location.pathname === '/auth/callback') {
      const params = new URLSearchParams(window.location.search)
      handleCallback(params)
      // Replace URL so refresh doesn't re-trigger
      window.history.replaceState({}, '', '/')
    }
  }, [])
  const setGenres = useStore(s => s.setGenres)
  const setReleases = useStore(s => s.setReleases)
  const setLinks = useStore(s => s.setLinks)
  const setCitiesData = useStore(s => s.setCitiesData)
  const viewMode = useStore(s => s.viewMode)
  const { isFullUI, isVibe, midUIVisible, minimapVisible } = useProgressiveUI()
  const isMobile = useIsMobile()
  useUrlState()

  // Live region for screen reader announcements (genre changes, view switches)
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    const unsub = useStore.subscribe((state, prev) => {
      if (state.activeGenre && state.activeGenre !== prev.activeGenre) {
        setAnnouncement(`Now exploring ${state.activeGenre.name}, ${state.activeGenre.scene || 'electronic music'}`)
      }
      if (state.viewMode !== prev.viewMode) {
        setAnnouncement(`Switched to ${state.viewMode} view`)
      }
    })
    return unsub
  }, [])

  // Soundscape disabled — re-enable by uncommenting this block + imports at top
  // useEffect(() => {
  //   const unsub = useStore.subscribe((state, prev) => {
  //     if (state.activeGenre && state.activeGenre !== prev.activeGenre) {
  //       const biome = state.activeGenre.biome || 'unknown'
  //       setBiome(biome)
  //     }
  //     if (!state.activeGenre && prev.activeGenre) {
  //       stopSoundscape()
  //     }
  //   })
  //   return () => { unsub(); stopSoundscape() }
  // }, [])

  useEffect(() => {
    Promise.all([
      fetch('/data/world.json').then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      }),
      fetch('/data/cities.json').then(r => r.ok ? r.json() : { cities: [] }).catch(() => ({ cities: [] }))
    ])
      .then(([data, citiesJson]) => {
        setGenres(data.genres)
        setReleases(data.tracks)
        setLinks(data.links)
        setCitiesData(citiesJson.cities || [])
        setTimeout(() => setLoaded(true), 500)
      })
      .catch(err => setError(err.message || 'Failed to load data'))
  }, [setGenres, setReleases, setLinks, setCitiesData])

  // Load dig path from URL hash on startup
  useEffect(() => {
    if (!loaded) return
    const path = pathFromUrl()
    if (path) {
      useStore.getState().loadDigPath(path)
    }
  }, [loaded])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Ignore if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      const state = useStore.getState()

      switch (e.key) {
        case ' ':
          e.preventDefault()
          useStore.setState({ autoTour: !state.autoTour })
          break
        case 'Escape':
          useStore.setState({ activeGenre: null, cameraTarget: null, selectedCity: null, activeLabel: null, activeArtist: null })
          break
        case 'e':
        case 'r':
        case 'E':
        case 'R': {
          const { genres, year, setActiveGenre, setCameraTarget } = state
          const visible = genres.filter(g => g.year <= year)
          if (visible.length) {
            const random = visible[Math.floor(Math.random() * visible.length)]
            setActiveGenre(random)
            setCameraTarget(random)
          }
          break
        }
        case 'ArrowLeft': {
          e.preventDefault()
          const step = e.shiftKey ? 10 : 1
          useStore.setState({ year: Math.max(1960, state.year - step) })
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          const step = e.shiftKey ? 10 : 1
          useStore.setState({ year: Math.min(2026, state.year + step) })
          break
        }
        case 'g':
        case 'G': {
          const modes = ['genre', 'earth', 'planet']
          const idx = modes.indexOf(state.viewMode)
          useStore.setState({ viewMode: modes[(idx + 1) % modes.length] })
          break
        }
        case '1':
          useStore.setState({ viewMode: 'genre' })
          break
        case '2':
          useStore.setState({ viewMode: 'earth' })
          break
        case '3':
          useStore.setState({ viewMode: 'planet' })
          break
        case 'p':
        case 'P':
          // Toggle dig path recording mode
          if (state.digPathMode) {
            useStore.setState({ digPathMode: null })
          } else {
            useStore.setState({ digPathMode: 'record' })
          }
          break
        // '?' is handled by ShortcutHelp component
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (error) return (
    <div className="loading-screen">
      <div className="title">DiscoWorld</div>
      <div style={{ color: '#ff6b6b', marginTop: 16, fontSize: 14 }}>
        Failed to load: {error}
      </div>
      <button
        onClick={() => { setError(null); window.location.reload() }}
        style={{ marginTop: 16, padding: '8px 20px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13 }}
      >
        Retry
      </button>
    </div>
  )

  if (!loaded) return <LoadingScreen />

  return (
    <div role="application" aria-label="DiscoWorld — interactive music genre explorer">
      {/* Skip to content link for keyboard users */}
      <a
        href="#discoworld-main"
        className="skip-to-content"
      >
        Skip to content
      </a>

      {/* Live region for screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" role="status">
        {announcement}
      </div>

      <ViewTransition>
        {/* R3F Canvas — always mounted, hidden when not in genre view to preserve event handlers */}
        <div style={{ display: viewMode === 'genre' ? 'block' : 'none', position: 'absolute', inset: 0 }}>
          <ErrorBoundary name="Canvas">
            <Canvas
              camera={{ position: [0, 50, 85], fov: 50, near: 0.1, far: 500 }}
              dpr={isMobile ? [1, 1.5] : [1, 2]}
              gl={{ antialias: !isMobile, alpha: false }}
              frameloop={viewMode === 'genre' ? 'always' : 'never'}
              onCreated={({ gl }) => {
                gl.domElement.addEventListener('webglcontextlost', (e) => {
                  e.preventDefault()
                  console.warn('WebGL context lost, attempting recovery...')
                })
              }}
            >
              <Suspense fallback={null}>
                <Scene isMobile={isMobile} />
              </Suspense>
            </Canvas>
          </ErrorBoundary>
        </div>
        <Suspense fallback={null}>
          {viewMode === 'earth' && (
            <ErrorBoundary name="EarthGlobe">
              <EarthGlobe paused={false} />
            </ErrorBoundary>
          )}
        </Suspense>
        <Suspense fallback={null}>
          {viewMode === 'planet' && (
            <ErrorBoundary name="GenrePlanet">
              <GenrePlanet paused={false} />
            </ErrorBoundary>
          )}
        </Suspense>
      </ViewTransition>

      {/* Always visible */}
      <Header />
      <main id="discoworld-main" tabIndex={-1} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: -1 }} aria-label="3D music explorer" />
      <MusicPlayer />
      {/* <StrudelPlayer /> — Disabled, needs polish. See ROADMAP. */}
      <Onboarding />

      {/* Phase 1: visible right after genre select (3D world + genre panel) */}
      {!isVibe && viewMode === 'genre' && (
        <ErrorBoundary name="GenrePanel"><GenrePanel /></ErrorBoundary>
      )}
      {!isVibe && viewMode === 'earth' && (
        <ErrorBoundary name="CityPanel"><CityPanel /></ErrorBoundary>
      )}
      {!isVibe && <ExploreButton />}

      {/* Phase 2: visible after 30s or 3 interactions */}
      {midUIVisible && <ViewSwitch />}
      {midUIVisible && viewMode === 'genre' && <FilterBar />}
      {midUIVisible && viewMode === 'genre' && <Timeline />}
      {midUIVisible && !isMobile && <ShortcutHelp />}
      {midUIVisible && viewMode === 'genre' && <LabelConstellationOverlay />}
      {midUIVisible && viewMode === 'genre' && <ArtistThreadPanel />}

      {/* Phase 3: visible after full onboarding (2min or Discogs import) */}
      {isFullUI && <DriftMode />}
      {isFullUI && <LayerControls />}
      {isFullUI && <CollectionPassport />}
      {isFullUI && <TasteTopology />}
      {isFullUI && <RecommendationPanel />}

      {/* DigPath: only show panel when already in record/playback mode (no always-visible Create Path button) */}
      {isFullUI && viewMode === 'genre' && <DigPathPanel />}

      {/* Minimap: hidden on mobile (too small to be useful) */}
      {minimapVisible && !isMobile && <Minimap />}

      {/* PWA install prompt + offline indicator */}
      <InstallPrompt />
    </div>
  )
}
