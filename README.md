<p align="center">
  <h1 align="center">DiscoWorld</h1>
  <p align="center"><strong>What if you could explore all electronic music as a 3D world?</strong><br>
  Navigate 166 genres, 4.87 million releases, and 50 years of history — on a planet made of sound.</p>
</p>

[![DiscoWorld](https://world.yoyaku.io/social-preview.png)](https://world.yoyaku.io)

[![CI](https://github.com/benjaminbelaga/disco-gy-world/actions/workflows/ci.yml/badge.svg)](https://github.com/benjaminbelaga/disco-gy-world/actions)
[![AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Data: CC0](https://img.shields.io/badge/data-CC0-green.svg)](DATA-LICENSE.md)
[![Tests: 346](https://img.shields.io/badge/tests-346-brightgreen.svg)](#testing)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react)](https://react.dev)
[![Three.js](https://img.shields.io/badge/Three.js-r183-black.svg?logo=three.js)](https://threejs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## What is DiscoWorld?

DiscoWorld maps millions of music releases into an explorable 3D world where spatial proximity reflects musical similarity. Navigate by genre, geography, and time. Click any release to listen via the inline YouTube player. Connect your Discogs collection to see your musical footprint.

### Three ways to explore

| View | What you see |
|------|-------------|
| **Genre World** | A procedural planet where genres form continents. Techno mountains, ambient oceans, house plains. Each territory has its own ambient soundscape synthesized in real-time. Buildings grow as sub-genres emerge through decades. |
| **Earth Globe** | Real-world geography with 7K+ record shops, 30K geocoded labels, and city scenes from Detroit to Berlin to Tokyo. Distribution arcs trace how genres traveled across continents. |
| **Genre Planet** | Orbital view of the genre universe. Zoom into clusters, see connections between genres, explore the full taxonomy at a glance. |

### Key features

- **166 electronic genres** mapped to 13 biomes with unique terrain, color palettes, and synthesized ambient audio
- **4.87M releases** from the Discogs CC0 dataset, each positioned in the world
- **Inline music player** — click any release to play via YouTube, no tab switching. Auto-queue, shuffle, seek bar, favorites
- **Biome soundscapes** — procedural ambient audio per territory via Web Audio API
- **7,121 record shops** from OpenStreetMap on the Earth Globe
- **30,188 labels** geocoded from the Discogs dump across 81 cities
- **Discogs collection sync** — connect your account, see your musical footprint
- **"Describe a vibe"** — natural language search lands you in the right neighborhood
- **Collection Passport** — shareable card showing your musical DNA
- **Crate Neighbors** — find collectors with similar taste
- **Recommendations** — hybrid collaborative + content-based filtering
- **Community genre editing** — propose changes, vote on edits, earn contributor points
- **8 curated dig paths** — preset journeys like "Detroit to Berlin" and "Birth of House"
- **Social sharing** — generate OG images, share discoveries via Web Share API
- **Plugin API** — any record store can integrate via RecordStoreAdapter ([docs](docs/PLUGINS.md))

---

## Quick Start

```bash
# Clone
git clone https://github.com/benjaminbelaga/disco-gy-world.git
cd disco-gy-world

# Frontend
cd packages/web
npm install
npm run dev
# Open http://localhost:5173

# API (in another terminal)
cd packages/api
pip install fastapi uvicorn httpx requests pydantic
cd ../..
python3 -m uvicorn packages.api.main:app --port 8000

# Optional: set env vars for Discogs features (see packages/api/main.py for required variables)
# DISCOGS_CONSUMER_KEY, DISCOGS_CONSUMER_SECRET, DISCOGS_TOKEN
```

> **Note:** The 3D world loads from pre-built static JSON files in `packages/web/public/data/`. No database needed for basic exploration. The SQLite DB is only needed for search, recommendations, and collection features.

### Building the database (optional)

```bash
# Download Discogs CC0 dump (~7GB compressed)
mkdir -p data/discogs-dump
# See packages/pipeline/README.md for download instructions

# Build the database
cd packages/pipeline
pip install -r requirements.txt
python build_db.py
```

---

## Technical Highlights

| Metric | Value |
|--------|-------|
| Releases processed | 4.87 million (Discogs CC0 dump) |
| Genre territories | 166 across 13 biomes |
| Record shops | 7,121 from OpenStreetMap |
| Labels geocoded | 30,188 across 81 cities |
| MusicBrainz matches | 80% match rate with cover art |
| Automated tests | 346 (API, pipeline, frontend, E2E) |
| External audio files | Zero — biome audio is procedurally synthesized |

---

## Architecture

```
packages/
├── web/           React + Three.js + globe.gl frontend
│   ├── src/
│   │   ├── components/    40+ React components (GenreWorld, EarthGlobe, GenrePlanet, ...)
│   │   ├── stores/        Zustand state management
│   │   └── lib/           Core libraries
│   │       ├── plugins/       RecordStoreAdapter plugin system
│   │       ├── strudelPatterns.js  Genre→Strudel pattern generator
│   │       ├── soundscape.js      Procedural biome ambient audio
│   │       ├── shareCard.js       OG image generator (canvas)
│   │       ├── buildingSystem.js  Procedural genre architecture
│   │       └── driftEngine.js     Serendipity auto-navigation
│   └── e2e/           Playwright browser tests
├── api/           FastAPI Python backend (16 routers)
│   ├── routes/        genres, releases, search, auth, collection, recommendations,
│   │                  artists, cities, labels, shops, paths, taste_profile,
│   │                  personal_reco, crate_neighbors, contributors, genre_edits
│   └── tests/         103 API tests
└── pipeline/      Python data processing (15+ scripts)
    ├── build_db.py                 Orchestrator (XML → SQLite)
    ├── taxonomy_bridge.py          Discogs ↔ Ishkur genre mapping
    ├── similarity_index.py         Content-based recommendation engine
    ├── extract_label_locations.py  Label geocoding from Discogs dump
    ├── musicbrainz_crossref.py     MusicBrainz enrichment + cover art
    ├── enrich_community_stats.py   Discogs have/want/ratings
    └── extract_record_shops.py     OpenStreetMap vinyl shop extraction
```

### Data Flow

```
Discogs Monthly Dump (CC0, ~7GB) ──► XML stream parser
                                          │
                                          ▼
                                    SQLite database
                                          │
                    ┌─────────────┬────────┼────────┬──────────────┐
                    ▼             ▼        ▼        ▼              ▼
              Genre mapping   Similarity  Heightmap  Label       Record
              (taxonomy      (content    generation  geocoding   shop
               bridge)        vectors)   (BPM→elev)  (30K)      extraction
                    │             │        │          │           (7K+)
                    └─────────────┴────────┼──────────┴───────────┘
                                           ▼
                                    Static JSON files
                                    (world.json, cities.json, ...)
                                           │
                                           ▼
                                    Three.js / globe.gl
                                    (browser, zero server needed for 3D)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vite + React 19 + Zustand |
| **3D (Genre World)** | Three.js + React Three Fiber + drei (InstancedMesh, custom shaders, selective bloom) |
| **3D (Earth Globe)** | globe.gl (WebGL globe with arcs, points, HTML markers) |
| **Live Coding** | Strudel (TidalCycles for the browser) |
| **Audio** | Web Audio API (procedural biome soundscapes) |
| **Backend** | FastAPI (Python 3.11+) |
| **Database** | SQLite (main data + user data) |
| **Testing** | pytest + Vitest + Playwright |
| **CI** | GitHub Actions (3 parallel test jobs on PR) |

---

## World Design

The Genre World planet maps musical properties to terrain:

| Musical Property | Terrain |
|---|---|
| BPM | Elevation (70 BPM = sea level, 170+ = volcanic summits) |
| Energy / Darkness | Temperature + weather |
| Harmonic complexity | Vegetation density |
| Release volume | Territory area + building density |
| Influence between genres | Rivers connecting territories |

**13 biomes** — from the Techno Massif (basalt mountains, brutalist bunkers) to the Ambient Depths (ethereal harmonic drones) to the Disco Riviera (coastal resorts, mirror-ball lighthouses).

Each biome has its own procedurally generated ambient soundscape — no audio files, just oscillators, filters, and LFOs creating an immersive atmosphere.

---

## Testing

346 automated tests across 4 layers:

```bash
# API tests (103 tests)
python3 -m pytest packages/api/tests/ -v

# Pipeline tests (63+ tests)
python3 -m pytest packages/pipeline/tests/ -v

# Frontend unit tests (137+ tests)
cd packages/web && npx vitest run

# Playwright E2E browser tests (43+ tests)
cd packages/web && npx playwright test
```

---

## Contributing

We welcome contributions from everyone! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Five contributor roles:**

| Role | What you do |
|------|------------|
| **Genre Cartographers** | Refine genre boundaries, connections, and descriptions |
| **City Scouts** | Add cities and their musical scenes to Earth Mode |
| **Crate Curators** | Suggest tracks that define a genre neighborhood |
| **Data Enrichers** | Improve release metadata and genre classifications |
| **Visual Builders** | Build UI components, shaders, and 3D features |

All contributions earn points on the [contributor leaderboard](docs/PLUGINS.md).

---

## Data Sources

| Source | What | License |
|--------|------|---------|
| [Discogs Data Dumps](https://discogs-data-dumps.s3.us-west-2.amazonaws.com/index.html) | 4.87M releases, artists, labels | CC0 |
| [Ishkur's Guide to Electronic Music](https://music.ishkur.com/) | 167 genres, 353 connections, 11K tracks | Community |
| [OpenStreetMap](https://www.openstreetmap.org/) | 7,121 record/music shops worldwide | ODbL |
| [MusicBrainz](https://musicbrainz.org/) | Release metadata, cover art | CC0 |
| [Discogs API](https://www.discogs.com/developers/) | Collections, community stats | Free |

---

## License

- **Code:** [AGPL-3.0](LICENSE) — use it, modify it, but share your changes
- **Community data** (genre mappings, city coordinates, taxonomy): [CC0](DATA-LICENSE.md) — public domain

---

## Credits

- [Ishkur's Guide to Electronic Music](https://music.ishkur.com/) — the original genre map that inspired this project
- [Discogs](https://www.discogs.com/) — for the CC0 data dumps that make this possible
- [Strudel](https://strudel.cc/) — live coding engine for browser-based music
- [Every Noise at Once](https://everynoise.com/) — proof that algorithmic genre mapping works
- [Radiooooo](https://radiooooo.com/) — pioneering geographic music discovery

---

Created by [Benjamin Belaga](https://github.com/benjaminbelaga), who runs [YOYAKU](https://yoyaku.io) records in Paris.
