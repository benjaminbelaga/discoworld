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
 */
function buildDirectEmbedUrl(track) {
  const videoId = extractVideoId(track?.youtube)
  if (!videoId) return null
  return `https://www.youtube.com/embed/${videoId}?${embedParams()}`
}

/**
 * Build a search-based embed URL (listType=search).
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
  const [showVideo, setShowVideo] = useState(false)

  // Fallback stage: 0=direct, 1=search full, 2=search artist, 3=gave up
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
      setShowVideo(false)
      return
    }

    setShowSearchButton(false)
    setEmbedError(false)
    setFallbackStage(0)
    setShowVideo(false)

    const directUrl = buildDirectEmbedUrl(currentTrack)
    if (directUrl) {
      setEmbedUrl(directUrl)
      setIsPlaying(true)
      return
    }

    // No direct video ID — show search button
    setFallbackStage(3)
    setEmbedUrl(null)
    setShowSearchButton(true)
    setIsPlaying(false)
  }, [currentTrack])

  // Fallback timeout
  useEffect(() => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    if (!currentTrack || !embedUrl || fallbackStage === 0) return

    fallbackTimerRef.current = setTimeout(() => {
      if (fallbackStage === 1) {
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
        setFallbackStage(3)
        setShowSearchButton(true)
        setIsPlaying(false)
      }
    }, 5000)

    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    }
  }, [fallbackStage, embedUrl, currentTrack])

  // Listen for postMessage from YouTube iframe
  useEffect(() => {
    if (!embedUrl) return

    function handleMessage(event) {
      if (!event.origin.includes('youtube.com')) return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data?.event === 'onStateChange' && data?.info === 1) {
          if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
          setShowSearchButton(false)
          setIsPlaying(true)
        }
        if (data?.event === 'onStateChange' && data?.info === 0) {
          playNext()
        }
        if (data?.event === 'onError' || (data?.event === 'onStateChange' && data?.info === -1)) {
          setEmbedError(true)
        }
      } catch {
        // Not JSON
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [embedUrl, playNext])

  // When iframe reports an error, advance fallback stage
  useEffect(() => {
    if (!embedError || !currentTrack) return

    if (fallbackStage === 0) {
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
    setShowVideo(false)
  }, [setCurrentTrack, setPlaying, setAudioPlaying])

  function handlePrev() { playPrev() }
  function handleNext() { playNext() }

  function handleOpenYouTube() {
    const query = buildSearchQuery(currentTrack)
    if (query) {
      window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank')
    }
  }

  if (!currentTrack) return null

  const videoId = extractVideoId(currentTrack.youtube)
  const thumbnailUrl = videoId
    ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    : null
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

        {/* Hidden iframe for audio playback in collapsed mode */}
        {embedUrl && !showSearchButton && (
          <iframe
            ref={iframeRef}
            className="music-player-iframe-hidden"
            src={embedUrl}
            title={`Now playing: ${currentTrack.artist} — ${currentTrack.title}`}
            allow="autoplay; encrypted-media"
            allowFullScreen={false}
            onError={() => setEmbedError(true)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="music-player" role="region" aria-label={`Music player: ${currentTrack.artist} — ${currentTrack.title}`}>
      {/* Progress bar */}
      <div className="music-player-progress" style={{ width: isPlaying ? '100%' : '0%' }} aria-hidden="true" />

      {/* Hidden iframe for audio — always present, never visible */}
      {embedUrl && !showSearchButton && (
        <iframe
          ref={iframeRef}
          className="music-player-iframe-hidden"
          src={embedUrl}
          title={`Now playing: ${currentTrack.artist} — ${currentTrack.title}`}
          allow="autoplay; encrypted-media"
          allowFullScreen={false}
          onError={() => setEmbedError(true)}
        />
      )}

      {/* Thumbnail area */}
      <div
        className="music-player-thumb"
        onMouseEnter={() => setShowVideo(true)}
        onMouseLeave={() => setShowVideo(false)}
      >
        {thumbnailUrl ? (
          <img
            className="music-player-thumb-img"
            src={thumbnailUrl}
            alt={`${currentTrack.artist} — ${currentTrack.title}`}
            draggable={false}
          />
        ) : (
          <button
            className="music-player-yt-fallback"
            onClick={handleOpenYouTube}
            aria-label={`Search ${currentTrack.artist} — ${currentTrack.title} on YouTube`}
            title="Search on YouTube"
          >
            {showSearchButton ? 'YT' : '?'}
          </button>
        )}

        {/* PiP video popup on hover */}
        {showVideo && embedUrl && !showSearchButton && (
          <div className="music-player-pip">
            <iframe
              className="music-player-pip-iframe"
              src={embedUrl}
              title={`Video: ${currentTrack.artist} — ${currentTrack.title}`}
              allow="autoplay; encrypted-media"
              allowFullScreen={false}
            />
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="music-player-info">
        <div className="music-player-title">
          <span className="music-player-artist">{currentTrack.artist}</span>
          <span className="music-player-separator"> — </span>
          <span className="music-player-track-name">{currentTrack.title}</span>
          {currentTrack.genre && (
            <span className="music-player-genre-badge">{currentTrack.genre}</span>
          )}
        </div>
        <div className="music-player-meta">
          {currentTrack.year && <span>{currentTrack.year}</span>}
          {queueLabel && <span className="music-player-track-counter">{queueLabel}</span>}
        </div>
      </div>

      {/* Center playback controls */}
      <div className="music-player-controls" role="group" aria-label="Playback controls">
        {hasQueue && (
          <button
            className="music-player-btn music-player-btn--nav"
            onClick={handlePrev}
            aria-label="Previous track"
            title="Previous"
            disabled={!shuffleMode && playerIndex <= 0}
          >
            &#9198;
          </button>
        )}
        <button
          className="music-player-btn music-player-btn--play"
          onClick={handleOpenYouTube}
          aria-label={isPlaying ? 'Playing' : 'Open on YouTube'}
          title={isPlaying ? 'Playing' : 'Open on YouTube'}
        >
          {isPlaying ? '\u23F8' : '\u25B6'}
        </button>
        {hasQueue && (
          <button
            className="music-player-btn music-player-btn--nav"
            onClick={handleNext}
            aria-label="Next track"
            title="Next"
            disabled={!shuffleMode && playerIndex >= playerQueue.length - 1}
          >
            &#9197;
          </button>
        )}
      </div>

      {/* Right-side actions */}
      <div className="music-player-actions" role="group" aria-label="Player actions">
        {hasQueue && (
          <button
            className={`music-player-btn music-player-btn--sm${shuffleMode ? ' music-player-btn--active' : ''}`}
            onClick={toggleShuffle}
            aria-label={shuffleMode ? 'Disable shuffle' : 'Enable shuffle'}
            title={shuffleMode ? 'Shuffle on' : 'Shuffle off'}
          >
            &#8645;
          </button>
        )}
        {queueLabel && (
          <span className="music-player-queue-badge" title="Queue position">{queueLabel}</span>
        )}
        <button className="music-player-btn music-player-btn--sm" onClick={() => setCollapsed(true)} aria-label="Minimize player" title="Minimize">
          &#9660;
        </button>
        <button className="music-player-btn music-player-btn--sm music-player-btn--close" onClick={handleClose} aria-label="Close music player" title="Close">
          &times;
        </button>
      </div>
    </div>
  )
}
