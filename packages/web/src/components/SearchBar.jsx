import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import useStore from '../stores/useStore'
import { buildSearchIndex, searchGenres } from '../utils/vibeSearch'
import './SearchBar.css'

const API_BASE = import.meta.env.VITE_API_URL || ''

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ genres: [], artists: [], labels: [] })
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const debounceRef = useRef(null)
  const abortRef = useRef(null)

  const genres = useStore(s => s.genres)
  const releases = useStore(s => s.releases)
  const setActiveGenre = useStore(s => s.setActiveGenre)
  const setCameraTarget = useStore(s => s.setCameraTarget)
  const setActiveLabel = useStore(s => s.setActiveLabel)
  const setActiveArtist = useStore(s => s.setActiveArtist)
  const setCurrentTrack = useStore(s => s.setCurrentTrack)
  const viewMode = useStore(s => s.viewMode)
  const citiesData = useStore(s => s.citiesData)
  const flyToCity = useStore(s => s.flyToCity)

  // Local genre search index for instant results
  const searchIndex = useMemo(() => buildSearchIndex(genres), [genres])
  const genreMap = useMemo(() => new Map(genres.map(g => [g.slug, g])), [genres])

  // Flatten all results into a single navigable list
  const flatResults = useMemo(() => {
    const items = []
    for (const g of results.genres) {
      items.push({ type: 'genre', data: g })
    }
    for (const a of results.artists) {
      items.push({ type: 'artist', data: a })
    }
    for (const l of results.labels) {
      items.push({ type: 'label', data: l })
    }
    return items
  }, [results])

  const hasResults = flatResults.length > 0

  // Search: local genres instantly, API for artists/labels
  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) {
      setResults({ genres: [], artists: [], labels: [] })
      setIsOpen(false)
      return
    }

    // Instant local genre search
    const localGenres = searchGenres(q, searchIndex, genres, 5).map(r => ({
      name: r.genre.name,
      slug: r.genre.slug,
      scene: r.genre.scene || '',
      color: r.genre.color || '#ffffff',
      x: r.genre.x,
      y: r.genre.y,
      z: r.genre.z,
      size: r.genre.size,
      score: r.score,
    }))

    setResults(prev => ({ ...prev, genres: localGenres }))
    setSelectedIdx(0)
    setIsOpen(true)

    // Async API search for artists + labels
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const res = await fetch(
        `${API_BASE}/api/search/unified?q=${encodeURIComponent(q.trim())}&limit=6`,
        { signal: controller.signal }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      setResults({
        genres: localGenres.length > 0 ? localGenres : (data.genres || []),
        artists: data.artists || [],
        labels: data.labels || [],
      })
      setIsOpen(true)
    } catch (err) {
      if (err.name !== 'AbortError') {
        // Keep local genre results on API failure
        setResults(prev => ({ ...prev, artists: [], labels: [] }))
      }
    } finally {
      setLoading(false)
    }
  }, [searchIndex, genres])

  // URL paste detection: YouTube / Discogs → locate matching track on map
  // Returns { matched, track, genreSlug } or null if no match.
  const locateByUrl = useCallback((url) => {
    if (!url || !releases) return null
    // YouTube video ID extraction
    let videoId = null
    try {
      const u = new URL(url)
      if (u.hostname.includes('youtube.com')) videoId = u.searchParams.get('v')
      else if (u.hostname === 'youtu.be') videoId = u.pathname.slice(1)
    } catch { return null }
    if (!videoId) return null
    // Scan releases dict for a track whose youtube field contains this id
    for (const [genreSlug, tracks] of Object.entries(releases)) {
      if (!Array.isArray(tracks)) continue
      for (const t of tracks) {
        if (t.youtube && t.youtube.includes(videoId)) {
          return { track: t, genreSlug }
        }
      }
    }
    return null
  }, [releases])

  const handleInputChange = useCallback((e) => {
    const val = e.target.value
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    // URL paste shortcut — instant zoom, no debounce
    if (/^https?:\/\//.test(val.trim())) {
      const match = locateByUrl(val.trim())
      if (match) {
        const genre = genreMap.get(match.genreSlug) || genres.find(g => g.slug === match.genreSlug)
        if (genre) {
          setActiveGenre(genre)
          setCameraTarget(genre)
        }
        setCurrentTrack(match.track)
        // Inline close (can't reference close() — declared later, TDZ)
        setQuery('')
        setResults({ genres: [], artists: [], labels: [] })
        setIsOpen(false)
        setSelectedIdx(0)
        inputRef.current?.blur()
        return
      }
    }
    debounceRef.current = setTimeout(() => doSearch(val), 200)
  }, [doSearch, locateByUrl, genreMap, genres, setActiveGenre, setCameraTarget, setCurrentTrack])

  const close = useCallback(() => {
    setQuery('')
    setResults({ genres: [], artists: [], labels: [] })
    setIsOpen(false)
    setSelectedIdx(0)
    inputRef.current?.blur()
  }, [])

  const selectItem = useCallback((item) => {
    if (!item) return

    if (item.type === 'genre') {
      const genre = genreMap.get(item.data.slug) || item.data
      if (viewMode === 'earth') {
        // Try to fly to associated city
        const city = citiesData.find(c =>
          c.genres?.includes(item.data.slug?.replace(/-/g, '_'))
        )
        if (city) flyToCity(city.lat, city.lng)
      } else {
        setActiveGenre(genre)
        setCameraTarget(genre)
      }
    } else if (item.type === 'artist') {
      setActiveArtist(item.data.name)
    } else if (item.type === 'label') {
      setActiveLabel(item.data.name)
    }

    close()
  }, [genreMap, viewMode, citiesData, flyToCity, setActiveGenre, setCameraTarget, setActiveArtist, setActiveLabel, close])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      close()
      return
    }
    if (!isOpen || !hasResults) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, flatResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectItem(flatResults[selectedIdx])
    }
  }, [isOpen, hasResults, flatResults, selectedIdx, selectItem, close])

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        return
      }
      // Also support / when not in input
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Track which section each index falls in for rendering
  let globalIdx = 0

  const renderGroup = (title, icon, items, type, _accentColor) => {
    if (items.length === 0) return null
    const startIdx = globalIdx
    const group = (
      <div className="searchbar-group" key={type}>
        <div className="searchbar-group-header">
          <span className="searchbar-group-icon">{icon}</span>
          <span className="searchbar-group-title">{title}</span>
          <span className="searchbar-group-count">{items.length}</span>
        </div>
        {items.map((item, i) => {
          const idx = startIdx + i
          return (
            <button
              key={`${type}-${item.name}-${i}`}
              className={`searchbar-result ${idx === selectedIdx ? 'selected' : ''}`}
              onClick={() => selectItem({ type, data: item })}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              {type === 'genre' && (
                <span
                  className="searchbar-result-dot"
                  style={{ background: item.color, boxShadow: `0 0 6px ${item.color}` }}
                />
              )}
              {type === 'artist' && (
                <span className="searchbar-result-icon" style={{ color: '#00e5ff' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M20 21a8 8 0 1 0-16 0" />
                  </svg>
                </span>
              )}
              {type === 'label' && (
                <span className="searchbar-result-icon" style={{ color: '#ffb300' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </span>
              )}
              <div className="searchbar-result-info">
                <span className="searchbar-result-name">{item.name}</span>
                {type === 'genre' && item.scene && (
                  <span className="searchbar-result-meta">{item.scene}</span>
                )}
                {(type === 'artist' || type === 'label') && item.release_count && (
                  <span className="searchbar-result-meta">
                    {item.release_count.toLocaleString()} release{item.release_count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    )
    globalIdx += items.length
    return group
  }

  return (
    <div className="searchbar" ref={containerRef}>
      <div className={`searchbar-input-wrap ${isOpen && hasResults ? 'active' : ''}`}>
        <svg className="searchbar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="searchbar-input"
          placeholder="Search genres, artists, labels..."
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (hasResults) setIsOpen(true) }}
          aria-label="Search DiscoWorld"
          aria-expanded={isOpen}
          role="combobox"
          aria-autocomplete="list"
          aria-controls="searchbar-listbox"
        />
        {query && (
          <button className="searchbar-clear" onClick={close} aria-label="Clear search">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        )}
        {loading && <span className="searchbar-spinner" />}
        <kbd className="searchbar-kbd">
          <span className="searchbar-kbd-mod">{(navigator.userAgentData?.platform || navigator.platform)?.includes('Mac') ? 'Cmd' : 'Ctrl'}</span>K
        </kbd>
      </div>

      {isOpen && hasResults && (
        <div className="searchbar-dropdown" id="searchbar-listbox" role="listbox">
          {(() => {
            globalIdx = 0
            return (
              <>
                {renderGroup('Genres', null, results.genres, 'genre', '#00e5ff')}
                {renderGroup('Artists', null, results.artists, 'artist', '#00e5ff')}
                {renderGroup('Labels', null, results.labels, 'label', '#ffb300')}
              </>
            )
          })()}
          <div className="searchbar-footer">
            <span>{flatResults.length} result{flatResults.length !== 1 ? 's' : ''}</span>
            <span className="searchbar-footer-hints">
              <kbd>↑↓</kbd> navigate <kbd>Enter</kbd> select <kbd>Esc</kbd> close
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
