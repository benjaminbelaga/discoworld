# DiscoWorld Execution Plan
**Last updated:** 2026-04-19 · **Owner:** Benjamin Belaga · **Repo:** `benjaminbelaga/discoworld` (private) · **Prod:** `world.yoyaku.io` on Contabo

> **⏸️ PAUSED 2026-04-19 — product pivot.** Ben has decided the 3D world is premature. We ship a working, useful consumer product first: **disco.gy** (domain purchased 2026-04-19). DiscoWorld comes back as the 3D companion **`world.disco.gy`** in phase 4 on top of the disco.gy backend.
>
> **Active plan:** `~/repos/yoyaku-reco/docs/RADIO-PRODUCT-PLAN.md`
> **Future prod URL for this codebase:** `world.disco.gy` (replaces current `world.yoyaku.io`, which stays live until migration)
>
> Do NOT start any PR below without Ben's explicit go-ahead to resume DiscoWorld. If you are an agent reading this file, switch over to the Radio plan. The shipped DiscoWorld code (PRs #9-#18) stays in prod on `world.yoyaku.io`, untouched.

> This file is the single source of truth for what remains to do on DiscoWorld. Any agent (human or Claude) picking up work MUST read this file first. Each PR section is self-contained — it points to audit-2026/AGENT-X.md for deep rationale but contains everything needed to execute.

---

## 0 · TL;DR — priority queue

Ship in this order. Each section below has a self-contained spec.

| # | PR | Risk | Effort | Depends | Branch |
|---|---|---|---|---|---|
| 1 | **PR-12B** LOD labels phase B | low | 2 h | — | `visual/labels-phase-b` |
| 2 | **PR-16a** perf P1 safe wins | low | 2 h | — | `perf/p1-safe-wins` |
| 3 | **PR-22** hover tooltips | medium | 3 h | — | `feat/hover-tooltips` |
| 4 | **PR-26** E2E CF bypass | medium | 3 h | — | `infra/e2e-cf-bypass` |
| 5 | **PR-17** T0 continent tier | medium | 3 h | PR-12B | `visual/continent-tier` |
| 6 | **PR-19** decade flat cartouche | low | 1 h | PR-17 | `visual/decade-cartouche` |
| 7 | **PR-15** Python layout pipeline | high | 2–3 d | — | `feat/layout-pipeline` |
| 8 | **PR-18** client layout v2 flag | high | 1–2 d | PR-15 | `feat/layout-v2-client` |

Strategic PRs (Ben-gated, not yet agent-ready): PR-21 editorial islands · PR-24 paid tier · PR-25 era-first.

---

## 1 · Conventions (MUST read before launching any agent)

### 1.1 Rate-limit rules (post-incident 2026-04-18)
- **Max 1 agent against Anthropic API at a time.** On 2026-04-18 four parallel worktree agents were launched simultaneously and all hit "Server is temporarily limiting requests" mid-run. Zero commits persisted across four worktrees.
- If multiple PRs are queued, either (a) run serially or (b) stagger launches by **≥ 3 minutes**.
- Per-agent budget: **≤ 20 tool calls · ≤ 2000 input tokens**. Point to this file + audit reports instead of inlining long specs.
- If an agent returns `API Error: Server is temporarily limiting requests`, do NOT immediately relaunch. Wait 10 min, then relaunch with a tighter prompt (reduce exploration; give exact file:line edits).

### 1.2 Deploy protocol (every PR, after merge)
```bash
gh pr merge <N> --squash --delete-branch
git checkout main && git pull --rebase
cd packages/web && npm run build
rsync -av --checksum dist/ yoyaku-server:/var/www/world.yoyaku.io/ --exclude="*.map"
# Verify: ssh yoyaku-server "grep -o '<needle>' /var/www/world.yoyaku.io/assets/index-*.js"
```

**Never** use `rsync --delete`. Old dist files stay on disk (harmless, index.html only references latest hashes).

### 1.3 Branch naming
`visual/*` · `perf/*` · `feat/*` · `infra/*` · `fix/*` · `docs/*` · `chore/*`. One PR per branch. Squash-merge, delete branch on merge.

### 1.4 Commit message template
```
<type>(web): <one-line summary>

<what-changed in 2-4 short paragraphs>

Refs: audit-2026/AGENT-<X>-<name>.md §<section>
```
No AI attribution. `Benjamin Belaga` as sole author (per `~/.claude/rules/01`).

