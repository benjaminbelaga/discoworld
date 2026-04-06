import { useEffect, useRef, useState, useCallback } from 'react'
import useStore from '../stores/useStore'
import useAudioStore from '../stores/useAudioStore'
import './MusicPlayer.css'

/**
 * Extract a YouTube video ID from various URL formats.
 */
function extractVideoId(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v')
    if (u.hostname === 'youtu.be') return u.pathname.slice(1)
  } catch {
    return null
  }
  return null
}

/**
 * Build a search query string for YouTube.
 */
function buildSearchQuery(track, artistOnly = false) {
  if (!track) return ''
  if (artistOnly) return (track.artist || '').trim()
  return `${track.artist || ''} ${track.title || ''} full`.trim()
}

/**
 * Build a YouTube search URL that opens in a new tab.
 */
function buildYouTubeSearchUrl(track) {
  const query = buildSearchQuery(track)
  if (!query) return null
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}

/**
 * Embed URL params shared across all embed types.
 */
function embedParams() {
  const params = new URLSearchParams({
    autoplay: '1',
    controls: '1',
    modestbranding: '1',
    rel: '0',
    iv_load_policy: '3',
    fs: '0',
    playsinline: '1',
    enablejsapi: '1',
  })
  try { params.set('origin', window.location.origin) } catch {}
  return params
}

/**
 * Build the YouTube embed URL for a direct video ID.
 * Returns null if the track has no youtube field or invalid URL.
 */
function buildDirectEmbedUrl(track) {
  const videoId = extractVideoId(track?.youtube)
  if (!videoId) return null
  return `https://www.youtube.com/embed/${videoId}?${embedParams()}`
}

/**
 * Build a search-based embed URL (listType=search — deprecated but still works in some browsers).
 * Used as a best-effort attempt before showing the manual search button.
 */
function buildSearchEmbedUrl(track, artistOnly = false) {
  const query = buildSearchQuery(track, artistOnly)
  if (!query) return null
  const params = embedParams()
  return `https://www.youtube.com/embed?${params}&listType=search&list=${encodeURIComponent(query)}`
}

