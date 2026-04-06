import { useEffect, useRef, useState, useCallback } from 'react'
import useStore from '../stores/useStore'
import { shareGenre } from '../lib/shareCard'

// Clickable label/artist name that activates constellation/thread views
function ClickableLabel({ name, onClick }) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`View label: ${name}`}
      onClick={(e) => { e.stopPropagation(); onClick(name) }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClick(name) } }}
      style={{
        cursor: 'pointer',
        borderBottom: '1px dotted rgba(255,200,100,0.3)',
        transition: 'color 0.2s',
      }}
      onMouseEnter={(e) => { e.target.style.color = '#ffcc66' }}
      onMouseLeave={(e) => { e.target.style.color = '' }}
    >
      {name}
    </span>
  )
}

function ClickableArtist({ name, onClick }) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`View artist: ${name}`}
      onClick={(e) => { e.stopPropagation(); onClick(name) }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClick(name) } }}
      style={{
        cursor: 'pointer',
        borderBottom: '1px dotted rgba(68,136,255,0.3)',
        transition: 'color 0.2s',
      }}
      onMouseEnter={(e) => { e.target.style.color = '#4488ff' }}
      onMouseLeave={(e) => { e.target.style.color = '' }}
    >
      {name}
    </span>
  )
}

// Module-level cache for releases_preview.json
let releasesCache = null

// Map Discogs styles to Ishkur genre names (approximate)
const STYLE_TO_GENRE = {
  'house': ['house', 'deep house', 'acid house', 'chicago house', 'garage house'],
  'deep house': ['deep house', 'garage/deep house'],
  'tech house': ['tech house'],
  'techno': ['techno', 'detroit techno', 'minimal techno'],
  'minimal': ['minimal techno', 'microhouse'],
  'trance': ['trance', 'eurotrance', 'vocal trance'],
  'ambient': ['ambient', 'dark ambient'],
  'drum n bass': ['drum and bass', 'liquid dnb', 'neurofunk'],
  'jungle': ['jungle'],
  'dubstep': ['dubstep'],
  'electro': ['electro', 'detroit electro'],
  'industrial': ['industrial', 'ebm'],
  'synth-pop': ['synthpop', 'synthwave'],
  'disco': ['disco', 'italo disco', 'nu-disco'],
  'downtempo': ['downtempo', 'trip hop'],
  'breakbeat': ['breakbeat', 'big beat'],
  'idm': ['idm', 'glitch'],
  'noise': ['noise', 'power electronics'],
  'gabber': ['gabber', 'happy hardcore'],
  'uk garage': ['2-step garage', 'speed garage'],
  'grime': ['grime'],
  'experimental': ['experimental'],
}