### 1.5 Verification layers (in order)
1. `npm run build` must pass clean
2. Bundle check via `grep -o '<expected-needle>' dist/assets/index-*.js`
3. Rsync deploy
4. Prod bundle re-verify: `ssh yoyaku-server "grep -o '<needle>' /var/www/world.yoyaku.io/assets/index-*.js"`
5. Visual sanity — **CANNOT be automated** (Cloudflare blocks Playwright against prod — see PR-26 for fix). Ben manually opens `world.yoyaku.io` in a real browser and reports.

### 1.6 Rollback
- Every PR is squash-merged → `git revert <merge-sha>` is always clean.
- Prod rollback: keep last 3 `dist-backup-YYYYMMDD/` on Contabo via a cron TBD. Until then, re-run the build on a prior commit and rsync.

### 1.7 Files to know
- `packages/web/src/components/GenreWorld.jsx` — 1100+ lines, hot file, touched by most visual PRs. Coordinate sequencing to avoid conflicts.
- `packages/web/src/stores/useStore.js` — Zustand, enrichment hook (atlasColor).
- `packages/web/src/lib/colorPalette.js` — Night Atlas palette (shipped PR-13).
- `packages/web/vite.config.js` — manualChunks + modulePreload filter.
- `public/data/world.json` — 166 genres, 824 tracks. Shape in `memory/discoworld.md`.

---

## 2 · Dependency graph

```
PR-12B ─────► PR-17 ─────► PR-19
                │
                └──────────► (unblocks T0 continent label Ben wants)

PR-16a  ─────► (indep, pure perf)
PR-22   ─────► (indep, UX)
PR-26   ─────► (indep, unblocks future regression E2E)

PR-15 ─────► PR-18 ─────► PR-20 validation
                   │
                   └─────► later: PR-23 ML similarity (needs embeddings from #15)
```

**Parallelism rules:**
- PR-12B + PR-16a + PR-22 + PR-26 can all run in parallel *IF staggered ≥ 3 min apart*.
- PR-17 MUST wait for PR-12B merged (both touch label section of GenreWorld.jsx).
- PR-19 MUST wait for PR-17 merged (replaces DecadeLabels that PR-17 might touch).
- PR-15 + PR-18 can't parallelize — PR-18 depends on PR-15 outputs.

---

## 3 · Shipped state (DO NOT redo)

| PR | Title | Commit | Deployed |
|---|---|---|---|
| #9 | perf P0 wins — Lambert + geometry hoist | `99cca57` | 2026-04-17 |
| #10 | Night Atlas palette — warm Stone 900 | `c06b0b8` | 2026-04-17 |
| #11 | LOD labels phase A — 3-tier hierarchy | `9a2b131` | 2026-04-17 |
| #12 | lazy-load postfx — 397 KB off mobile | `8966b7f` | 2026-04-17 |
| #13 | merge 500 lines → 2 LineSegments (+12-20 FPS) | `93eebe1` | 2026-04-18 |
| #14 | noise-varied colors + gold user accent | `1914ced` | 2026-04-18 |

Prod verification command: `ssh yoyaku-server "grep -o '#e8b87a\|atlasColor\|lineSegments' /var/www/world.yoyaku.io/assets/index-*.js"` — should show all three.

---

## 4 · PR specs (self-contained)

### PR-12B · LOD labels phase B

**Status**: ready · **Risk**: low · **Effort**: 2 h · **Depends**: none · **Branch**: `visual/labels-phase-b`

**Context**: PR-11 (phase A, already shipped) introduced 3-tier rank-based LOD + per-tier fade curves. Phase B ships the remaining Agent B spec: Space Grotesk fonts, `<Billboard>` wrapping, NDC bbox collision pass.

**Why**: Agent B audit bug #7 — drei `<Text>` currently defaults to Roboto, inconsistent with the app UI (IBM Plex Mono / JetBrains Mono). Bug #10 — when camera zooms close, tier-1 labels still overlap because there's no collision pass.

**Spec reference**: `audit-2026/AGENT-B-readability.md` §6 (LABEL_TOKENS) + §7 edits 1, 2, 5, 7, 8.

**Steps**:

