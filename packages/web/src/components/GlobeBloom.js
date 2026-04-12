/**
 * UnrealBloomPass at half resolution for premium glow.
 * Applied to globe.gl's renderer directly.
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @returns {{ composer: EffectComposer, resize: Function, cleanup: Function }}
 */
export function setupBloom(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2())

  // Use native sRGB + ACES tone mapping on the renderer instead of a separate
  // OutputPass — OutputPass triggered sync ReadPixels stalls on ANGLE/Metal
  // when the bloom composer shared the WebGL context with R3F's Canvas
  // (two postprocessing pipelines fighting for the same GL context).
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0

  const composer = new EffectComposer(renderer)
  composer.setSize(size.x, size.y)
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)

  // Half-res bloom for performance
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x / 2, size.y / 2),
    1.2,    // strength
    0.4,    // radius
    0.8     // threshold
  )
  composer.addPass(bloomPass)

  const resize = (width, height) => {
    composer.setSize(width, height)
    bloomPass.resolution.set(width / 2, height / 2)
  }

  const cleanup = () => {
    composer.dispose()
  }

  return { composer, resize, cleanup }
}
