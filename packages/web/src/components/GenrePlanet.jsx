import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { addAtmosphere } from './GlobeAtmosphere'
import { addStarfield } from './GlobeStarfield'
import { setupBloom } from './GlobeBloom'
import { createBuildingSystem } from '../lib/buildingSystem'
import { createGenreSky } from '../lib/genreSky'
import { createGenreParticles } from '../lib/genreParticles'
import useStore from '../stores/useStore'
import './GenrePlanet.css'

// ---- Perlin noise (seeded, deterministic) ----
const PERM = new Uint8Array(512)
const GRAD3 = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
]
;(function initPerm() {
  const p = []
  for (let i = 0; i < 256; i++) p[i] = i
  let seed = 42
  for (let i = 255; i > 0; i--) {
    seed = (seed * 16807) % 2147483647
    const j = seed % (i + 1)
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]
})()

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10) }
function nlerp(a, b, t) { return a + t * (b - a) }
function dot3(g, x, y, z) { return g[0] * x + g[1] * y + g[2] * z }

function perlin3(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z)
  const u = fade(x), v = fade(y), w = fade(z)
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z
  const B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z
  return nlerp(
    nlerp(
      nlerp(dot3(GRAD3[PERM[AA] % 12], x, y, z), dot3(GRAD3[PERM[BA] % 12], x - 1, y, z), u),
      nlerp(dot3(GRAD3[PERM[AB] % 12], x, y - 1, z), dot3(GRAD3[PERM[BB] % 12], x - 1, y - 1, z), u), v),
    nlerp(
      nlerp(dot3(GRAD3[PERM[AA + 1] % 12], x, y, z - 1), dot3(GRAD3[PERM[BA + 1] % 12], x - 1, y, z - 1), u),
      nlerp(dot3(GRAD3[PERM[AB + 1] % 12], x, y - 1, z - 1), dot3(GRAD3[PERM[BB + 1] % 12], x - 1, y - 1, z - 1), u), v), w)
}

function fbm(x, y, z, octaves = 4) {
  let val = 0, amp = 0.5, freq = 1
  for (let i = 0; i < octaves; i++) {
    val += amp * perlin3(x * freq, y * freq, z * freq)
    amp *= 0.5; freq *= 2
  }
  return val
}

// ---- Biome visual parameters ----
// roughness/metalness per biome for MeshPhysicalMaterial variety
const BIOME_CONFIG = {
  'techno-massif':       { noiseScale: 1.8, heightMul: 1.2, octaves: 5, baseHeight: 0.04, roughness: 0.6, metalness: 0.25, clearcoat: 0.0 },
  'house-plains':        { noiseScale: 1.2, heightMul: 0.6, octaves: 3, baseHeight: 0.02, roughness: 0.8, metalness: 0.05, clearcoat: 0.0 },
  'ambient-depths':      { noiseScale: 0.8, heightMul: 0.4, octaves: 3, baseHeight: 0.01, roughness: 0.3, metalness: 0.1, clearcoat: 0.2 },
  'jungle-canopy':       { noiseScale: 1.5, heightMul: 0.9, octaves: 4, baseHeight: 0.03, roughness: 0.7, metalness: 0.1, clearcoat: 0.0 },
  'trance-highlands':    { noiseScale: 1.4, heightMul: 1.0, octaves: 4, baseHeight: 0.035, roughness: 0.5, metalness: 0.15, clearcoat: 0.1 },
  'industrial-wasteland':{ noiseScale: 2.0, heightMul: 1.3, octaves: 5, baseHeight: 0.045, roughness: 0.9, metalness: 0.4, clearcoat: 0.0 },
  'disco-riviera':       { noiseScale: 1.0, heightMul: 0.5, octaves: 3, baseHeight: 0.015, roughness: 0.4, metalness: 0.1, clearcoat: 0.15 },
  'urban-quarter':       { noiseScale: 1.6, heightMul: 0.7, octaves: 4, baseHeight: 0.025, roughness: 0.7, metalness: 0.2, clearcoat: 0.0 },
  'idm-crystalline':     { noiseScale: 2.2, heightMul: 1.1, octaves: 5, baseHeight: 0.03, roughness: 0.2, metalness: 0.5, clearcoat: 0.4 },
  'source-monuments':    { noiseScale: 1.0, heightMul: 0.5, octaves: 3, baseHeight: 0.02, roughness: 0.6, metalness: 0.1, clearcoat: 0.0 },
  'garage-district':     { noiseScale: 1.3, heightMul: 0.7, octaves: 3, baseHeight: 0.02, roughness: 0.65, metalness: 0.15, clearcoat: 0.0 },
  'dubstep-rift':        { noiseScale: 1.7, heightMul: 1.0, octaves: 4, baseHeight: 0.035, roughness: 0.55, metalness: 0.2, clearcoat: 0.05 },
  'unknown':             { noiseScale: 1.0, heightMul: 0.5, octaves: 3, baseHeight: 0.02, roughness: 0.7, metalness: 0.1, clearcoat: 0.0 },
}

