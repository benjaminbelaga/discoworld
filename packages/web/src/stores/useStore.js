import { create } from 'zustand'

const useStore = create((set) => ({
  // Timeline
  year: 2026,
  setYear: (year) => set({ year }),

  // Filters
  activeGenre: null,
  setActiveGenre: (genre) => set({ activeGenre: genre }),

  // Selection
  selectedRelease: null,
  setSelectedRelease: (release) => set({ selectedRelease: release }),
  hoveredRelease: null,
  setHoveredRelease: (release) => set({ hoveredRelease: release }),

  // View mode
  viewMode: 'genre', // 'genre' | 'earth' | 'planet'
  setViewMode: (mode) => set({ viewMode: mode }),

  // Genre Planet state
  activePlanetTerritory: null,
  setActivePlanetTerritory: (territory) => set({ activePlanetTerritory: territory }),

  // Playback
  playing: false,
  currentTrack: null,
  playerQueue: [],
  playerIndex: 0,
  shuffleMode: false,
  toggleShuffle: () => set(s => ({ shuffleMode: !s.shuffleMode })),
  setPlaying: (playing) => set({ playing }),
  setCurrentTrack: (track) => set((s) => {
    // If track is in current queue, just update index
    if (track && s.playerQueue.length > 0) {
      const idx = s.playerQueue.findIndex(
        t => t.artist === track.artist && t.title === track.title
      )
      if (idx >= 0) {
        return { currentTrack: track, playing: true, playerIndex: idx }
      }
    }
    // Otherwise set single track (clears queue context)
    return { currentTrack: track, playing: !!track, playerQueue: track ? [track] : [], playerIndex: 0 }
  }),
  setPlayerQueue: (queue, startIndex = 0) => set({
    playerQueue: queue,
    playerIndex: startIndex,
    currentTrack: queue[startIndex] || null,
    playing: queue.length > 0,
  }),
  playNext: () => set((s) => {
    if (s.shuffleMode && s.playerQueue.length > 1) {
      let rand
      do { rand = Math.floor(Math.random() * s.playerQueue.length) } while (rand === s.playerIndex)
      return { playerIndex: rand, currentTrack: s.playerQueue[rand], playing: true }
    }
    const next = s.playerIndex + 1
    if (next >= s.playerQueue.length) return {}
    return { playerIndex: next, currentTrack: s.playerQueue[next], playing: true }
  }),
  playPrev: () => set((s) => {
    const prev = s.playerIndex - 1
    if (prev < 0) return {}
    return { playerIndex: prev, currentTrack: s.playerQueue[prev], playing: true }
  }),

  // UI
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  filterBarOpen: false,
  setFilterBarOpen: (open) => set({ filterBarOpen: open }),

  // Camera fly-to target (null = orbit freely)
  cameraTarget: null,
  setCameraTarget: (target) => set({ cameraTarget: target }),

  // Reset camera to default position
  resetCamera: () => set({ cameraTarget: { x: 0, y: 0, z: 0, size: 10, _reset: true }, activeGenre: null }),

  // Auto tour
  autoTour: false,
  toggleAutoTour: () => set(s => ({ autoTour: !s.autoTour })),

  // Discogs releases (from preview dataset)
  discogsReleases: [],
  setDiscogsReleases: (r) => set({ discogsReleases: r }),

  // Data
  genres: [],
  releases: [],
  links: [],
  setGenres: (genres) => set({ genres }),
  setReleases: (releases) => set({ releases }),
  setLinks: (links) => set({ links }),

  // Earth Globe state
  selectedCity: null,
  setSelectedCity: (city) => set({ selectedCity: city }),

  globeCenter: { lat: 30, lng: 0 },
  setGlobeCenter: (center) => set({ globeCenter: center }),

  heatmapVisible: true,
  setHeatmapVisible: (v) => set({ heatmapVisible: v }),

  arcsVisible: true,
  setArcsVisible: (v) => set({ arcsVisible: v }),

  // Globe data (loaded from API or static JSON)
  citiesData: [],
  setCitiesData: (data) => set({ citiesData: data }),

  arcsData: [],
  setArcsData: (data) => set({ arcsData: data }),

  heatmapData: [],
  setHeatmapData: (data) => set({ heatmapData: data }),

  // Record shops data (loaded from static JSON)
  shopsData: [],
  setShopsData: (data) => set({ shopsData: data }),

  // Globe layers (for layer toggle controls)
  globeLayers: { cities: true, arcs: true, heatmap: true, shops: false },
  setGlobeLayer: (layer, value) => set(s => ({
    globeLayers: { ...s.globeLayers, [layer]: value }
  })),

  // Collection Passport
  discogsUsername: null,
  setDiscogsUsername: (u) => set({ discogsUsername: u }),
  tasteProfile: null,
  setTasteProfile: (p) => {
    set({ tasteProfile: p })
    // Compute collection genre/country mappings when profile changes
    if (p && p.genres) {
      const { genres } = useStore.getState()
      const collectionGenres = {}
      const nameLookup = {}
      genres.forEach(g => {
        nameLookup[g.name.toLowerCase()] = g.slug
        nameLookup[g.slug.toLowerCase()] = g.slug
        if (g.aka) {
          g.aka.split(',').forEach(alias => {
            nameLookup[alias.trim().toLowerCase()] = g.slug
          })
        }
      })
      // Map genres from profile to world slugs
      const genreList = Array.isArray(p.genres) ? p.genres : []
      genreList.forEach(pg => {
        const slug = nameLookup[pg.name.toLowerCase()]
        if (slug) {
          collectionGenres[slug] = (collectionGenres[slug] || 0) + pg.count
        }
      })
      // Also map styles (more specific Discogs styles) for better coverage
      const styleList = Array.isArray(p.styles) ? p.styles : []
      styleList.forEach(ps => {
        const slug = nameLookup[ps.name.toLowerCase()]
        if (slug) {
          collectionGenres[slug] = (collectionGenres[slug] || 0) + ps.count
        }
      })
      const collectionCountries = {}
      if (p.top_labels) {
        const labelCountry = {
          'tresor': 'DE', 'mille plateaux': 'DE', 'chain reaction': 'DE',
          'basic channel': 'DE', 'warp': 'GB', 'hyperdub': 'GB',
          'ghostly': 'US', 'kompakt': 'DE', 'ninja tune': 'GB',
          'ed banger': 'FR', 'raster-noton': 'DE', 'pan': 'DE',
          'planet mu': 'GB', 'mute': 'GB', 'xl recordings': 'GB',
          'def jam': 'US', 'stones throw': 'US', 'brainfeeder': 'US',
          'cocoon': 'DE', 'drumcode': 'SE', 'ostgut ton': 'DE',
          'r&s': 'BE', 'apollo': 'GB', 'erased tapes': 'GB',
          'kranky': 'US', 'dial': 'DE', 'hospital': 'GB',
          'metalheadz': 'GB', 'rush hour': 'NL', 'clone': 'NL',
          'delsin': 'NL', 'perlon': 'DE', 'mego': 'AT',
          'editions mego': 'AT', 'type': 'GB', 'touch': 'GB',
          'deep medi musik': 'GB', 'tempa': 'GB', 'hessle audio': 'GB',
          'r & s': 'BE', 'sahko': 'FI', 'hardwax': 'DE',
          'berceuse heroique': 'GB',
        }
        p.top_labels.forEach(l => {
          const country = labelCountry[l.name.toLowerCase()]
          if (country) {
            collectionCountries[country] = (collectionCountries[country] || 0) + l.count
          }
        })
      }
      set({ collectionGenres, collectionCountries, collectionLoaded: true })
    } else {
      set({ collectionGenres: {}, collectionCountries: {}, collectionLoaded: false })
    }
  },
  collectionLoaded: false,
  setCollectionLoaded: (v) => set({ collectionLoaded: v }),
  passportOpen: false,
  setPassportOpen: (v) => set({ passportOpen: v }),
  recommendationsOpen: false,
  setRecommendationsOpen: (v) => set({ recommendationsOpen: v }),

  // Collection overlay state
  collectionGenres: {},
  collectionCountries: {},
  showCollectionOverlay: false,
  setShowCollectionOverlay: (v) => set({ showCollectionOverlay: v }),

  // Onboarding progressive disclosure
  onboardingStep: (() => {
    try {
      return localStorage.getItem('discoworld-onboarded') ? 'complete' : 'vibe'
    } catch { return 'vibe' }
  })(),
  onboardingInteractions: 0,
  onboardingStartTime: null,
  setOnboardingStep: (step) => set({ onboardingStep: step }),
  advanceOnboarding: () => set((s) => {
    const interactions = s.onboardingInteractions + 1
    const elapsed = s.onboardingStartTime ? Date.now() - s.onboardingStartTime : 0
    const twoMinutes = 2 * 60 * 1000

    // After 5 interactions or 2 minutes: full UI
    if (interactions >= 5 || elapsed >= twoMinutes) {
      try { localStorage.setItem('discoworld-onboarded', '1') } catch {}
      return { onboardingInteractions: interactions, onboardingStep: 'complete' }
    }

    // After 3 genre interactions: show discogs import prompt
    if (interactions >= 3 && s.onboardingStep === 'tooltip') {
      return { onboardingInteractions: interactions, onboardingStep: 'discogs' }
    }

    return { onboardingInteractions: interactions }
  }),
  completeOnboarding: () => {
    try { localStorage.setItem('discoworld-onboarded', '1') } catch {}
    set({ onboardingStep: 'complete' })
  },
  startOnboardingTimer: () => set({ onboardingStartTime: Date.now() }),

  // Label Constellation
  activeLabel: null,
  setActiveLabel: (label) => set({ activeLabel: label }),
  labelReleases: [],
  setLabelReleases: (r) => set({ labelReleases: r }),

  // Artist Thread
  activeArtist: null,
  setActiveArtist: (artist) => set({ activeArtist: artist }),
  artistTimeline: [],
  setArtistTimeline: (t) => set({ artistTimeline: t }),

  // Dig Paths — curated genre journeys
  digPathMode: null, // null | 'record' | 'playback'
  digPathWaypoints: [], // [{ slug, note, timestamp }]
  digPathTitle: '',
  digPathDescription: '',
  digPathPlaying: false,
  digPathPlaybackIndex: 0,
  setDigPathMode: (mode) => set({ digPathMode: mode }),
  addDigPathWaypoint: (waypoint) => set(s => ({
    digPathWaypoints: [...s.digPathWaypoints, { ...waypoint, timestamp: Date.now() }]
  })),
  removeDigPathWaypoint: (index) => set(s => ({
    digPathWaypoints: s.digPathWaypoints.filter((_, i) => i !== index)
  })),
  moveDigPathWaypoint: (from, to) => set(s => {
    const arr = [...s.digPathWaypoints]
    const [item] = arr.splice(from, 1)
    arr.splice(to, 0, item)
    return { digPathWaypoints: arr }
  }),
  updateDigPathNote: (index, note) => set(s => ({
    digPathWaypoints: s.digPathWaypoints.map((w, i) => i === index ? { ...w, note } : w)
  })),
  setDigPathTitle: (title) => set({ digPathTitle: title }),
  setDigPathDescription: (desc) => set({ digPathDescription: desc }),
  setDigPathPlaying: (playing) => set({ digPathPlaying: playing }),
  setDigPathPlaybackIndex: (index) => set({ digPathPlaybackIndex: index }),
  clearDigPath: () => set({
    digPathMode: null,
    digPathWaypoints: [],
    digPathTitle: '',
    digPathDescription: '',
    digPathPlaying: false,
    digPathPlaybackIndex: 0,
  }),
  loadDigPath: (path) => set({
    digPathWaypoints: path.waypoints.map(w => ({ slug: w.slug, note: w.note || '', timestamp: Date.now() })),
    digPathTitle: path.title || '',
    digPathDescription: path.description || '',
    digPathMode: 'playback',
    digPathPlaying: false,
    digPathPlaybackIndex: 0,
  }),

  // Globe instance ref (set by EarthGlobe, read by Minimap/search)
  globeInstance: null,
  setGlobeInstance: (g) => set({ globeInstance: g }),

  // Fly globe to lat/lng
  flyToCity: (lat, lng) => {
    const globe = useStore.getState().globeInstance
    if (globe) {
      globe.pointOfView({ lat, lng, altitude: 1.8 }, 1200)
    }
    set({ globeCenter: { lat, lng } })
  },
}))

export default useStore