1. **Ship Space Grotesk woff files.** Google Fonts OFL-licensed, self-hostable. Exact URLs stable:
   ```bash
   mkdir -p packages/web/public/fonts
   curl -L -o packages/web/public/fonts/SpaceGrotesk-Medium.woff \
     "https://fonts.gstatic.com/s/spacegrotesk/v19/V8mjoQDwxsiKMEcnxS5D_IGvDgJM.woff"
   curl -L -o packages/web/public/fonts/SpaceGrotesk-SemiBold.woff \
     "https://fonts.gstatic.com/s/spacegrotesk/v19/V8mjoQDwxsiKMEcnxS5D_IOxCgJM.woff"
   ls -la packages/web/public/fonts/SpaceGrotesk-*.woff
   # Expected: both files 25-50 KB each.
   ```
   If the gstatic URLs 404 (they rotate rarely), use the Google Fonts API to get the current URL: `curl "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600&display=swap" -H "User-Agent: Mozilla/5.0" | grep -o 'https://[^)]*\.woff2\{0,1\}'` then download the listed font URLs. Convert to `.woff` if only `.woff2` is available (drei supports both; prefer woff for Safari compat).

2. **Create `packages/web/src/tokens/labels.js`** with:
   ```js
   export const LABEL_TOKENS = {
     font: '/fonts/SpaceGrotesk-Medium.woff',
     fontBold: '/fonts/SpaceGrotesk-SemiBold.woff',
     tiers: {
       0: { size: 2.2, weight: 'bold', tracking: 0.22, case: 'upper', colorMode: 'biome' },
       1: { size: 1.6, weight: 'medium', tracking: 0,    case: 'sentence', colorMode: 'genre' },
       2: { size: 1.1, weight: 'medium', tracking: 0,    case: 'sentence', colorMode: 'genre-muted' },
       3: { size: 0.85, weight: 'medium', tracking: 0,   case: 'sentence', colorMode: 'genre-muted' },
       4: { size: 3.0, weight: 'medium', tracking: 0.3,  case: 'upper', color: '#d4a574', alpha: 0.35 },
     },
     outline: { width: '8%', color: '#1c1917', opacity: 1, blur: '15%' },
     minPixelSize: 11,
   }
   ```

3. **Update `GenreLabel` in `GenreWorld.jsx`** (currently around line 444-510):
   - Import `LABEL_TOKENS` from `../tokens/labels`
   - Import `Billboard` from `@react-three/drei` (add to existing drei import on line 3)
   - Pass `font={LABEL_TOKENS.font}` to `<Text>`
   - Use `outlineWidth={LABEL_TOKENS.outline.width}` (was hardcoded `0.12` in PR-11), `outlineBlur={LABEL_TOKENS.outline.blur}` — note drei `<Text>` requires string pct or number; strings work.
   - Wrap the returned `<Text>` in `<Billboard follow lockX lockZ>...</Billboard>` so labels always face camera but don't rotate around Y (prevents upside-down labels when orbiting).

4. **Add `LabelCollisionManager`** — new component inside GenreWorld.jsx (or separate file if preferred, `components/LabelCollisionManager.jsx`):
   - Uses a module-level `const _labelRegistry = new Set()` to track refs.
   - Export a `useLabelRegister(ref, tier, trackCount, position)` hook that adds/removes from the Set on mount/unmount.
   - The manager runs one `useFrame`:
     ```js
     useFrame(() => {
       // Snapshot array, sort by (tier ASC, trackCount DESC)
       // For each label: project position to NDC, compute bbox (estimate width = text.length * fontSize * 0.5)
       // Walk list, skip if bbox overlaps any kept bbox (12px NDC pad)
       // Set ref.current.visible based on result
     })
     ```
   - Budget target: < 0.3 ms on M1 for 166 labels. If slower, throttle to every 3rd frame.
   - `GenreLabel` registers on mount, passes (ref, tier, trackCount, genre.x/y/z).

5. **Build + verify**:
   ```bash
   cd packages/web && npm run build
   # Expected: ✓ built, woff copied to dist/fonts/
   ls dist/fonts/SpaceGrotesk-*.woff
   grep -o "LABEL_TOKENS\|SpaceGrotesk" dist/assets/index-*.js | sort -u
   # Expected: both tokens name and font path
   ```