const OCEAN_COLOR = new THREE.Color('#080c18')
const GLOBE_RADIUS = 100

// ---- Map flat [x,y] center to unit sphere direction ----
// The data uses a flat coordinate system with world_radius=48
// Map to spherical: x→longitude, y→latitude
function centerToDir(center, worldRadius) {
  const lng = (center[0] / worldRadius) * 180
  const lat = (center[1] / worldRadius) * 90
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  ).normalize()
}

// ---- Build planet mesh ----
function buildPlanetMesh(data) {
  const territories = data.territories
  const worldRadius = data.meta.world_radius

  const geometry = new THREE.SphereGeometry(GLOBE_RADIUS, 128, 128)
  const posAttr = geometry.attributes.position
  const count = posAttr.count

  // Pre-compute territory directions and properties
  const terrData = territories.map(t => {
    const dir = centerToDir(t.center, worldRadius)
    // Approximate angular radius from area (area in flat coords → angular fraction)
    const angularRadius = Math.sqrt(t.area) / worldRadius * 1.2
    const biomeConfig = BIOME_CONFIG[t.biome] || BIOME_CONFIG['unknown']
    return {
      dir, angularRadius, biome: t.biome || 'unknown', biomeConfig, elevation: t.elevation,
      color: new THREE.Color(t.color), slug: t.slug, name: t.name,
      scene: t.scene, release_count: t.release_count,
    }
  })

  const colors = new Float32Array(count * 3)
  const emissive = new Float32Array(count * 3) // city lights emissive
  const territoryIndices = new Int16Array(count).fill(-1)
  const borderFlags = new Float32Array(count) // 1.0 = border vertex
  const tmpVec = new THREE.Vector3()
  const tmpColor = new THREE.Color()

  // We compute weighted-average roughness/metalness per biome
  let avgRoughness = 0, avgMetalness = 0, landCount = 0

  for (let i = 0; i < count; i++) {
    tmpVec.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i))
    const dir = tmpVec.clone().normalize()

    // Find closest territory + second closest (for border detection)
    let bestIdx = -1, bestDist = Infinity
    let secondIdx = -1, secondDist = Infinity
    for (let ti = 0; ti < terrData.length; ti++) {
      const t = terrData[ti]
      const angle = Math.acos(Math.max(-1, Math.min(1, dir.dot(t.dir))))
      const normalized = angle / (t.angularRadius * Math.PI)
      if (normalized < bestDist) {
        secondDist = bestDist; secondIdx = bestIdx
        bestDist = normalized; bestIdx = ti
      } else if (normalized < secondDist) {
        secondDist = normalized; secondIdx = ti
      }
    }

    const nx = dir.x * 2.5, ny = dir.y * 2.5, nz = dir.z * 2.5
    let height

    // Territory border detection: near edge between two different territories
    let isBorder = false
    if (bestIdx >= 0 && secondIdx >= 0 && bestIdx !== secondIdx && bestDist < 1.0) {
      const borderProximity = Math.abs(bestDist - secondDist)
      if (borderProximity < 0.08 && bestDist > 0.7) {
        isBorder = true
      }
    }
    borderFlags[i] = isBorder ? 1.0 : 0.0

    if (bestDist < 1.0 && bestIdx >= 0) {
      const t = terrData[bestIdx]
      const b = t.biomeConfig
      const falloff = 1.0 - Math.pow(bestDist, 0.7)
      const noise = fbm(nx * b.noiseScale + 50, ny * b.noiseScale, nz * b.noiseScale + 50, b.octaves)
      height = falloff * (b.baseHeight + Math.abs(noise) * 0.06 * b.heightMul) * (0.5 + t.elevation)

      // Color: territory color modulated by height + micro-detail noise
      const microNoise = perlin3(nx * 8, ny * 8, nz * 8) * 0.08
      const brightness = 0.5 + height * 6 + falloff * 0.3 + microNoise
      tmpColor.copy(t.color).multiplyScalar(brightness)

      // Border glow: thin bright line
      if (isBorder) {
        tmpColor.lerp(new THREE.Color(0.7, 0.7, 0.9), 0.5)
      }

      avgRoughness += b.roughness
      avgMetalness += b.metalness
      landCount++
      territoryIndices[i] = bestIdx
    } else {
      // Ocean
      height = Math.min(0, fbm(nx, ny, nz, 2) * 0.008 - 0.003)
      tmpColor.copy(OCEAN_COLOR)
    }

    const newR = GLOBE_RADIUS * (1 + height)
    posAttr.setXYZ(i, dir.x * newR, dir.y * newR, dir.z * newR)
    colors[i * 3] = tmpColor.r
    colors[i * 3 + 1] = tmpColor.g
    colors[i * 3 + 2] = tmpColor.b
    // Emissive starts at 0 (city lights added separately)
    emissive[i * 3] = 0; emissive[i * 3 + 1] = 0; emissive[i * 3 + 2] = 0
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  posAttr.needsUpdate = true

  // MeshStandardMaterial (was MeshPhysical) — the clearcoat + envMap pass was
  // invisible under the bloom effect and added 2 extra shader passes per
  // fragment. +3-8 FPS on integrated GPUs per perf audit.
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: landCount > 0 ? avgRoughness / landCount : 0.7,
    metalness: landCount > 0 ? avgMetalness / landCount : 0.15,
    flatShading: true,
    emissive: new THREE.Color(0x0a0a1e),
    emissiveIntensity: 0.15,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.territoryIndices = territoryIndices
  mesh.userData.terrData = terrData
  mesh.userData.borderFlags = borderFlags
  // Store base colors for collection overlay toggling
  mesh.userData.baseColors = new Float32Array(colors)
  return mesh
}

