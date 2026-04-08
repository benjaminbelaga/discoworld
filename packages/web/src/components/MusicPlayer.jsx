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
function buildSearchQuery(track) {
  if (!track) return ''
  return `${track.artist || ''} ${track.title || ''} full`.trim()
}

/**
 * Format seconds to m:ss display.
 */
function formatTime(s) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
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

  const playerRef = useRef(null)
  const progressInterval = useRef(null)
  const apiReadyRef = useRef(false)
  const ytContainerRef = useRef(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [showSearchButton, setShowSearchButton] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  // Sync audio reactivity
  useEffect(() => {
    setAudioPlaying(!!currentTrack)
  }, [currentTrack, setAudioPlaying])

  // Load YouTube IFrame API once
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      apiReadyRef.current = true
      return
    }
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return

    window.onYouTubeIframeAPIReady = () => {
      apiReadyRef.current = true
      // Trigger re-render by dispatching a custom event
      window.dispatchEvent(new Event('yt-api-ready'))
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  }, [])

  // Listen for API ready if it wasn't loaded yet
  const [ytReady, setYtReady] = useState(() => !!(window.YT && window.YT.Player))
  useEffect(() => {
    if (ytReady) return
    function onReady() {
      apiReadyRef.current = true
      setYtReady(true)
    }
    window.addEventListener('yt-api-ready', onReady)
    return () => window.removeEventListener('yt-api-ready', onReady)
  }, [ytReady])

  // Stable callback refs for playNext to avoid re-creating player on playNext change
  const playNextRef = useRef(playNext)
  useEffect(() => { playNextRef.current = playNext }, [playNext])

  // Create/destroy YT.Player when track changes
  useEffect(() => {
    if (!currentTrack) {
      // Destroy player
      if (playerRef.current) {
        playerRef.current.destroy()
        playerRef.current = null
      }
      if (progressInterval.current) clearInterval(progressInterval.current)
      setIsPlaying(false)
      setShowSearchButton(false)
      setProgress(0)
      setDuration(0)
      setCurrentTime(0)
      setShowVideo(false)
      return
    }

    const videoId = extractVideoId(currentTrack.youtube)
    if (!videoId) {
      setShowSearchButton(true)
      setIsPlaying(false)
      // Auto-advance if queue has more tracks
      if (playerQueue.length > 1) {
        const t = setTimeout(() => playNextRef.current(), 1500)
        return () => clearTimeout(t)
      }
      return
    }

    if (!ytReady || !window.YT?.Player) return

    setShowSearchButton(false)
    setProgress(0)
    setDuration(0)
    setCurrentTime(0)

    // Destroy previous player
    if (playerRef.current) {
      playerRef.current.destroy()
      playerRef.current = null
    }
    if (progressInterval.current) clearInterval(progressInterval.current)

    // Use the DOM element ref if available, fallback to ID string
    const targetEl = ytContainerRef.current || 'yt-player-hidden'
    playerRef.current = new window.YT.Player(targetEl, {
      videoId,
      playerVars: {
        autoplay: 1,
        controls: 0,
        modestbranding: 1,
        rel: 0,
        enablejsapi: 1,
        playsinline: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: (e) => {
          const d = e.target.getDuration()
          setDuration(d)
          setIsPlaying(true)
          // Poll progress
          if (progressInterval.current) clearInterval(progressInterval.current)
          progressInterval.current = setInterval(() => {
            if (playerRef.current?.getCurrentTime) {
              const t = playerRef.current.getCurrentTime()
              const dur = playerRef.current.getDuration()
              setCurrentTime(t)
              setDuration(dur)
              setProgress(dur > 0 ? t / dur : 0)
            }
          }, 500)
        },
        onStateChange: (e) => {
          // 0=ended, 1=playing, 2=paused
          if (e.data === 0) playNextRef.current()
          if (e.data === 1) setIsPlaying(true)
          if (e.data === 2) setIsPlaying(false)
        },
        onError: () => {
          setIsPlaying(false)
          // Auto-advance on embed error if queue has more tracks
          if (playerQueue.length > 1) {
            setTimeout(() => playNextRef.current(), 1500)
          }
        },
      },
    })

    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current)
      // Destroy player on unmount to prevent iframe/audio leaks
      if (playerRef.current) {
        try { playerRef.current.destroy() } catch {}
        playerRef.current = null
      }
    }
  }, [currentTrack, ytReady])

  // Seek handler
  function handleSeek(e) {
    const bar = e.currentTarget
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    if (playerRef.current?.seekTo && duration > 0) {
      playerRef.current.seekTo(ratio * duration, true)
      setProgress(ratio)
      setCurrentTime(ratio * duration)
    }
  }

  // Play/Pause toggle
  function handlePlayPause() {
    if (!playerRef.current) return
    if (isPlaying) {
      playerRef.current.pauseVideo()
    } else {
      playerRef.current.playVideo()
    }
  }

  const handleClose = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.destroy()
      playerRef.current = null
    }
    if (progressInterval.current) clearInterval(progressInterval.current)
    setCurrentTrack(null)
    setPlaying(false)
    setAudioPlaying(false)
    setIsPlaying(false)
    setShowSearchButton(false)
    setCollapsed(false)
    setShowVideo(false)
    setProgress(0)
    setDuration(0)
    setCurrentTime(0)
  }, [setCurrentTrack, setPlaying, setAudioPlaying])

  function handlePrev() { playPrev() }
  function handleNext() { playNext() }

  function handleOpenYouTube() {
    const query = buildSearchQuery(currentTrack)
    if (query) {
      window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank')
    }
  }

  const videoId = currentTrack ? extractVideoId(currentTrack.youtube) : null
  const thumbnailUrl = videoId
    ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    : null
  const hasQueue = playerQueue.length > 1
  const queueLabel = hasQueue ? `${playerIndex + 1} / ${playerQueue.length}` : null

  // Single stable YT container + conditional player UI
  return (
    <>
    {/* YT player container — ALWAYS in DOM, never moves between branches */}
    <div id="yt-player-hidden" ref={ytContainerRef} className="music-player-iframe-hidden" />

    {/* No track — nothing else to render */}
    {!currentTrack ? null : collapsed ? (
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
        <button className="music-player-btn" onClick={handlePlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? '\u23F8' : '\u25B6'}
        </button>
        {hasQueue && (
          <button className="music-player-btn" onClick={handleNext} aria-label="Next" disabled={!shuffleMode && playerIndex >= playerQueue.length - 1}>&#9197;</button>
        )}
        <button className="music-player-close" onClick={handleClose} aria-label="Close">&times;</button>
      </div>
    ) : (
    <div className="music-player" role="region" aria-label={`Music player: ${currentTrack.artist} — ${currentTrack.title}`}>
      {/* Seek bar at top */}
      <div
        className="music-player-seekbar"
        onClick={handleSeek}
        role="slider"
        aria-label="Seek"
        aria-valuenow={Math.round(currentTime)}
        aria-valuemax={Math.round(duration)}
        tabIndex={0}
      >
        <div className="music-player-seekbar-fill" style={{ width: `${progress * 100}%` }} />
        <div className="music-player-seekbar-thumb" style={{ left: `${progress * 100}%` }} />
      </div>

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

        {/* PiP video popup on hover — uses same player, just repositioned */}
        {showVideo && videoId && !showSearchButton && (
          <div className="music-player-pip">
            <iframe
              className="music-player-pip-iframe"
              src={`https://www.youtube.com/embed/${videoId}?autoplay=0&controls=1&modestbranding=1&rel=0&playsinline=1`}
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
          <span className="music-player-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
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
          onClick={handlePlayPause}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={isPlaying ? 'Pause' : 'Play'}
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
    )}
    </>
  )
}
