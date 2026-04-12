import { useEffect, useRef } from 'react'
import useStore from '../stores/useStore'

/**
 * URL deep linking hook — syncs view state to/from URL search params.
 *
 * Supported params: view, genre, city, drift, lat, lng, zoom, year
 * Does NOT touch the hash (#) — dig paths use #path= via pathSerializer.
 */

const VIEW_MAP = { genre: 'genre', earth: 'earth', planet: 'planet' }
const VIEW_REVERSE = { genre: 'genre', earth: 'earth', planet: 'planet' }

// Debounce timer ref (module-level to survive re-renders)
let pushTimer = null

/**
 * Read URL params on mount and apply to store.
 * Then subscribe to store changes and push to URL (debounced).
 */
export default function useUrlState() {
  const initialized = useRef(false)

  // On mount: read URL → store
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const params = new URLSearchParams(window.location.search)
    const state = {}

    const view = params.get('view')
    if (view && VIEW_MAP[view]) {
      state.viewMode = VIEW_MAP[view]
    }

    const genre = params.get('genre')
    if (genre) {
      // Defer genre selection until genres are loaded
      const trySelectGenre = () => {
        const { genres, setActiveGenre, setCameraTarget } = useStore.getState()
        if (!genres.length) return false
        const match = genres.find(
          g => g.slug === genre || g.name?.toLowerCase() === genre.toLowerCase()
        )
        if (match) {
          setActiveGenre(match)
          setCameraTarget(match)
        }
        return true
      }
      if (!trySelectGenre()) {
        // Genres not loaded yet — retry via subscription.
        // IMPORTANT: unsubscribe BEFORE calling trySelectGenre, otherwise the
        // inner set() calls re-fire this subscriber synchronously → infinite
        // recursion ("Maximum call stack size exceeded").
        const unsub = useStore.subscribe((s) => {
          if (s.genres.length) {
            unsub()
            trySelectGenre()
          }
        })
      }
    }

    const city = params.get('city')
    const viewExplicit = !!params.get('view')
    if (city) {
      // Defer city selection until cities are loaded
      const trySelectCity = () => {
        const { citiesData, setSelectedCity, flyToCity, setViewMode } = useStore.getState()
        if (!citiesData.length) return false
        const match = citiesData.find(
          c => c.name?.toLowerCase() === city.toLowerCase() || c.slug === city
        )
        if (match) {
          // Only switch to earth if no explicit view param was given
          if (!viewExplicit) setViewMode('earth')
          setSelectedCity(match)
          if (match.lat != null && match.lng != null) {
            flyToCity(match.lat, match.lng)
          }
        }
        return true
      }
      if (!trySelectCity()) {
        // Unsub BEFORE calling trySelectCity — the inner setSelectedCity / flyToCity
        // synchronously re-fire this listener otherwise, recursing to stack overflow.
        const unsub = useStore.subscribe((s) => {
          if (s.citiesData.length) {
            unsub()
            trySelectCity()
          }
        })
      }
    }

    const drift = params.get('drift')
    if (drift === '1') {
      state.autoTour = true
    }

    const lat = params.get('lat')
    const lng = params.get('lng')
    if (lat != null && lng != null) {
      const latN = parseFloat(lat)
      const lngN = parseFloat(lng)
      if (!isNaN(latN) && !isNaN(lngN)) {
        state.globeCenter = { lat: latN, lng: lngN }
        // Also fly there once globe is ready
        const tryFly = () => {
          const { globeInstance } = useStore.getState()
          if (!globeInstance) return false
          const zoom = params.get('zoom')
          const alt = zoom ? parseFloat(zoom) : 1.8
          globeInstance.pointOfView({ lat: latN, lng: lngN, altitude: isNaN(alt) ? 1.8 : alt }, 0)
          return true
        }
        if (!tryFly()) {
          const unsub = useStore.subscribe((s) => {
            if (s.globeInstance) {
              unsub()
              tryFly()
            }
          })
        }
      }
    }

    const year = params.get('year')
    if (year) {
      const y = parseInt(year, 10)
      if (!isNaN(y) && y >= 1960 && y <= 2030) {
        state.year = y
      }
    }

    if (Object.keys(state).length) {
      useStore.setState(state)
    }
  }, [])

  // Subscribe to store → push URL (debounced)
  useEffect(() => {
    const unsub = useStore.subscribe((state, prev) => {
      // Only react to relevant changes
      const changed =
        state.viewMode !== prev.viewMode ||
        state.activeGenre !== prev.activeGenre ||
        state.selectedCity !== prev.selectedCity ||
        state.autoTour !== prev.autoTour ||
        state.globeCenter !== prev.globeCenter ||
        state.year !== prev.year

      if (!changed) return

      if (pushTimer) clearTimeout(pushTimer)
      pushTimer = setTimeout(() => {
        const s = useStore.getState()
        const params = new URLSearchParams()

        if (s.viewMode && s.viewMode !== 'genre') {
          params.set('view', VIEW_REVERSE[s.viewMode] || s.viewMode)
        }

        if (s.activeGenre?.slug) {
          params.set('genre', s.activeGenre.slug)
        }

        if (s.selectedCity?.name) {
          params.set('city', s.selectedCity.name.toLowerCase())
        }

        if (s.autoTour) {
          params.set('drift', '1')
        }

        if (s.viewMode === 'earth' && s.globeCenter) {
          params.set('lat', s.globeCenter.lat.toFixed(1))
          params.set('lng', s.globeCenter.lng.toFixed(1))
        }

        if (s.year !== 2026) {
          params.set('year', String(s.year))
        }

        const search = params.toString()
        const newUrl = search
          ? `${window.location.pathname}?${search}${window.location.hash}`
          : `${window.location.pathname}${window.location.hash}`

        if (newUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
          window.history.replaceState(null, '', newUrl)
        }
      }, 300)
    })

    return () => {
      unsub()
      if (pushTimer) clearTimeout(pushTimer)
    }
  }, [])
}

/**
 * Build a shareable URL from the current store state.
 * @returns {string}
 */
export function buildShareUrl() {
  const s = useStore.getState()
  const params = new URLSearchParams()

  if (s.viewMode && s.viewMode !== 'genre') {
    params.set('view', s.viewMode)
  }
  if (s.activeGenre?.slug) {
    params.set('genre', s.activeGenre.slug)
  }
  if (s.selectedCity?.name) {
    params.set('city', s.selectedCity.name.toLowerCase())
  }
  if (s.autoTour) {
    params.set('drift', '1')
  }
  if (s.viewMode === 'earth' && s.globeCenter) {
    params.set('lat', s.globeCenter.lat.toFixed(1))
    params.set('lng', s.globeCenter.lng.toFixed(1))
  }
  if (s.year !== 2026) {
    params.set('year', String(s.year))
  }

  const search = params.toString()
  return search
    ? `${window.location.origin}${window.location.pathname}?${search}`
    : `${window.location.origin}${window.location.pathname}`
}
