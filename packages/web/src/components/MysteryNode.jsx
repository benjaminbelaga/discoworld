import { useRef, useState, useMemo, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import useStore from '../stores/useStore'

// Module-scoped random seed (computed once at import time, pure within render)
const _mysterySeed = Math.random()

// Shared geometries — allocated once, reused across renders
const _mysterySphereGeom = new THREE.SphereGeometry(1, 24, 24)
const _mysteryGlowGeom = new THREE.SphereGeometry(1, 16, 16)

/**
 * Mystery "?" Node — one unlabeled genre sphere per session.
 * Placed near the user's taste center (if collection loaded) or randomly.
 * Pulsing magenta glow. Clicking plays a track; after 3 listens the genre reveals.
 */
export default function MysteryNode() {
  const genres = useStore(s => s.genres)
  const releases = useStore(s => s.releases)
  const tasteProfile = useStore(s => s.tasteProfile)
  const setCameraTarget = useStore(s => s.setCameraTarget)
  const setActiveGenre = useStore(s => s.setActiveGenre)
  const setCurrentTrack = useStore(s => s.setCurrentTrack)

  const meshRef = useRef()
  const glowRef = useRef()
  const [listenCount, setListenCount] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [hovered, setHovered] = useState(false)

  // Pick a mystery genre once per component lifetime (session).
  // We use a module-scoped seed to avoid calling Math.random during render.
  const mysteryGenre = useMemo(() => {
    if (!genres.length) return null
    const seed = _mysterySeed

    // If taste profile exists, pick a genre near taste center
    if (tasteProfile?.topGenres?.length) {
      const tasteScenes = new Set(tasteProfile.topGenres.map(g => g.scene))
      const candidates = genres.filter(g => !tasteScenes.has(g.scene) && g.trackCount > 5)
      if (candidates.length) {
        return candidates[Math.floor(seed * candidates.length)]
      }
    }

    // Random pick from genres with tracks
    const withTracks = genres.filter(g => {
      const tracks = releases[g.slug]
      return tracks && tracks.length > 3
    })
    if (!withTracks.length) return null
    return withTracks[Math.floor(seed * withTracks.length)]
  }, [genres, releases, tasteProfile])

  // Animate: pulsing glow
  useFrame((state) => {
    if (!meshRef.current || !mysteryGenre || revealed) return
    const t = state.clock.elapsedTime

    // Pulsing scale
    const pulse = 1 + Math.sin(t * 2) * 0.15
    meshRef.current.scale.setScalar(mysteryGenre.size * 1.2 * pulse)

    // Float
    meshRef.current.position.y = mysteryGenre.y + Math.sin(t * 0.7) * 0.5 + 0.5

    // Glow ring
    if (glowRef.current) {
      const glowPulse = 0.3 + Math.sin(t * 3) * 0.2
      glowRef.current.material.opacity = glowPulse
      glowRef.current.scale.setScalar(mysteryGenre.size * 2 * (1 + Math.sin(t * 1.5) * 0.1))
    }
  })

  const handleClick = useCallback(() => {
    if (!mysteryGenre) return

    setCameraTarget(mysteryGenre)

    // Play a random track from this genre
    const tracks = releases[mysteryGenre.slug]
    if (tracks?.length) {
      const track = tracks[Math.floor(Math.random() * tracks.length)]
      setCurrentTrack(track)
    }

    const newCount = listenCount + 1
    setListenCount(newCount)

    if (newCount >= 3) {
      setRevealed(true)
      setActiveGenre(mysteryGenre)
    }
  }, [mysteryGenre, releases, listenCount, setCameraTarget, setCurrentTrack, setActiveGenre])

  if (!mysteryGenre || revealed) return null

  return (
    <group position={[mysteryGenre.x, mysteryGenre.y, mysteryGenre.z]}>
      {/* Main sphere */}
      <mesh
        ref={meshRef}
        geometry={_mysterySphereGeom}
        onClick={(e) => { e.stopPropagation(); handleClick() }}
        onPointerOver={() => { setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
      >
        <meshStandardMaterial
          color="#ff00ff"
          emissive="#ff00ff"
          emissiveIntensity={hovered ? 1.5 : 0.8}
          toneMapped={false}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Outer glow ring */}
      <mesh ref={glowRef} geometry={_mysteryGlowGeom}>
        <meshBasicMaterial
          color="#ff44ff"
          transparent
          opacity={0.3}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* "?" label */}
      <Html
        center
        style={{ pointerEvents: 'none', userSelect: 'none' }}
        position={[0, mysteryGenre.size * 1.5 + 2, 0]}
      >
        <div className="mystery-label">
          <span className="mystery-question">?</span>
          {listenCount > 0 && (
            <span className="mystery-count">{listenCount}/3</span>
          )}
        </div>
      </Html>
    </group>
  )
}