export default function GenrePanel() {
  const activeGenre = useStore(s => s.activeGenre)
  const releases = useStore(s => s.releases)
  const genres = useStore(s => s.genres)
  const links = useStore(s => s.links)
  const setActiveGenre = useStore(s => s.setActiveGenre)
  const setCameraTarget = useStore(s => s.setCameraTarget)
  const setPlayerQueue = useStore(s => s.setPlayerQueue)
  const currentTrack = useStore(s => s.currentTrack)
  const playing = useStore(s => s.playing)
  const setActiveLabel = useStore(s => s.setActiveLabel)
  const setActiveArtist = useStore(s => s.setActiveArtist)
  const [discogsReleases, setDiscogsReleases] = useState([])
  const [shareStatus, setShareStatus] = useState(null)
  const panelRef = useRef(null)

  const handleShare = useCallback(async () => {
    if (!activeGenre) return
    const url = `${window.location.origin}/?genre=${activeGenre.slug}&view=genre-world`
    const result = await shareGenre(activeGenre, url)
    if (result === 'copied') {
      setShareStatus('Copied!')
      setTimeout(() => setShareStatus(null), 2000)
    } else if (result === 'shared') {
      setShareStatus('Shared!')
      setTimeout(() => setShareStatus(null), 2000)
    }
  }, [activeGenre])

  // Focus the panel when it opens (for screen readers and keyboard nav)
  useEffect(() => {
    if (activeGenre && panelRef.current) {
      panelRef.current.focus()
    }
  }, [activeGenre])

  // Clear releases when no genre is selected
  const discogsForGenre = activeGenre ? discogsReleases : []

  // Load Discogs releases matching this genre (cached)
  useEffect(() => {
    if (!activeGenre) return

    const filterReleases = (data) => {
      const genreName = activeGenre.name.toLowerCase()
      const sceneName = activeGenre.scene.toLowerCase()

      const matches = data.releases.filter(r => {
        return r.styles.some(s => {
          const sl = s.toLowerCase()
          if (sl === genreName || sl === sceneName) return true
          for (const [discogsStyle, ishkurGenres] of Object.entries(STYLE_TO_GENRE)) {
            if (sl === discogsStyle && ishkurGenres.some(g => genreName.includes(g) || g.includes(genreName))) return true
          }
          if (sl.includes(genreName) || genreName.includes(sl)) return true
          return false
        })
      })

      matches.sort((a, b) => (b.year || '0').localeCompare(a.year || '0'))
      const top10 = matches.slice(0, 10)
      setDiscogsReleases(top10)

      // Auto-play first track with a YouTube link (only on genre change, not on track change)
      const playable = top10.find(r => r.youtube)
      if (playable) {
        const queue = top10
          .filter(r => r.youtube)
          .map(r => ({ artist: r.artist, title: r.title, year: r.year, genre: activeGenre.name, youtube: r.youtube }))
        if (queue.length > 0) {
          setPlayerQueue(queue, 0)
        }
      }
    }

    if (releasesCache) {
      filterReleases(releasesCache)
    } else {
      fetch('/data/releases_preview.json')
        .then(r => r.json())
        .then(data => {
          releasesCache = data
          filterReleases(data)
        })
        .catch(() => setDiscogsReleases([]))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGenre, setPlayerQueue])

  // Auto-play classic tracks if no Discogs releases matched
  useEffect(() => {
    if (!activeGenre) return
    const tracks = releases[activeGenre.slug] || []
    const playable = tracks.filter(t => t.youtube)
    if (playable.length > 0 && discogsReleases.length === 0) {
      setPlayerQueue(playable, 0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGenre, releases, discogsReleases, setPlayerQueue])

  const isTrackPlaying = (track) => {
    if (!currentTrack || !playing) return false
    return currentTrack.artist === track.artist && currentTrack.title === track.title
  }

  // Build related genres from links
  const relatedGenres = activeGenre ? (() => {
    const slugSet = new Set()
    links.forEach(l => {
      if (l.source === activeGenre.slug) slugSet.add(l.target)
      if (l.target === activeGenre.slug) slugSet.add(l.source)
    })
    const genreMap = {}
    genres.forEach(g => { genreMap[g.slug] = g })
    return [...slugSet].map(s => genreMap[s]).filter(Boolean).slice(0, 8)
  })() : []

  const handleRelatedClick = (genre) => {
    setActiveGenre(genre)
    setCameraTarget(genre)
  }

  if (!activeGenre) return null

  const tracks = releases[activeGenre.slug] || []

  return (
    <aside className="genre-panel" ref={panelRef} tabIndex={-1} role="complementary" aria-label={`Genre details: ${activeGenre.name}`}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: -4 }}>
        <button
          onClick={handleShare}
          aria-label="Share this genre"
          title="Share"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            padding: '4px 10px',
            color: shareStatus ? '#4ade80' : 'rgba(255,255,255,0.5)',
            fontSize: 11,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          {shareStatus || 'Share'}
        </button>
        <button className="close-btn" onClick={() => setActiveGenre(null)} aria-label="Close genre panel">&times;</button>
      </div>
      <h2 style={{ color: activeGenre.color }}>{activeGenre.name}</h2>
      <div className="scene-tag">{activeGenre.scene}</div>
      <div className="meta">
        Emerged: {activeGenre.emerged || 'Unknown'}<br />
        {activeGenre.aka && <>Also known as: {activeGenre.aka}<br /></>}
        Tracks: {activeGenre.trackCount}
      </div>

      {activeGenre.description && (
        <p className="genre-description">{activeGenre.description}</p>
      )}

      {/* Related genres */}
      {relatedGenres.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.4, marginBottom: 8 }}>
            Related
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {relatedGenres.map(g => (
              <button
                key={g.slug}
                onClick={() => handleRelatedClick(g)}
                aria-label={`Explore related genre: ${g.name}`}
                style={{
                  padding: '3px 10px',
                  borderRadius: 100,
                  fontSize: 11,
                  fontWeight: 500,
                  fontFamily: 'inherit',
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${g.color || 'rgba(255,255,255,0.1)'}33`,
                  color: g.color || 'rgba(255,255,255,0.6)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Discogs releases */}
      {discogsForGenre.length > 0 && (
        <>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.4, marginBottom: 8, marginTop: 16 }}>
            From Discogs — click to play
          </div>
          <ul className="tracks" role="list" aria-label="Discogs releases">
            {discogsForGenre.map((r, i) => {
              const active = isTrackPlaying(r)
              return (
                <li key={i} className={active ? 'track-playing' : ''} role="button" tabIndex={0} aria-label={`${active ? 'Now playing: ' : 'Play '}${r.artist} — ${r.title}, ${r.year}`} onClick={() => {
                  const queue = discogsForGenre.map(dr => ({ artist: dr.artist, title: dr.title, year: dr.year, genre: activeGenre.name, youtube: dr.youtube }))
                  setPlayerQueue(queue, i)
                }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const queue = discogsForGenre.map(dr => ({ artist: dr.artist, title: dr.title, year: dr.year, genre: activeGenre.name, youtube: dr.youtube })); setPlayerQueue(queue, i) } }}>
                  {active && <span className="playing-indicator" aria-hidden="true"><span /><span /><span /></span>}
                  <span className="artist"><ClickableArtist name={r.artist} onClick={setActiveArtist} /></span>
                  {' — '}
                  <span className="title">{r.title}</span>
                  <span className="year-tag">{r.year}</span>
                  {r.label && <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}><ClickableLabel name={r.label} onClick={setActiveLabel} />{r.catno ? ` [${r.catno}]` : ''}</div>}
                  {r.community && (
                    <div style={{ fontSize: 10, opacity: 0.4, marginTop: 2, display: 'flex', gap: 8 }}>
                      {r.community.want > 0 && <span title="Wanted">{r.community.want} want</span>}
                      {r.community.have > 0 && <span title="Have">{r.community.have} have</span>}
                      {r.community.rating_average > 0 && <span title="Rating">{'★'.repeat(Math.round(r.community.rating_average))}{' '}{r.community.rating_average.toFixed(1)}</span>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/* Ishkur sample tracks */}
      {tracks.length > 0 && (
        <>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.4, marginBottom: 8, marginTop: 16 }}>
            Classic Tracks
          </div>
          <ul className="tracks" role="list" aria-label="Classic tracks">
            {tracks.map((track, i) => {
              const active = isTrackPlaying(track)
              return (
                <li key={i} className={active ? 'track-playing' : ''} role="button" tabIndex={0} aria-label={`${active ? 'Now playing: ' : 'Play '}${track.artist} — ${track.title}, ${track.year}`} onClick={() => {
                  setPlayerQueue(tracks, i)
                }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlayerQueue(tracks, i) } }}>
                  {active && <span className="playing-indicator" aria-hidden="true"><span /><span /><span /></span>}
                  <span className="artist"><ClickableArtist name={track.artist} onClick={setActiveArtist} /></span>
                  {' — '}
                  <span className="title">{track.title}</span>
                  <span className="year-tag">{track.year}</span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </aside>
  )
}