6. **Commit + push**:
   ```
   feat(web): LOD labels phase B — Space Grotesk + Billboard + collision

   Phase A (PR-11) shipped 3-tier LOD with Roboto default font. Phase B
   completes the Agent B spec:

   - Self-host Space Grotesk Medium + SemiBold woff (OFL, ~30KB each)
   - New tokens/labels.js centralizing tier sizes, outline, fade rules
   - GenreLabel reads LABEL_TOKENS, wrapped in drei <Billboard>
   - LabelCollisionManager: single useFrame, NDC bbox pass, sorts by
     (tier ASC, trackCount DESC), skips overlaps with 12px pad.
     Budget <0.3ms for 166 labels.

   Refs: audit-2026/AGENT-B-readability.md §6-7
   ```

7. **Open PR + do NOT merge** — Ben eyeballs the rendering first.

**Acceptance criteria**:
- [ ] `dist/fonts/SpaceGrotesk-Medium.woff` exists, 20-60 KB
- [ ] `grep "LABEL_TOKENS" dist/assets/index-*.js` returns at least one match
- [ ] `npm run build` < 1 s clean
- [ ] Bundle index chunk delta ≤ +3 KB gzip
- [ ] No ESLint errors

**Risk / rollback**: `git revert`. Font files harmless on disk.

---

### PR-16a · perf P1 safe wins

**Status**: ready · **Risk**: low · **Effort**: 2 h · **Depends**: none · **Branch**: `perf/p1-safe-wins`

**Context**: 4 uncontroversial Agent E backlog items, bundled as one PR. Each is a mechanical change with measurable FPS win, zero visual change.

**Spec reference**: `audit-2026/AGENT-E-performance.md` items #2, #3, #5, #12.

**Steps**:

