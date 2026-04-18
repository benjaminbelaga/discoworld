// Night Atlas color palette — audit 2026-04-17 AGENT-A Pattern 2 + AGENT-C.
//
// Replaces the legacy per-genre random colors (clown palette) with a
// deterministic 5-continent accent system that blends smoothly across
// scene boundaries. Adjacent genres share a base hue; gold is reserved
// for user data (active genre, current city, dig-path trail).
//
// No external noise dependency — a cheap hash of scene+slug is enough
// for the "noise-varied color, organic continents" effect Agent A spec'd.

import * as THREE from 'three'

// Five warm accent hues from AGENT-C §Chosen palette.
export const CONTINENT_ACCENTS = [
  '#c4956a', // gold (YOYAKU brand)
  '#d4a574', // sand
  '#a86b47', // terracotta
  '#8b7355', // bronze
  '#6b8e7f', // sage (cool counter)
]

export const GOLD_USER_ACCENT = '#e8b87a'

// Deterministic string → 32-bit hash (FNV-1a). Stable across reloads.
function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Hash a scene key to a primary + secondary accent index. Same scene
// always lands on the same continent → all minimal-techno genres share
// a tonal family. Linking to a second accent produces smooth blending
// at scene boundaries.
function sceneAccents(scene) {
  const h = hashString(scene || 'default')
  const primary = h % CONTINENT_ACCENTS.length
  const secondary = (h >>> 8) % CONTINENT_ACCENTS.length
  return { primary, secondary: secondary === primary ? (primary + 1) % CONTINENT_ACCENTS.length : secondary }
}

const _a = new THREE.Color()
const _b = new THREE.Color()
const _out = new THREE.Color()

// Derive the Night Atlas color for a genre. Caller passes the raw
// genre record {slug, scene, x, y, z}. Returns a hex string.
export function deriveAtlasColor(genre) {
  const { primary, secondary } = sceneAccents(genre.scene)
  _a.set(CONTINENT_ACCENTS[primary])
  _b.set(CONTINENT_ACCENTS[secondary])
  // Per-genre t in [0, 1] — hash of slug gives deterministic variation.
  // Bias toward 0 (more primary-weighted) so each scene has a dominant hue
  // but subgenres bleed toward the secondary accent.
  const slugHash = hashString(genre.slug || genre.name || 'x')
  const t = 0.15 + ((slugHash & 0xff) / 255) * 0.35  // [0.15, 0.50]
  _out.copy(_a).lerp(_b, t)
  // Luminance jitter from (x+z) position — keeps same-scene genres
  // readable against each other without breaking the continent feel.
  const lumJitter = ((genre.x || 0) * 13.37 + (genre.z || 0) * 7.11) % 1
  const lumScale = 0.88 + Math.abs(lumJitter) * 0.24  // [0.88, 1.12]
  _out.multiplyScalar(lumScale)
  // Clamp
  _out.r = Math.min(1, _out.r)
  _out.g = Math.min(1, _out.g)
  _out.b = Math.min(1, _out.b)
  return '#' + _out.getHexString()
}

// Enrichment pass — call once after world.json load in the store.
// Mutates each genre in place: `color` is rewritten to the Night Atlas
// derive so every downstream renderer (spheres, labels, glow rings,
// links, scene web, constellation) picks up the new palette with zero
// other edits. Original color is preserved as `originalColor` for any
// future revert / debug.
export function enrichGenresWithAtlasColor(genres) {
  for (const g of genres) {
    const atlas = deriveAtlasColor(g)
    if (g.color !== atlas) g.originalColor = g.color
    g.color = atlas
    g.atlasColor = atlas
  }
  return genres
}
