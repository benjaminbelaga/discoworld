import { useMemo } from 'react'
import useStore from '../stores/useStore'

export default function Timeline() {
  const year = useStore(s => s.year)
  const setYear = useStore(s => s.setYear)
  const genres = useStore(s => s.genres)

  const visibleCount = useMemo(
    () => genres.filter(g => g.year <= year).length,
    [genres, year]
  )

  return (
    <div className="timeline-bar">
      <span className="timeline-icon" aria-hidden="true">&#128336;</span>
      <span className="timeline-bound">1960</span>
      <input
        type="range"
        min={1960}
        max={2026}
        value={year}
        onChange={(e) => setYear(parseInt(e.target.value))}
        aria-label="Timeline year"
        aria-valuetext={`${year}, ${visibleCount} genre${visibleCount !== 1 ? 's' : ''} visible`}
      />
      <span className="year-label">{year}</span>
      {visibleCount > 0 && (
        <span className="timeline-count">
          {visibleCount} genre{visibleCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}