// ---- Apply collection overlay to planet vertex colors ----
function applyCollectionOverlay(planetMesh, collectionGenres, showOverlay) {
  if (!planetMesh) return
  const colorAttr = planetMesh.geometry.getAttribute('color')
  const baseColors = planetMesh.userData.baseColors
  const territoryIndices = planetMesh.userData.territoryIndices
  const terrData = planetMesh.userData.terrData
  if (!colorAttr || !baseColors || !territoryIndices || !terrData) return

  const hasCollection = showOverlay && Object.keys(collectionGenres).length > 0
  const goldColor = new THREE.Color('#FFD700')
  const tmpColor = new THREE.Color()

  for (let i = 0; i < colorAttr.count; i++) {
    tmpColor.setRGB(baseColors[i * 3], baseColors[i * 3 + 1], baseColors[i * 3 + 2])

    if (hasCollection) {
      const tIdx = territoryIndices[i]
      if (tIdx >= 0) {
        const terr = terrData[tIdx]
        const owned = collectionGenres[terr.slug]
        if (owned) {
          // Subtle gold tint for owned territories
          tmpColor.lerp(goldColor, 0.15)
          tmpColor.multiplyScalar(1.15)
        } else {
          // Desaturate unowned territories
          const gray = tmpColor.r * 0.299 + tmpColor.g * 0.587 + tmpColor.b * 0.114
          tmpColor.r = tmpColor.r * 0.5 + gray * 0.5
          tmpColor.g = tmpColor.g * 0.5 + gray * 0.5
          tmpColor.b = tmpColor.b * 0.5 + gray * 0.5
          tmpColor.multiplyScalar(0.6)
        }
      }
    }

    colorAttr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b)
  }
  colorAttr.needsUpdate = true
}

