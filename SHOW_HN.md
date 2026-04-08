# Show HN: DiscoWorld – 4.87M electronic releases you can explore and listen to on a 3D planet

Every Noise at Once mapped music genres spatially until Spotify killed it in 2023. Nothing replaced it. I built DiscoWorld to fill that gap, specifically for electronic music.

The entire Discogs electronic catalogue (4.87M releases) is mapped onto a procedural planet. 166 genre territories arranged by sonic similarity, each with its own terrain biome. Techno gets industrial canyons. Ambient gets bioluminescent valleys. Drum & bass gets jagged peaks.

**You can actually listen.** Click any release and a YouTube player loads inline — no leaving the planet, no new tab. Queue builds automatically as you explore a genre territory. Favorites persist. Seek bar works.

Two exploration modes:

**Genre Planet** — Walk the terrain by genre. Buildings grow taller as sub-genres branch across decades. Ambient soundscape plays for each biome. Timeline slider shows how genres evolved from 1975 to today.

**Earth Globe** — Real geography. 7,000+ record shops from OpenStreetMap. Distribution arcs tracing Detroit techno → Berlin, Chicago house → UK. City panels with local release history.

**Discovery** — Connect Discogs (no account needed). See your collection footprint on the planet, get recommendations via hybrid collaborative + content-based filtering, find crate neighbors — collectors with overlapping taste.

Stack: React 19 + Three.js r183 + globe.gl + FastAPI + SQLite. 4.87M releases from the Discogs CC0 dump. 346 tests.

AGPL-3.0. Data CC0. No login required for first exploration.

https://github.com/benjaminbelaga/discoworld