1. **Hoist 80+ per-label `useFrame` into one parent loop** (item #2, +3-6 FPS).
   - Currently `GenreLabel`, `LabelConstellation.GlowMarker`, `ArtistThread.ReleaseMarker` each create one `useFrame` per item.
   - Parent component (`GenreLabels`, `LabelConstellationOverlay`, `ArtistThread`) subscribes once, iterates `refs.current` array.
   - Pattern: use a ref-array pushed by children via `useEffect`. Single `useFrame` walks it.
   - Anchor: `GenreWorld.jsx:440` (Phase A GenreLabel), `LabelConstellation.jsx:37`, `ArtistThread.jsx:68`.

2. **Reduce `ClusterLights` + `ActiveGenreGlow` point lights → emissive** (item #3, +5-10 FPS).
   - Three.js recompiles shader programs based on light count. Up to 17 simultaneous point lights in the scene currently.
   - Replace most with emissive material + existing bloom stack (PR-12 kept bloom lazy-loaded on desktop).
   - Keep at most 3 dynamic lights: overhead gold + warm accent + low fill.
   - Anchor: `GenreWorld.jsx:735` (ClusterLights), `:709` (ActiveGenreGlow).

3. **Memoize inline geometries** (item #5, +1-3 FPS + GC stability).
   - `GlowRings` allocates a fresh `<ringGeometry>` in JSX per-map-iteration; memoize the array of geometries on `[rings]`.
   - PR-9 already hoisted MysteryNode spheres. Apply same pattern to GlowRings.
   - Anchor: `GenreWorld.jsx:95` (GlowRings).

4. **Planet ocean shader: octaves 3 → 1** (item #12, +8-15 FPS on planet view).
   - `GenrePlanet.jsx:304-306` has a vertex-shader running 3-octave simplex noise on 18k verts/frame.
   - Single biggest GPU cost on planet view.
   - Drop to 1 octave. Test visually — if too flat, switch to precomputed normal map.

5. **Build + verify**:
   ```bash
   cd packages/web && npm run build
   # Bundle size should be flat or -1 KB (fewer light definitions compile smaller)
   ```

6. **Commit**:
   ```
   perf(web): P1 backlog — useFrame hoist + light reduction + ocean octaves

   4 Agent E backlog items, bundled (each small, all mechanical):

   - Hoist 80+ per-label/marker useFrame into parent loops
     (GenreLabels, LabelConstellationOverlay, ArtistThread)
   - ClusterLights + ActiveGenreGlow: reduce dynamic point lights
     from up to 17 → 3, replace rest with emissive + bloom
   - GlowRings: memoize ringGeometry array (was reallocating per map)
   - GenrePlanet ocean shader: octaves 3 → 1 (biggest GPU cost on
     planet view was 3-octave noise on 18k verts)

   Expected: +17-34 FPS genre view, +8-15 FPS planet view.
   Zero visual change beyond slightly less saturated lit highlights
   (emissive-only has flatter falloff than point lights).

   Refs: audit-2026/AGENT-E-performance.md items #2, #3, #5, #12
   ```

**Acceptance criteria**:
- [ ] No new dependencies
- [ ] `npm run build` clean
- [ ] Bundle size delta ≤ 0 (likely slightly smaller)
- [ ] No ESLint errors

**Risk / rollback**: If visual looks too flat after point-light reduction, boost emissive intensity in a follow-up. Revert is `git revert`.

---

### PR-22 · hover tooltip previews with cover art

**Status**: ready · **Risk**: medium · **Effort**: 3 h · **Depends**: none · **Branch**: `feat/hover-tooltips`

**Context**: Agent F competitor matrix — zig-zag.fm, Every Noise, Music Galaxy all have hover tooltips with cover preview. DiscoWorld currently shows nothing on hover beyond mouse cursor change.

**Spec reference**: `audit-2026/AGENT-F-competitor-matrix.md` §"Features to steal" #7 (hover cards) + `audit-2026/AGENT-A-design-references.md` Pattern 10 (HTML overlay labels).

**Steps**:

1. **Add hover state** to store:
   - `useStore.hoveredGenre` (already exists as `hoveredSlug`) — check if a `hoveredGenrePreview` needs to be different.
   - On sphere hover in GenreWorld, pick one track from `releases[genre.slug]` (first one with `youtube` field).

2. **Tooltip component** `packages/web/src/components/GenreHoverTooltip.jsx`:
   - Renders via drei `<Html>` at genre position with `center` anchor + small y offset.
   - Fixed-width 220 px, Night Atlas skin: bg `rgba(28,25,23,0.92)` + 1 px border `rgba(196,149,106,0.5)` + backdrop-blur 8 px, gold text `#e8b87a` for title, muted stone for meta.
   - Shows: genre name (LABEL tier 1 token), track count, one track title (if available), optional cover thumbnail fetched from Discogs release_id (reuse existing `pathFromUrl` helper or direct i.discogs.com URL).
   - `pointerEvents: none; userSelect: none`.

3. **Perf guard**: only render when `hoveredSlug !== null`. No continuous polling. Use a `useEffect` to lazy-compute the preview track on hover change.

4. **Mobile**: disable tooltip if `useIsMobile()` true (no hover on touch).

5. **Build + verify**:
   ```bash
   cd packages/web && npm run build
   grep -o "GenreHoverTooltip" dist/assets/index-*.js
   ```

6. **Commit** as `feat(web): hover tooltip with track preview (Agent F steal)`.

**Acceptance criteria**:
- [ ] Tooltip appears on hover, disappears on pointer-out within 100 ms
- [ ] Mobile shows zero tooltip
- [ ] Bundle delta ≤ +2 KB gzip
- [ ] No console errors when a genre has zero tracks (graceful empty state)

**Risk**: Discogs image URLs can 404 / be slow. Add `onError` handler that hides the image without crashing. Medium risk because Html overlays can steal pointer events — test hover + click flow doesn't break.

**Rollback**: `git revert`.

---

### PR-26 · E2E harness with Cloudflare bypass

**Status**: ready · **Risk**: medium · **Effort**: 3 h · **Depends**: none · **Branch**: `infra/e2e-cf-bypass`

**Context**: `/tmp/dw-health.js` (Playwright standalone) hits Cloudflare bot challenges on URL variants. After PR-10+PR-11 shipped, we couldn't confirm regression via E2E — had to rely on code review + Ben's manual eyeball. This blocks any agent from verifying their own work in future sessions.

**Spec reference**: `audit-2026/SYNTHESIS.md` §"Known test-harness issue".

**Steps**:

1. **Option A (recommended): run E2E against `vite preview`** — bypass CF entirely.
   - `packages/web/e2e/harness.config.js`: `baseURL: http://localhost:4173`, auto-start `npm run preview` before suite.
   - Use existing `packages/web/e2e/discoworld.spec.js` (449 lines, already there).
   - Data fixtures: point to `packages/web/public/data/` (local), NOT prod.

2. **Option B (fallback): CF bypass for prod Playwright**.
   - Cloudflare has "Allow" WAF rules. Create a rule: `(http.request.uri.path contains "/" and http.user_agent contains "dw-e2e/")` allow.
   - Playwright context sets `userAgent: 'dw-e2e/1.0 ...'`.
   - Caveat: needs Ben's CF Dashboard access; adds prod-specific infra state.

3. **Recommended: ship A as default, add optional B as a `--prod` flag**.

4. **Standalone script** `scripts/run-e2e.sh`:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   cd "$(dirname "$0")/../packages/web"
   npm run build
   npx vite preview --port 4173 &
   PREVIEW_PID=$!
   trap "kill $PREVIEW_PID 2>/dev/null || true" EXIT
   sleep 3
   npx playwright test --config=playwright.config.js
   ```

5. **Add CI job** `.github/workflows/e2e.yml` running on pull_request:
   - `npm ci` + `npm run build` + `scripts/run-e2e.sh`
   - Uploads Playwright HTML report as artifact on failure

6. **Acceptance**:
   ```bash
   bash scripts/run-e2e.sh
   # Expected: all tests pass in <2 min, no CF challenge
   ```

**Acceptance criteria**:
- [ ] `bash scripts/run-e2e.sh` runs green locally against vite preview
- [ ] CI workflow green on a test PR
- [ ] Existing `e2e/discoworld.spec.js` passes (adjust selectors if PR-10/11 broke any)

**Risk**: fixing stale selectors in existing spec. No visual change.

---

### PR-17 · T0 continent tier (biome-scale labels that fade out on zoom-in)

**Status**: blocked-on PR-12B · **Risk**: medium · **Effort**: 3 h · **Depends**: PR-12B · **Branch**: `visual/continent-tier`

**Context**: Agent B §6 introduces tier 0 — continent-scale SDF text at scene centroid, fades OUT as camera approaches (opposite of tier 1-3 which fade IN). Currently `BiomeLabels` uses DOM `<Html>` at fixed opacity 0.85. Replace with SDF `<Text>` that gets larger + bolder than subgenre labels and fades when zoomed in.

**Spec reference**: `audit-2026/AGENT-B-readability.md` §6 (tier 0 LOD curve) + §7 edit #3.

**Steps** (after PR-12B merged, so `LABEL_TOKENS` + Space Grotesk are available):

1. **Replace `BiomeLabels` Html with SDF** in `GenreWorld.jsx` (current location ~L820-870 after PR-14 shifts).
   - Use drei `<Text>`, pass `font={LABEL_TOKENS.fontBold}` (SemiBold), `fontSize=LABEL_TOKENS.tiers[0].size`.
   - Wrap in `<Billboard lockY>` (so label stays horizontal but always faces camera).
   - Uppercase + tracking per tier-0 token.
   - Color from scene's dominant `atlasColor` at 90% sat (compute in useMemo from genres' atlasColor).

2. **LOD curve tier 0** — inverse of tier 1-3:
   ```js
   const TIER_0_LOD = { fadeStart: 0, fadeEnd: 40, maxOpacity: 0.9 }
   // opacity = 0 when dist < 15, lerp up to 0.9 between dist 15 and 40, cap at 0.9
   ```
   So at far zoom (dist > 40): continents visible. At close zoom (dist < 15): continents faded out, subgenres take over. This is the "far = continents, close = genres" Agent A cite.

3. **Fix the onClick centroid bug (Agent B bug #3)** — already done in PR-11, verify still correct.

4. **Build + deploy as usual.**

5. **Commit** as `feat(web): T0 continent tier — SDF biome labels fade out on zoom-in`.

**Acceptance criteria**:
- [ ] Continent labels readable at camera dist 50-80
- [ ] Continent labels faded to 0 at camera dist < 15 (so subgenres read clearly)
- [ ] No collision with tier-1 labels (collision manager from PR-12B handles tier 1+, tier 0 renders without collision as a background layer)

**Risk**: z-fighting between tier 0 and tier 1-3. Mitigation: `renderOrder={1000 + tier}` (tier 0 renders first, tier 3 last).

**Rollback**: `git revert`. BiomeLabels reverts to Html.

---

### PR-19 · DecadeLabels flat-cartouche SDF

**Status**: blocked-on PR-17 · **Risk**: low · **Effort**: 1 h · **Depends**: PR-17 · **Branch**: `visual/decade-cartouche`

**Context**: Agent B §7 edit #4 — replace `DecadeLabels` Html with SDF `<Text>` rotated `[-Math.PI/2, 0, 0]` so the decade name lies flat on the ground like a treasure-map cartouche. PR-11 fixed the 22%-alpha invisibility; PR-19 finishes the look.

**Spec reference**: `audit-2026/AGENT-B-readability.md` §7 edit #4.

**Steps** (after PR-17 merged):

1. Replace DecadeLabels return JSX:
   - `<Text>` with `font={LABEL_TOKENS.font}`, `fontSize={LABEL_TOKENS.tiers[4].size}` (3.0), `color={LABEL_TOKENS.tiers[4].color}` (`#d4a574`), `fillOpacity={0.45}` (slightly more than PR-11's 0.42 because SDF reads better than Html text).
   - `position={[d.x, 6, d.z]}` (was 8, lower to feel more on-ground).
   - `rotation={[-Math.PI/2, 0, 0]}` — lies flat.
   - `outlineColor="#0a0a14"`, `outlineOpacity={0.6}`, `outlineWidth={LABEL_TOKENS.outline.width}`.

2. Build + commit + deploy.

**Acceptance criteria**:
- [ ] Decade names visible as flat text on ground plane at all zoom levels
- [ ] No overlap with genre sphere geometry (z-offset handles)

**Risk**: low. `git revert` if typography looks off.

---

### PR-15 · Python spatial layout pipeline

**Status**: ready · **Risk**: high · **Effort**: 2-3 days · **Depends**: none · **Branch**: `feat/layout-pipeline`

**Context**: Agent D discovered the current scene is effectively 2D (y=0 for all 166 genres), WORLD_RADIUS=48 too tight, 70% void ratio. This PR is the ALL-NEW Python pipeline that generates a proper 3D spatial layout with UMAP + anchor-pinned continents + altitude. NO client changes in this PR — client support lands in PR-18.

**Spec reference**: `audit-2026/AGENT-D-spatial-layout.md` (entire report, ~326 lines).

**High-level shape**:
```
packages/pipeline/
├── build_genre_embeddings.py   ← text TF-IDF + node2vec + co-tag
├── build_genre_layout.py       ← UMAP projection
├── shape_continents.py         ← anchor-pin + force + Lloyd + hull
├── compute_altitude.py         ← y axis from trackCount/biome/BPM
├── genre_world_generator.py    ← orchestrator
├── requirements.txt            ← numpy scipy sklearn umap-learn gensim pyyaml alphashape
└── README.md                   ← usage + success metrics

config/genre_anchors.yaml       ← 8-12 editorial seed positions

scripts/rebuild-world.sh        ← pipeline runner
```

**Success metrics** (Agent D §8):
| Metric | Current | Target |
|---|---|---|
| World radius | 48 | 120 |
| Void ratio in bounding disc | ~70 % | 50-60 % |
| Intra / inter cluster dist ratio | ≈ 0.9 (blob) | **< 0.45** |
| y variance | 0 | ≥ 3× max sphere radius |
| Anchored hub genres | 0 | 8-12 pinned |

**Steps**:

1. Read `audit-2026/AGENT-D-spatial-layout.md` §7 end-to-end. Agent D wrote detailed pseudocode.
2. Implement scripts sequentially — each writes to `data/` (Git-ignored `*.npy` and `*.json` intermediate).
3. Run `scripts/rebuild-world.sh` locally on your machine with `python3 -m venv .venv && source .venv/bin/activate && pip install -r packages/pipeline/requirements.txt`.
4. Validate success metrics hold (print them at the end of the orchestrator).
5. Commit the scripts + `config/genre_anchors.yaml` + `data/world-v2.json` (the new world). **Do NOT overwrite `public/data/world.json`** — PR-18 will add the `?layout=v2` flag that switches between them.

**Acceptance criteria**:
- [ ] `bash scripts/rebuild-world.sh` runs green on a fresh Python 3.11 venv
- [ ] Success metrics printed and all within target
- [ ] `data/world-v2.json` committed with 166 genres having `{x, y, z}` satisfying the metrics
- [ ] No changes to `public/data/world.json` (old layout preserved)

**Risk**: HIGH — UMAP seed non-determinism requires `random_state=42` consistently. Anchor YAML subjective (will need Ben sign-off). 3-day effort means agent budget needs expansion or this is split across sessions.

**Rollback**: just don't switch the client flag. New files are inert.

---

### PR-18 · Client support for `?layout=v2` flag

**Status**: blocked-on PR-15 · **Risk**: high · **Effort**: 1-2 days · **Depends**: PR-15 · **Branch**: `feat/layout-v2-client`

**Context**: Ship the client changes that consume `world-v2.json` from PR-15. Behind a `?layout=v2` URL param so Ben can A/B the old vs new layout visually before flipping the default.

**Spec reference**: `audit-2026/AGENT-D-spatial-layout.md` §7 "UPDATE" section.

**Steps**:

1. **Data loading**: `useStore.loadWorldData()` picks `world-v2.json` if `new URLSearchParams(location.search).get('layout') === 'v2'`, else `world.json`.
2. **Expand camera params** in App.jsx Scene(): `maxDistance` 120 → 180 to see the full new world.
3. **Render continent polygons** as ground decals — consume `continents.json` from PR-15. Each polygon = Shape → ExtrudeGeometry (depth 0.1, color from atlasColor of scene average) at y=-1.8, opacity 0.3 additive blend. 8-12 polygons.
4. **Altitude-aware rendering**: the existing genre sphere code already reads `g.y` — just confirm it picks up the non-zero values. No code change likely needed.
5. **URL helper**: update `useUrlState.js` to preserve `?layout=v2` on share URL.
6. **Onboarding note**: if `?layout=v2` active, show a small "Experimental layout" pill in the header.

**Acceptance criteria**:
- [ ] `?layout=v2` switches to new data file
- [ ] Old layout (`?layout=v1` or no param) still works identically
- [ ] Continent polygons visible + colored when v2 active
- [ ] Success metrics (from PR-15) observable in prod

**Risk**: HIGH — new data shape might break old selectors. Extensive testing needed across all views.

**Rollback**: `git revert` + re-deploy. Data file (`world-v2.json`) stays on disk, inert.

---

## 5 · Strategic backlog (Ben-gated, not agent-ready)

These PRs need Ben's direction before an agent can implement. Listed here so they aren't lost.

### PR-20 · Layout v2 validation report
After PR-15+PR-18 deployed, run a validation script that reports: void ratio, intra/inter cluster distances, anchored genre positions, y-variance. Output: `audit-2026/layout-v2-validation-YYYY-MM-DD.md`. Ben reads + decides whether to promote v2 → default.

### PR-21 · Editorial curator islands
YOYAKU staff promotes specific releases into the world as named "islands" with distinct visual language (Radiooooo pattern). Data source: a new `data/editorial.json` maintained by YOYAKU team. Client renders them as pinned nodes with custom 3D icons. Needs curatorial scope + content pipeline decision from Ben.

### PR-23 · ML audio-similarity recs (Cosine.club pattern)
"Find tracks that sound like this one" via spectrogram embeddings. Requires: audio embedding pipeline (Discogs preview MP3 → spectrogram → embedding), vector store, similarity query endpoint. Weeks of work. Ben-gated on strategic relevance.

### PR-24 · Paid tier (drift-24/7, unlimited dig paths)
Agent F: every competitor with scale has a paid tier. €3/mo via Stripe. Needs YOYAKU business decision.

### PR-25 · Era-first time machine
Radiooooo-style decade dial becomes primary UI. Big UX rework. Ben-gated.

### PR-27 · RUM (Real User Monitoring)
Ship a tiny FPS + load-time beacon to a YOYAKU endpoint. Confirm perf wins (PR-9, PR-14, PR-16a) in the field, not just on dev laptop.

---

## 6 · Agent launch template

When launching an agent to execute one of the PRs above, use a prompt of this shape (keep under 500 words total):

```
You are implementing DiscoWorld PR-<ID> (<title>).

Read the spec here first: ~/repos/discoworld/audit-2026/EXECUTION-PLAN.md §4 · PR-<ID>.

That section has: steps (numbered), commands (exact), acceptance criteria (checklist), commit message template, PR title format.

Conventions to follow: see §1 of the same plan file.

Workflow: create branch, implement all steps, `npm run build` clean, commit with the template, push, open PR via `gh pr create`. DO NOT merge, DO NOT deploy — the caller handles that after review.

Rate-limit: you have a budget of ≤20 tool calls. If you approach the limit, commit what's working and report status.

Report back in under 250 words: branch name, commit SHA, build status, PR URL, one-line caveat if any.
```

This delegation pattern keeps the agent's context tight (no conversation history inlined) and reproducible across future sessions.

---

## 7 · Changelog of this plan file

| Date | Change |
|---|---|
| 2026-04-19 | Initial version. 6 PRs shipped (§3), 8 queued (§0, §4), 5 strategic (§5). |