// ---- Ocean sphere with animated waves ----
const OCEAN_VERTEX = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vViewPos;

  // Simplex-style wave displacement
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289v2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289v2(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec3 pos = position;
    vec3 norm = normalize(position);
    // Spherical UV for noise sampling
    float theta = atan(norm.z, norm.x);
    float phi = acos(norm.y);
    // Single-octave wave displacement (audit AGENT-E item #12: 3-octave
    // noise on 18k verts/frame was the biggest GPU cost on planet view;
    // amplitude compensated to preserve visual body of the ocean).
    float wave1 = snoise(vec2(theta * 3.0 + uTime * 0.15, phi * 3.0 + uTime * 0.1)) * 0.42;
    float displacement = wave1;
    pos += norm * displacement;

    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    vViewPos = (modelViewMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const OCEAN_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vViewPos;

  void main() {
    vec3 viewDir = normalize(-vViewPos);
    // Fresnel for reflective edges
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 4.0);
    // Deep ocean color
    vec3 deepColor = vec3(0.02, 0.04, 0.10);
    vec3 surfaceColor = vec3(0.05, 0.10, 0.22);
    vec3 reflectColor = vec3(0.15, 0.25, 0.45);
    // Mix based on viewing angle
    vec3 color = mix(deepColor, surfaceColor, 0.3 + fresnel * 0.4);
    color = mix(color, reflectColor, fresnel * 0.6);
    // Subtle specular highlight
    vec3 lightDir = normalize(vec3(200.0, 150.0, 100.0) - vWorldPos);
    float spec = pow(max(dot(reflect(-lightDir, vNormal), viewDir), 0.0), 64.0);
    color += vec3(0.4, 0.5, 0.7) * spec * 0.3;
    gl_FragColor = vec4(color, 0.75 + fresnel * 0.15);
  }
`

function buildOceanMesh() {
  const geometry = new THREE.SphereGeometry(GLOBE_RADIUS * 0.995, 96, 96)
  const material = new THREE.ShaderMaterial({
    vertexShader: OCEAN_VERTEX,
    fragmentShader: OCEAN_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.isOcean = true
  return mesh
}

// ---- City lights (emissive dots at territory centers on dark side) ----
function buildCityLights(terrData, sunDir) {
  const count = terrData.length
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const t = terrData[i]
    const pos = t.dir.clone().multiplyScalar(GLOBE_RADIUS * 1.002)
    positions[i * 3] = pos.x
    positions[i * 3 + 1] = pos.y
    positions[i * 3 + 2] = pos.z
    // Warm white-yellow emissive color tinted by territory
    const c = t.color.clone().lerp(new THREE.Color(1.0, 0.9, 0.6), 0.6)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
    // Size proportional to release_count (clamped)
    const rc = t.release_count || 100
    sizes[i] = 1.5 + Math.min(Math.log10(rc + 1) / 3, 2.5)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float size;
      varying vec3 vColor;
      varying float vDarkness;
      uniform vec3 uSunDir;
      void main() {
        vColor = color;
        // Darkness based on angle to sun
        vec3 norm = normalize(position);
        float sunDot = dot(norm, uSunDir);
        vDarkness = smoothstep(-0.1, -0.4, sunDot);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mvPos.z) * vDarkness;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vDarkness;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        float glow = 1.0 - smoothstep(0.0, 0.5, dist);
        glow = pow(glow, 1.5);
        gl_FragColor = vec4(vColor * glow, glow * vDarkness * 0.9);
      }
    `,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(200, 150, 100).normalize() },
    },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  return new THREE.Points(geometry, material)
}

