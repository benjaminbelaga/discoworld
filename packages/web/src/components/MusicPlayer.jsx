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
  return `${track.artist} ${track.title}`.trim()
}

/**
 * Build the YouTube embed URL.
 * - If a direct video ID exists, embed that video.
 * - Otherwise, use the search list embed (works without the deprecated IFrame API listType).
 */
function buildEmbedUrl(track) {
  const videoId = extractVideoId(track?.youtube)
  const params = new URLSearchParams({
    autoplay: '1',
    controls: '0',
    modestbranding: '1',
    showinfo: '0',
    rel: '0',
    iv_load_policy: '3',
    disablekb: '1',
    fs: '0',
    playsinline: '1',
  })

  if (videoId) {
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`
  }

  const query = buildSearchQuery(track)
  if (!query) return null

  params.set('listType', 'search')
  params.set('list', query)
  return `https://www.youtube-nocookie.com/embed?${params}`
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
  const [volume, setVolume] = useState(80)
  const [embedUrl, setEmbedUrl] = useState(null)
  const [embedError, setEmbedError] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Sync audio reactivity
  useEffect(() => {
    setAudioPlaying(!!currentTrack)
  }, [currentTrack, setAudioPlaying])

  // Build embed URL when track changes
  useEffect(() => {
    if (!currentTrack) {
      setEmbedUrl(null)
      setEmbedError(false)
      setIsPlaying(false)
      return
    }

    const url = buildEmbedUrl(currentTrack)
    if (url) {
      setEmbedUrl(url)
      setEmbedError(false)
      setIsPlaying(true)
    } else {
      setEmbedUrl(null)
      setEmbedError(true)
      setIsPlaying(false)
    }
  }, [currentTrack])

  const handleClose = useCallback(() => {
    setEmbedUrl(null)
    setCurrentTrack(null)
    setPlaying(false)
    setAudioPlaying(false)
    setIsPlaying(false)
    setEmbedError(false)
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
        {embedUrl && !embedError ? (
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
            aria-label={`Play ${currentTrack.artist} — ${currentTrack.title} on YouTube`}
            title="Play on YouTube"
          >
            ▶ YT
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