export default function MusicPlayer() {
  const currentTrack = useStore(s => s.currentTrack)
  const setPlaying = useStore(s => s.setPlaying)
  const setCurrentTrack = useStore(s => s.setCurrentTrack)
  const playerQueue = useStore(s => s.playerQueue)
  const playerIndex = useStore(s => s.playerIndex)
  const playNext = useStore(s => s.playNext)
  const playPrev = useStore(s => s.playPrev)
  const shuffleMode = useStore(s => s.shuffleMode)
  const toggleShuffle = useStore(s => s.toggleShuffle)
  const setAudioPlaying = useAudioStore(s => s.setPlaying)

  const iframeRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [embedUrl, setEmbedUrl] = useState(null)
  const [embedError, setEmbedError] = useState(false)
  const [showSearchButton, setShowSearchButton] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Track which fallback stage we're at:
  // 0 = direct video ID, 1 = search embed (full query), 2 = search embed (artist only), 3 = gave up
  const [fallbackStage, setFallbackStage] = useState(0)
  const fallbackTimerRef = useRef(null)

  // Sync audio reactivity
  useEffect(() => {
    setAudioPlaying(!!currentTrack)
  }, [currentTrack, setAudioPlaying])

  // Clear fallback timer on unmount
  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    }
  }, [])

  // Build embed URL when track changes
  useEffect(() => {
    if (!currentTrack) {
      setEmbedUrl(null)
      setEmbedError(false)
      setShowSearchButton(false)
      setIsPlaying(false)
      setFallbackStage(0)
      return
    }

    setShowSearchButton(false)
    setEmbedError(false)
    setFallbackStage(0)

    // Try direct video ID first
    const directUrl = buildDirectEmbedUrl(currentTrack)
    if (directUrl) {
      setEmbedUrl(directUrl)
      setIsPlaying(true)
      return
    }

    // No direct video ID — skip dead search embed, show search button immediately
    setFallbackStage(3)
    setEmbedUrl(null)
    setShowSearchButton(true)
    setIsPlaying(false)
  }, [currentTrack])

  // Fallback timeout: if search embed doesn't seem to play within 5s, try next stage
  useEffect(() => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    if (!currentTrack || !embedUrl || fallbackStage === 0) return

    fallbackTimerRef.current = setTimeout(() => {
      if (fallbackStage === 1) {
        // Full search failed — try artist-only search
        setFallbackStage(2)
        const artistUrl = buildSearchEmbedUrl(currentTrack, true)
        if (artistUrl) {
          setEmbedUrl(artistUrl)
        } else {
          setFallbackStage(3)
          setShowSearchButton(true)
          setIsPlaying(false)
        }
      } else if (fallbackStage === 2) {
        // Artist-only search also failed — show search button, don't auto-skip
        setFallbackStage(3)
        setShowSearchButton(true)
        setIsPlaying(false)
      }
    }, 5000)

    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    }
  }, [fallbackStage, embedUrl, currentTrack])

  // Listen for postMessage from YouTube iframe to detect playback
  useEffect(() => {
    if (!embedUrl) return

    function handleMessage(event) {
      // YouTube sends messages from its embed origin
      if (!event.origin.includes('youtube.com')) return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        // YouTube IFrame API sends info with playerState: 1 = playing
        if (data?.event === 'onStateChange' && data?.info === 1) {
          // Video is playing — cancel fallback timer
          if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
          setShowSearchButton(false)
          setIsPlaying(true)
        }
        // playerState 150 or -1 can indicate "unplayable"
        if (data?.event === 'onError' || (data?.event === 'onStateChange' && data?.info === -1)) {
          setEmbedError(true)
        }
      } catch {
        // Not JSON — ignore
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [embedUrl])

  // When iframe reports an error, advance fallback stage
  useEffect(() => {
    if (!embedError || !currentTrack) return

    if (fallbackStage === 0) {
      // Direct embed failed — try search
      setFallbackStage(1)
      setEmbedError(false)
      const searchUrl = buildSearchEmbedUrl(currentTrack, false)
      if (searchUrl) {
        setEmbedUrl(searchUrl)
      } else {
        setShowSearchButton(true)
        setIsPlaying(false)
      }
    } else if (fallbackStage === 1) {
      // Full search failed — try artist only
      setFallbackStage(2)
      setEmbedError(false)
      const artistUrl = buildSearchEmbedUrl(currentTrack, true)
      if (artistUrl) {
        setEmbedUrl(artistUrl)
      } else {
        setFallbackStage(3)
        setShowSearchButton(true)
        setIsPlaying(false)
      }
    } else {
      // All failed — show button, don't auto-skip
      setFallbackStage(3)
      setShowSearchButton(true)
      setIsPlaying(false)
      setEmbedError(false)
    }
  }, [embedError, currentTrack, fallbackStage])

  const handleClose = useCallback(() => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    setEmbedUrl(null)
    setCurrentTrack(null)
    setPlaying(false)
    setAudioPlaying(false)
    setIsPlaying(false)
    setEmbedError(false)
    setShowSearchButton(false)
    setFallbackStage(0)
    setCollapsed(false)
  }, [setCurrentTrack, setPlaying, setAudioPlaying])

  function handlePrev() {
    playPrev()
  }

  function handleNext() {
    playNext()
  }

  function handleOpenYouTube() {
    const query = buildSearchQuery(currentTrack)
    if (query) {
      window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank')
    }
  }

  if (!currentTrack) return null

  const hasQueue = playerQueue.length > 1
  const queueLabel = hasQueue ? `${playerIndex + 1} / ${playerQueue.length}` : null

  // Collapsed mini-bar
  if (collapsed) {
    return (
      <div className="music-player music-player--collapsed" role="region" aria-label="Music player (minimized)">
        <button className="music-player-expand" onClick={() => setCollapsed(false)} aria-label="Expand player" title="Expand">
          &#9650;
        </button>
        <div className="music-player-info music-player-info--collapsed">
          <span className="music-player-title music-player-title--collapsed">
            {currentTrack.artist} — {currentTrack.title}
          </span>
        </div>
        {hasQueue && (
          <button className="music-player-btn" onClick={handlePrev} aria-label="Previous" disabled={!shuffleMode && playerIndex <= 0}>&#9198;</button>
        )}
        {hasQueue && (
          <button className="music-player-btn" onClick={handleNext} aria-label="Next" disabled={!shuffleMode && playerIndex >= playerQueue.length - 1}>&#9197;</button>
        )}
        <button className="music-player-close" onClick={handleClose} aria-label="Close">&times;</button>
      </div>
    )
  }

  return (
    <div className="music-player" role="region" aria-label={`Music player: ${currentTrack.artist} — ${currentTrack.title}`}>
      {/* Progress bar — decorative thin line at top */}
      <div className="music-player-progress" style={{ width: isPlaying ? '100%' : '0%' }} aria-hidden="true" />

      {/* YouTube video thumbnail — replaces spinning vinyl disc */}
      <div className="music-player-video">
        {embedUrl && !showSearchButton ? (
          <iframe
            ref={iframeRef}
            className="music-player-iframe"
            src={embedUrl}
            title={`Now playing: ${currentTrack.artist} — ${currentTrack.title}`}
            allow="autoplay; encrypted-media"
            allowFullScreen={false}
            onError={() => setEmbedError(true)}
          />
        ) : (
          <button
            className="music-player-yt-fallback"
            onClick={handleOpenYouTube}
            aria-label={`Search ${currentTrack.artist} — ${currentTrack.title} on YouTube`}
            title="Search on YouTube"
          >
            {showSearchButton ? '🔍 Search YouTube' : '▶ YT'}
          </button>
        )}
      </div>

      {/* Track info */}
      <div className="music-player-info">
        <div className="music-player-title">
          {currentTrack.artist} — {currentTrack.title}
          {currentTrack.genre && (
            <span className="music-player-genre-badge">{currentTrack.genre}</span>
          )}
        </div>
        <div className="music-player-meta">
          {currentTrack.year && currentTrack.year}
          {queueLabel && <span className="music-player-track-counter">{queueLabel}</span>}
        </div>
      </div>

      {/* Controls */}
      <div className="music-player-controls" role="group" aria-label="Playback controls">
        {hasQueue && (
          <button
            className={`music-player-btn${shuffleMode ? ' music-player-btn--active' : ''}`}
            onClick={toggleShuffle}
            aria-label={shuffleMode ? 'Disable shuffle' : 'Enable shuffle'}
            title={shuffleMode ? 'Shuffle on' : 'Shuffle off'}
          >
            &#8645;
          </button>
        )}
        {hasQueue && (
          <button
            className="music-player-btn"
            onClick={handlePrev}
            aria-label="Previous track"
            title="Previous"
            disabled={!shuffleMode && playerIndex <= 0}
          >
            &#9198;
          </button>
        )}
        {hasQueue && (
          <button
            className="music-player-btn"
            onClick={handleNext}
            aria-label="Next track"
            title="Next"
            disabled={!shuffleMode && playerIndex >= playerQueue.length - 1}
          >
            &#9197;
          </button>
        )}
      </div>

      {/* Collapse */}
      <button className="music-player-collapse" onClick={() => setCollapsed(true)} aria-label="Minimize player" title="Minimize">
        &#9660;
      </button>

      {/* Close */}
      <button className="music-player-close" onClick={handleClose} aria-label="Close music player" title="Close">
        &times;
      </button>
    </div>
  )
}