// ---- Nebula background (subtle colored gas clouds behind starfield) ----
function buildNebula() {
  const geometry = new THREE.SphereGeometry(900, 32, 32)
  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      // Value noise
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + .1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float vnoise3(vec3 x) {
        vec3 p = floor(x);
        vec3 f = fract(x);
        f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(p+vec3(0,0,0)), hash(p+vec3(1,0,0)),f.x),
                       mix(hash(p+vec3(0,1,0)), hash(p+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(p+vec3(0,0,1)), hash(p+vec3(1,0,1)),f.x),
                       mix(hash(p+vec3(0,1,1)), hash(p+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float fbmNeb(vec3 p) {
        float val = 0.0, amp = 0.5;
        for (int i = 0; i < 4; i++) {
          val += amp * vnoise3(p);
          p *= 2.0; amp *= 0.5;
        }
        return val;
      }
      void main() {
        vec3 dir = normalize(vDir);
        // Nebula wisps in specific sky regions
        float n1 = fbmNeb(dir * 3.0 + vec3(10.0, 0.0, 5.0));
        float n2 = fbmNeb(dir * 2.5 + vec3(-5.0, 8.0, 3.0));
        float n3 = fbmNeb(dir * 4.0 + vec3(3.0, -7.0, 12.0));
        // Color tinted nebula patches
        vec3 nebula1 = vec3(0.15, 0.05, 0.25) * smoothstep(0.4, 0.7, n1) * 0.3;
        vec3 nebula2 = vec3(0.05, 0.12, 0.25) * smoothstep(0.45, 0.75, n2) * 0.25;
        vec3 nebula3 = vec3(0.18, 0.08, 0.10) * smoothstep(0.5, 0.8, n3) * 0.15;
        vec3 color = nebula1 + nebula2 + nebula3;
        // Vertical gradient: deeper navy at top
        float vGrad = smoothstep(-1.0, 1.0, dir.y);
        vec3 bgGrad = mix(vec3(0.01, 0.01, 0.03), vec3(0.02, 0.02, 0.06), vGrad);
        color += bgGrad;
        float alpha = length(color) > 0.01 ? 1.0 : 0.0;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = -2
  return mesh
}

// ---- Territory border lines (tectonic plate effect) ----
function buildTerritoryBorders(terrData, worldRadius) {
  const borderPoints = []
  const borderColors = []
  const tmpColor = new THREE.Color()

  // For each pair of adjacent territories, draw border arcs
  for (let i = 0; i < terrData.length; i++) {
    for (let j = i + 1; j < terrData.length; j++) {
      const a = terrData[i], b = terrData[j]
      const angle = Math.acos(Math.max(-1, Math.min(1, a.dir.dot(b.dir))))
      // Only draw borders between close territories
      const threshold = (a.angularRadius + b.angularRadius) * Math.PI * 1.1
      if (angle > threshold) continue

      // Midpoint on the sphere, slightly elevated
      const mid = a.dir.clone().add(b.dir).normalize()
      // Generate arc points along the border
      const perpDir = new THREE.Vector3().crossVectors(
        b.dir.clone().sub(a.dir).normalize(),
        mid
      ).normalize()

      const segments = 12
      for (let s = -segments / 2; s <= segments / 2; s++) {
        const t = s / (segments / 2) * (a.angularRadius * Math.PI * 0.4)
        const pt = mid.clone()
          .add(perpDir.clone().multiplyScalar(Math.sin(t) * GLOBE_RADIUS * 0.3))
          .normalize()
          .multiplyScalar(GLOBE_RADIUS * 1.003)
        borderPoints.push(pt.x, pt.y, pt.z)
        // Dim white-ish color, tinted by adjacent territories
        tmpColor.copy(a.color).lerp(b.color, 0.5).multiplyScalar(0.3)
        borderColors.push(tmpColor.r, tmpColor.g, tmpColor.b)
      }
    }
  }

  if (borderPoints.length === 0) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(borderPoints, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(borderColors, 3))

  const material = new THREE.PointsMaterial({
    size: 0.6,
    vertexColors: true,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  })

  return new THREE.Points(geometry, material)
}

// ---- Raycaster territory detection ----
function getTerritoryAtFace(intersect, planetMesh) {
  if (!intersect?.face) return null
  const indices = planetMesh.userData.territoryIndices
  const terrData = planetMesh.userData.terrData
  const candidates = [
    indices[intersect.face.a],
    indices[intersect.face.b],
    indices[intersect.face.c],
  ].filter(idx => idx >= 0)
  if (candidates.length === 0) return null
  const counts = {}
  candidates.forEach(idx => { counts[idx] = (counts[idx] || 0) + 1 })
  const winnerIdx = +Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]
  return terrData[winnerIdx] || null
}

// ---- Territory hover/selection highlighting ----
function highlightTerritory(planetMesh, territory, intensity) {
  if (!planetMesh) return
  const colorAttr = planetMesh.geometry.getAttribute('color')
  const baseColors = planetMesh.userData.baseColors
  const indices = planetMesh.userData.territoryIndices
  const terrData = planetMesh.userData.terrData
  if (!colorAttr || !baseColors || !indices || !terrData) return

  const terrIdx = terrData.indexOf(territory)
  if (terrIdx < 0) return

  const tmpColor = new THREE.Color()
  for (let i = 0; i < colorAttr.count; i++) {
    tmpColor.setRGB(baseColors[i * 3], baseColors[i * 3 + 1], baseColors[i * 3 + 2])
    if (indices[i] === terrIdx) {
      tmpColor.multiplyScalar(1.0 + intensity)
    }
    colorAttr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b)
  }
  colorAttr.needsUpdate = true
}

function clearHighlight(planetMesh) {
  if (!planetMesh) return
  const colorAttr = planetMesh.geometry.getAttribute('color')
  const baseColors = planetMesh.userData.baseColors
  if (!colorAttr || !baseColors) return
  for (let i = 0; i < colorAttr.count; i++) {
    colorAttr.setXYZ(i, baseColors[i * 3], baseColors[i * 3 + 1], baseColors[i * 3 + 2])
  }
  colorAttr.needsUpdate = true
}

// ---- Main component ----
export default function GenrePlanet({ paused = false }) {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const composerRef = useRef(null)
  const animFrameRef = useRef(null)
  const planetMeshRef = useRef(null)
  const buildingSystemRef = useRef(null)
  const genreSkyRef = useRef(null)
  const genreParticlesRef = useRef(null)
  const lastBiomeRef = useRef(null)
  const clockRef = useRef(new THREE.Clock())
  const pausedRef = useRef(paused)
  const raycasterRef = useRef(new THREE.Raycaster())
  const mouseRef = useRef(new THREE.Vector2())
  const clickStartRef = useRef({ x: 0, y: 0 })
  const oceanRef = useRef(null)
  const hoveredTerritoryRef = useRef(null)
  const selectedTerritoryRef = useRef(null)
  const selectionPulseRef = useRef(0)

  const setActivePlanetTerritory = useStore(s => s.setActivePlanetTerritory)
  const releases = useStore(s => s.releases)
  const setPlayerQueue = useStore(s => s.setPlayerQueue)

  const onPointerDown = useCallback((e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    clickStartRef.current = { x: clientX, y: clientY }
  }, [])

  const onPointerUp = useCallback((event) => {
    const clientX = event.changedTouches ? event.changedTouches[0].clientX : event.clientX
    const clientY = event.changedTouches ? event.changedTouches[0].clientY : event.clientY
    // Ignore drags (orbit)
    const dx = clientX - clickStartRef.current.x
    const dy = clientY - clickStartRef.current.y
    if (Math.sqrt(dx * dx + dy * dy) > 10) return

    if (!containerRef.current || !planetMeshRef.current || !cameraRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    mouseRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1
    mouseRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current)
    const intersects = raycasterRef.current.intersectObject(planetMeshRef.current)

    if (intersects.length > 0) {
      const terr = getTerritoryAtFace(intersects[0], planetMeshRef.current)
      if (terr) {
        setActivePlanetTerritory(terr)
        selectedTerritoryRef.current = terr
        selectionPulseRef.current = 0

        // Spawn buildings for this territory
        if (buildingSystemRef.current) {
          buildingSystemRef.current.showForTerritory(terr)
        }

        // Transition sky and particles to match territory biome
        const biome = terr.biome || 'unknown'
        if (biome !== lastBiomeRef.current) {
          if (genreSkyRef.current) {
            genreSkyRef.current.transitionTo(biome, 1.0)
          }
          if (genreParticlesRef.current) {
            genreParticlesRef.current.transitionTo(biome)
            genreParticlesRef.current.setVisible(true)
          }
          lastBiomeRef.current = biome
        }

        // Fly camera toward territory
        const target = terr.dir.clone().multiplyScalar(220)
        const controls = controlsRef.current
        if (controls) {
          controls.autoRotate = false
          const start = cameraRef.current.position.clone()
          const duration = 1200
          const startTime = performance.now()
          const flyTo = () => {
            if (!cameraRef.current) return
            const elapsed = performance.now() - startTime
            const t = Math.min(1, elapsed / duration)
            const eased = t < 0.5
              ? 4 * t * t * t
              : 1 - Math.pow(-2 * t + 2, 3) / 2
            cameraRef.current.position.lerpVectors(start, target, eased)
            controls.update()
            if (t < 1) requestAnimationFrame(flyTo)
            else {
              setTimeout(() => {
                if (controlsRef.current) controlsRef.current.autoRotate = true
              }, 60000)
            }
          }
          flyTo()
        }
      }
    }
  }, [setActivePlanetTerritory])

  useEffect(() => {
    if (!containerRef.current || sceneRef.current) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 2000)
    camera.position.set(0, 80, 220)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    renderer.setClearColor(0x050510)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.25
    controls.minDistance = 120
    controls.maxDistance = 500
    // Touch: one finger rotate, two fingers pinch-zoom and pan
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    }
    controlsRef.current = controls

    // Lighting — 4-point setup with cyan rim (worldmonitor-inspired)
    scene.add(new THREE.AmbientLight(0x334466, 0.45))
    const dir = new THREE.DirectionalLight(0xffeedd, 1.0)
    dir.position.set(200, 150, 100)
    scene.add(dir)
    const fill = new THREE.DirectionalLight(0x4466aa, 0.35)
    fill.position.set(-100, -50, -100)
    scene.add(fill)
    // Cyan rim light — adds depth and sci-fi atmosphere
    const cyanRim = new THREE.PointLight(0x00d4ff, 0.4)
    cyanRim.position.set(-150, -80, -120)
    scene.add(cyanRim)

    // Reuse globe atmosphere + starfield (GLOBE_RADIUS=100)
    const cleanupAtmosphere = addAtmosphere(scene, GLOBE_RADIUS)
    const cleanupStarfield = addStarfield(scene, 2000, 800)

    // Genre sky dome (behind everything, BackSide sphere)
    const genreSky = createGenreSky('unknown')
    scene.add(genreSky.mesh)
    genreSkyRef.current = genreSky

    // Genre particles (near camera, parallax effect)
    const genreParticles = createGenreParticles('unknown', 300)
    genreParticles.setVisible(false) // hidden until a territory is focused
    scene.add(genreParticles.points)
    genreParticlesRef.current = genreParticles

    // Nebula background
    const nebulaMesh = buildNebula()
    scene.add(nebulaMesh)

    // Ocean with animated waves
    const oceanMesh = buildOceanMesh()
    scene.add(oceanMesh)
    oceanRef.current = oceanMesh

    // Bloom
    const { composer, resize: resizeBloom, cleanup: cleanupBloom } = setupBloom(
      renderer, scene, camera
    )
    composerRef.current = composer

    // Track additional meshes for cleanup
    const extraMeshes = [nebulaMesh]

    // Hover raycaster for territory highlighting
    let hoverMouse = new THREE.Vector2(-999, -999)
    const onMouseMove = (e) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      hoverMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      hoverMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }
    container.addEventListener('mousemove', onMouseMove)

    // Render loop (respects pausedRef)
    let elapsedTime = 0
    const hoverRaycaster = new THREE.Raycaster()

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)
      if (pausedRef.current) return
      const delta = clockRef.current.getDelta()
      elapsedTime += delta
      controls.update()

      // Update ocean waves
      if (oceanRef.current) {
        oceanRef.current.material.uniforms.uTime.value = elapsedTime
      }
      // Hover detection (throttled: every 3 frames)
      if (planetMeshRef.current && Math.floor(elapsedTime * 60) % 3 === 0) {
        hoverRaycaster.setFromCamera(hoverMouse, camera)
        const hits = hoverRaycaster.intersectObject(planetMeshRef.current)
        if (hits.length > 0) {
          const terr = getTerritoryAtFace(hits[0], planetMeshRef.current)
          if (terr && terr !== hoveredTerritoryRef.current) {
            hoveredTerritoryRef.current = terr
            highlightTerritory(planetMeshRef.current, terr, 0.15)
          }
        } else if (hoveredTerritoryRef.current) {
          clearHighlight(planetMeshRef.current)
          hoveredTerritoryRef.current = null
        }
      }

      // Selection pulse animation
      if (selectedTerritoryRef.current && planetMeshRef.current) {
        selectionPulseRef.current += delta
        const pulse = Math.sin(selectionPulseRef.current * 3) * 0.05 + 0.2
        highlightTerritory(planetMeshRef.current, selectedTerritoryRef.current, pulse)
      }

      if (buildingSystemRef.current) {
        buildingSystemRef.current.update(camera)
      }
      if (genreSkyRef.current) {
        genreSkyRef.current.update(delta)
        // Keep sky centered on camera
        genreSkyRef.current.mesh.position.copy(camera.position)
      }
      if (genreParticlesRef.current) {
        genreParticlesRef.current.update(delta, camera.position)
      }
      composer.render()
    }
    animate()

    // Load data and build planet
    fetch('/data/genre_planet.json')
      .then(r => r.json())
      .then(data => {
        const planetMesh = buildPlanetMesh(data)
        scene.add(planetMesh)
        planetMeshRef.current = planetMesh
        buildingSystemRef.current = createBuildingSystem(scene, planetMesh)

        // City lights at territory centers
        const terrData = planetMesh.userData.terrData
        const cityLights = buildCityLights(terrData)
        scene.add(cityLights)
        extraMeshes.push(cityLights)

        // Territory border lines
        const borders = buildTerritoryBorders(terrData, data.meta.world_radius)
        if (borders) {
          scene.add(borders)
          extraMeshes.push(borders)
        }

        // Apply collection overlay if already active
        const storeState = useStore.getState()
        if (storeState.showCollectionOverlay) {
          applyCollectionOverlay(planetMesh, storeState.collectionGenres, true)
        }
      })
      .catch(err => console.error('Failed to load genre_planet.json:', err))

    // Interaction (mouse + touch)
    container.addEventListener('mousedown', onPointerDown)
    container.addEventListener('mouseup', onPointerUp)
    container.addEventListener('touchstart', onPointerDown, { passive: true })
    container.addEventListener('touchend', onPointerUp)

    const onResize = () => {
      if (!containerRef.current) return
      const w = containerRef.current.clientWidth
      const h = containerRef.current.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      resizeBloom(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      container.removeEventListener('mousedown', onPointerDown)
      container.removeEventListener('mouseup', onPointerUp)
      container.removeEventListener('touchstart', onPointerDown)
      container.removeEventListener('touchend', onPointerUp)
      container.removeEventListener('mousemove', onMouseMove)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (buildingSystemRef.current) {
        buildingSystemRef.current.dispose()
        buildingSystemRef.current = null
      }
      // Dispose extra meshes (nebula, clouds, city lights, borders)
      extraMeshes.forEach(m => {
        scene.remove(m)
        if (m.geometry) m.geometry.dispose()
        if (m.material) m.material.dispose()
      })
      if (oceanRef.current) {
        scene.remove(oceanRef.current)
        oceanRef.current.geometry.dispose()
        oceanRef.current.material.dispose()
        oceanRef.current = null
      }
      cleanupAtmosphere()
      cleanupStarfield()
      cleanupBloom()
      controls.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      if (genreSkyRef.current) {
        genreSkyRef.current.dispose()
        genreSkyRef.current = null
      }
      if (genreParticlesRef.current) {
        genreParticlesRef.current.dispose()
        genreParticlesRef.current = null
      }
      hoveredTerritoryRef.current = null
      selectedTerritoryRef.current = null
      lastBiomeRef.current = null
      sceneRef.current = null
      rendererRef.current = null
      cameraRef.current = null
      controlsRef.current = null
      planetMeshRef.current = null
    }
  }, [onPointerDown, onPointerUp])

  // Sync paused prop to ref
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  // React to collection overlay changes — update planet vertex colors
  useEffect(() => {
    const unsub = useStore.subscribe((state, prevState) => {
      if (state.collectionGenres === prevState.collectionGenres &&
          state.showCollectionOverlay === prevState.showCollectionOverlay) return
      applyCollectionOverlay(
        planetMeshRef.current,
        state.collectionGenres,
        state.showCollectionOverlay
      )
    })
    return unsub
  }, [])

  const activeTerritory = useStore(s => s.activePlanetTerritory)

  return (
    <>
      <div
        className="genre-planet-container"
        ref={containerRef}
        style={{ display: paused ? 'none' : undefined }}
      />
      {activeTerritory && (
        <div className="territory-panel">
          <button
            className="territory-panel-close"
            onClick={() => {
              setActivePlanetTerritory(null)
              selectedTerritoryRef.current = null
              if (planetMeshRef.current) clearHighlight(planetMeshRef.current)
              // Hide particles and reset sky when leaving territory
              if (genreParticlesRef.current) {
                genreParticlesRef.current.setVisible(false)
              }
              if (genreSkyRef.current) {
                genreSkyRef.current.transitionTo('unknown', 1.0)
              }
              lastBiomeRef.current = null
            }}
          >
            &times;
          </button>
          <h2 style={{ color: activeTerritory.color }}>{activeTerritory.name}</h2>
          <div className="territory-panel-biome">
            {activeTerritory.scene} &middot; {activeTerritory.biome}
          </div>
          <div className="territory-panel-meta">
            {activeTerritory.release_count > 0 && (
              <span>{(activeTerritory.release_count / 1000).toFixed(0)}K releases</span>
            )}
            <span>elevation {(activeTerritory.elevation * 100).toFixed(0)}%</span>
          </div>
          {(() => {
            const slug = activeTerritory.slug || activeTerritory.name?.toLowerCase().replace(/\s+/g, '-')
            const tracks = releases.filter(t => t.youtube && (t.genre === slug || t.genre === activeTerritory.name || t.genres?.includes(slug)))
            if (!tracks.length) return null
            return (
              <button
                className="territory-panel-play"
                onClick={() => setPlayerQueue(tracks, 0)}
                style={{ marginTop: 10, padding: '6px 14px', background: `${activeTerritory.color}22`, border: `1px solid ${activeTerritory.color}66`, borderRadius: 6, color: activeTerritory.color, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
              >
                &#9654; Play {tracks.length} track{tracks.length !== 1 ? 's' : ''}
              </button>
            )
          })()}
        </div>
      )}
    </>
  )
}
