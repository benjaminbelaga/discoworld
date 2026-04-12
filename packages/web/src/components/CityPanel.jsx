import { useEffect, useRef } from 'react'
import useStore from '../stores/useStore'

function formatGenre(slug) {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Normalize genre slug for lookup: strip all separators (_, space, -)
// City genres: "minimal_techno" → "minimaltechno"
// Track keys:  "minimaltechno"  → "minimaltechno"  ✓ match
function normalizeSlug(s) {
  return s.toLowerCase().replace(/[_\s-]/g, '')
}

// Curated parent → subgenre track-key aliases. Used for city genre slugs
// that don't match any existing tracks key even via prefix/suffix fallback.
// Source: data coverage audit 2026-04-12 (Johannesburg + Milan silent failures).
// Each value = array of track keys to UNION. Keys MUST exist in world.json.tracks.
const GENRE_ALIASES = {
  afro_house:         ['chicagohouse', 'frenchhouse'],
  italo_disco:        ['discohouse', 'electroclash', 'dancepunk', 'hinrg'], // unblocks Milan
  italo_house:        ['discohouse', 'frenchhouse', 'chicagohouse'],
  psytrance:          ['psychedelictrance', 'goatrance', 'darkpsy', 'progpsy'],
  gabber:             ['hardcore', 'speedcore', 'oldskoolravehardcore', 'ukhardcore'],
  post_punk:          ['darkwave', 'industrial', 'ebm'],
  deconstructed_club: ['experimental', 'glitch', 'noise'],
  uk_garage:          ['2-stepgarage', 'speedgarage', 'futuregarage', 'ukhouse'],
  breakbeat:          ['breaks', 'bigbeat', 'chemicalbreaks', 'nuskoolbreaks', 'floridabreaks'],
  dnb:                ['liquidfunk', 'jumpup', 'neurofunk', 'techstep', 'darkstep', 'jazzstep', 'drumstep', 'atmosphericjungle', 'raggajungle'],
  hip_hop:            ['eastcoastrap', 'westcoastrap', 'dirtysouthrap', 'southernrap', 'consciousrap', 'triphop', 'turntablism'],
  new_wave:           ['synthpop', 'darkwave', 'electroclash', 'futurepop'],
  bassline:           ['dubstep', 'brostep', 'grime', 'speedgarage'],
  french_touch:       ['frenchhouse', 'discohouse', 'fidgethouse', 'filthyelectrohouse'],
  electronica:        ['ambient', 'downtempo', 'glitch', 'experimental'],
  baile_funk:         ['moombahton', 'miamibass', 'ghettotech', 'dancehall'],
}

// Look up tracks for a genre slug by UNION of matches, with progressive fallbacks:
//   1. Direct key match
//   2. Normalized equality (strips _, space, -)
//   3. Parent-genre fallback (keys that END or START with the normalized slug)
//   4. Word-split fallback for compound slugs — if 1-3 all fail, split the
//      query by separators and re-try each word ≥ 5 chars as prefix/suffix.
//      Example: "afro_house" → ['afro','house'] → 'house' matches chicagohouse,
//      deephouse, frenchhouse, etc. Unlocks Johannesburg (afro_house) and any
//      other city whose only tag is an unfamiliar compound genre.
//      The ≥ 5 char filter prevents false matches like 'hip' → hiphouse.
// Union everything — a parent like "trance" may have 0 YouTube tracks on its
// own direct key but many under subgenres. Early-returning would miss those.
function findGenreTracks(releases, genre) {
  if (!releases) return []
  const norm = normalizeSlug(genre)
  const keys = Object.keys(releases)
  const matching = new Set()
  // 1. Direct key match
  if (releases[genre]) matching.add(genre)
  // 2. Normalized equality + 3. Prefix/suffix parent-genre fallback
  for (const k of keys) {
    const nk = normalizeSlug(k)
    if (nk === norm || nk.endsWith(norm) || nk.startsWith(norm)) {
      matching.add(k)
    }
  }
  // 4. Curated alias map (Johannesburg, Milan, 12 other cities rescued)
  const aliasKeys = GENRE_ALIASES[genre.toLowerCase()]
  if (aliasKeys) {
    for (const k of aliasKeys) {
      if (releases[k]) matching.add(k)
    }
  }
  // 5. Word-split fallback (last resort for compound slugs not in alias map)
  if (!matching.size && /[_\s-]/.test(genre)) {
    const words = genre.toLowerCase().split(/[_\s-]+/).filter(w => w.length >= 5)
    for (const word of words) {
      for (const k of keys) {
        const nk = normalizeSlug(k)
        if (nk.endsWith(word) || nk.startsWith(word)) {
          matching.add(k)
        }
      }
    }
  }
  if (!matching.size) return []
  const out = []
  for (const k of matching) {
    const arr = releases[k]
    if (arr) out.push(...arr)
  }
  return out
}

export default function CityPanel() {
  const selectedCity = useStore(s => s.selectedCity)
  const setSelectedCity = useStore(s => s.setSelectedCity)
  const releases = useStore(s => s.releases)
  const setPlayerQueue = useStore(s => s.setPlayerQueue)
  const setCurrentTrack = useStore(s => s.setCurrentTrack)
  const currentTrack = useStore(s => s.currentTrack)
  const playing = useStore(s => s.playing)

  if (!selectedCity) return null

  // Collect ALL playable tracks from all city genres
  const cityGenres = selectedCity.genres || []
  const allCityTracks = []

  for (const genre of cityGenres) {
    const genreTracks = findGenreTracks(releases, genre)
    for (const t of genreTracks) {
      if (t.youtube && !allCityTracks.some(x => x.artist === t.artist && x.title === t.title)) {
        allCityTracks.push({ ...t, genre: formatGenre(genre) })
      }
    }
  }

  const isQueuePlaying = currentTrack && playing && allCityTracks.some(
    t => t.artist === currentTrack.artist && t.title === currentTrack.title
  )

  // Auto-play when a new city is selected. Capped + try/catch to survive
  // cities like Alexandria whose parent-genre fallback unions ~155 tracks
  // across 31 subgenre keys — passing that big a queue to setPlayerQueue was
  // suspected of crashing (ErrorBoundary surfaced a blank dialog in prod).
  const prevCityNameRef = useRef(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedCity) { prevCityNameRef.current = null; return }
    if (selectedCity.name === prevCityNameRef.current) return
    prevCityNameRef.current = selectedCity.name
    try {
      if (allCityTracks.length > 0) {
        // Cap queue at 50 to keep the YT player + React reconciliation snappy.
        const capped = allCityTracks.slice(0, 50)
        setPlayerQueue(capped, 0)
      }
    } catch (err) {
      console.error('[CityPanel] auto-play failed:', err)
    }
  }, [selectedCity])

  const releaseStr = selectedCity.release_count
    ? selectedCity.release_count.toLocaleString()
    : '?'

  function handlePlayAll() {
    if (allCityTracks.length > 0) {
      setPlayerQueue(allCityTracks, 0)
    }
  }

  function handlePlayTrack(index) {
    setPlayerQueue(allCityTracks, index)
  }

  function handleGenreClick(genreSlug) {
    const genreName = formatGenre(genreSlug)
    const tracks = findGenreTracks(releases, genreSlug)
    const playable = tracks.filter(t => t.youtube)
    if (playable.length > 0) {
      setPlayerQueue(playable, 0)
    } else {
      setCurrentTrack({ artist: genreName, title: `${selectedCity.name} mix`, youtube: null })
    }
  }

  function handleLabelClick(labelName) {
    setCurrentTrack({ artist: labelName, title: 'vinyl mix', youtube: null })
  }

  function handleArtistClick(artistName) {
    // Check if this artist has a track in the city queue
    const match = allCityTracks.find(t => t.artist === artistName)
    if (match) {
      const idx = allCityTracks.indexOf(match)
      setPlayerQueue(allCityTracks, idx)
    } else {
      setCurrentTrack({ artist: artistName, title: '', youtube: null })
    }
  }

  // Shared keyboard activation handler for role=button divs/spans
  // (Enter or Space fires the onClick). Previously missing → keyboard
  // users could tab to city genre/label/track tags but not activate them.
  function kbActivate(handler) {
    return (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handler()
      }
    }
  }

  return (
    <div className="city-panel">
      <button className="close-btn" onClick={() => setSelectedCity(null)} aria-label="Close city panel">&times;</button>

      <h2>{selectedCity.name}</h2>
      <div className="city-panel-country">{selectedCity.country}</div>

      <div className="city-panel-meta">
        <span>{releaseStr} releases</span>
        {selectedCity.scene_peak && <span>Peak: {selectedCity.scene_peak}</span>}
      </div>

      {selectedCity.description && (
        <p className="city-panel-description">{selectedCity.description}</p>
      )}

      <div className="city-panel-genres">
        {cityGenres.map(g => (
          <span
            key={g}
            className="city-genre-tag city-genre-tag--clickable"
            onClick={() => handleGenreClick(g)}
            onKeyDown={kbActivate(() => handleGenreClick(g))}
            role="button"
            tabIndex={0}
            title={`Play ${formatGenre(g)} music`}
            aria-label={`Play ${formatGenre(g)} music`}
          >
            {formatGenre(g)}
          </span>
        ))}
      </div>

      {selectedCity.top_labels && selectedCity.top_labels.length > 0 && (
        <div className="city-panel-labels">
          <h3>{selectedCity.label_count} labels</h3>
          <div className="city-label-list">
            {selectedCity.top_labels.slice(0, 8).map(l => (
              <span
                key={l.name}
                className="city-label-tag city-label-tag--clickable"
                onClick={() => handleLabelClick(l.name)}
                onKeyDown={kbActivate(() => handleLabelClick(l.name))}
                role="button"
                tabIndex={0}
                title={`Play ${l.name} — ${l.releases} releases`}
                aria-label={`Play ${l.name} — ${l.releases} releases`}
              >
                {l.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Empty state when the city has no playable tracks */}
      {allCityTracks.length === 0 && (
        <div className="city-panel-empty" style={{
          marginTop: 12,
          padding: '10px 12px',
          borderRadius: 6,
          background: 'rgba(255,255,255,0.03)',
          border: '1px dashed rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          lineHeight: 1.5,
        }}>
          No playable tracks mapped for this city's genres yet.
          Click a genre tag above to explore its subgenres.
        </div>
      )}

      {/* Play all tracks from this city */}
      {allCityTracks.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            className={`city-panel-play ${isQueuePlaying ? 'playing' : ''}`}
            onClick={handlePlayAll}
            style={{ marginBottom: 8 }}
          >
            {isQueuePlaying ? (
              <span className="playing-indicator"><span /><span /><span /></span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
            <span>
              Play {selectedCity.name} — {allCityTracks.length} tracks
            </span>
          </button>

          {/* Track list */}
          <ul className="city-track-list">
            {allCityTracks.slice(0, 12).map((t, i) => {
              const active = currentTrack && playing &&
                currentTrack.artist === t.artist && currentTrack.title === t.title
              return (
                <li
                  key={`${t.artist}-${t.title}`}
                  className={`city-track ${active ? 'city-track--active' : ''}`}
                  onClick={() => handlePlayTrack(i)}
                  onKeyDown={kbActivate(() => handlePlayTrack(i))}
                  role="button"
                  tabIndex={0}
                  aria-label={`Play ${t.artist} — ${t.title}`}
                >
                  {active && <span className="playing-indicator" style={{ marginRight: 6 }}><span /><span /><span /></span>}
                  <span
                    className="city-track-artist city-track-artist--clickable"
                    onClick={(e) => { e.stopPropagation(); handleArtistClick(t.artist) }}
                    title={`Search ${t.artist} on YouTube`}
                  >
                    {t.artist}
                  </span>
                  <span className="city-track-sep"> — </span>
                  <span className="city-track-title">{t.title}</span>
                  <span className="city-track-year">{t.year}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
