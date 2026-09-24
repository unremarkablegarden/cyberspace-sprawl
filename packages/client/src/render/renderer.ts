// The renderer: a true-3D scene seen through an orthographic camera at a
// fixed isometric angle, drawn into a small render target and scaled up with
// nearest-neighbour filtering. That gives crisp pixel-art edges from ordinary
// low-poly geometry, and leaves the door open to other camera angles later.
//
// Pixel-art shimmer (edges crawling as the camera moves) is avoided by moving
// the camera only in whole low-res pixels and shifting the upscaled image by
// the sub-pixel remainder instead.

import {
  Color, Fog, HemisphereLight, DirectionalLight, Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, Scene,
  ShaderMaterial, SRGBColorSpace, Vector3, WebGLRenderer, WebGLRenderTarget, Vector2,
} from 'three'
import { PIXEL_SCALE } from '../config.ts'

/** Dimetric angle: elevation atan(1/2) makes tile edges exact 2:1 pixel staircases. */
const ELEVATION = Math.atan(0.5)
const AZIMUTH = Math.PI / 4
const CAMERA_DISTANCE = 60
/** Border of spare low-res pixels, so the sub-pixel shift never shows an edge. */
const MARGIN = 2

export class Renderer {
  readonly scene = new Scene()
  readonly camera = new OrthographicCamera()
  readonly gl: WebGLRenderer
  /** World units visible from top to bottom of the screen. */
  viewHeight = 9.5
  #target = new WebGLRenderTarget(1, 1, { magFilter: NearestFilter, minFilter: NearestFilter })
  #post: { scene: Scene; camera: OrthographicCamera; material: ShaderMaterial }
  #focus = new Vector3()
  #lowW = 1
  #lowH = 1
  #dir = new Vector3(
    Math.cos(ELEVATION) * Math.sin(AZIMUTH),
    Math.sin(ELEVATION),
    Math.cos(ELEVATION) * Math.cos(AZIMUTH),
  )

  constructor(readonly canvas: HTMLCanvasElement) {
    this.gl = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    this.gl.setPixelRatio(1)
    this.gl.outputColorSpace = SRGBColorSpace
    this.#target.texture.colorSpace = SRGBColorSpace

    this.scene.add(new HemisphereLight(0xb0a0ff, 0x3a2a50, 4.2))
    const moon = new DirectionalLight(0xc8dcff, 2.4)
    moon.position.set(-20, 40, 10)
    this.scene.add(moon)

    const material = new ShaderMaterial({
      uniforms: {
        tScene: { value: this.#target.texture },
        uLow: { value: new Vector2(1, 1) },
        uShift: { value: new Vector2() },
        uMargin: { value: MARGIN },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene;
        uniform vec2 uLow, uShift;
        uniform float uMargin, uTime;
        varying vec2 vUv;
        // 4x4 ordered dither, then 5 bits a channel: the retro colour banding.
        float bayer(vec2 p) {
          int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
          return float(m[i]) / 16.0 - 0.5;
        }
        void main() {
          vec2 inner = uLow - 2.0 * uMargin;
          vec2 px = vUv * inner + uMargin + uShift;
          vec3 c = texture2D(tScene, px / uLow).rgb;
          vec2 cell = floor(px);
          c = floor(c * 31.0 + 0.5 + bayer(cell) * 0.9) / 31.0;
          // Faint scanlines and vignette.
          c *= 0.94 + 0.06 * mod(cell.y, 2.0);
          vec2 q = vUv - 0.5;
          c *= 1.0 - dot(q, q) * 0.55;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    })
    const quad = new Mesh(new PlaneGeometry(2, 2), material)
    quad.frustumCulled = false
    const post = new Scene()
    post.add(quad)
    this.#post = { scene: post, camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1), material }

    this.resize()
    addEventListener('resize', () => this.resize())
  }

  setSky(sky: number, fog: number): void {
    this.scene.background = new Color(sky)
    this.scene.fog = new Fog(fog, CAMERA_DISTANCE - 4, CAMERA_DISTANCE + 22)
  }

  resize(): void {
    const w = innerWidth, h = innerHeight
    this.gl.setSize(w, h, false)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.#lowW = Math.ceil(w / PIXEL_SCALE) + MARGIN * 2
    this.#lowH = Math.ceil(h / PIXEL_SCALE) + MARGIN * 2
    this.#target.setSize(this.#lowW, this.#lowH)
    this.#post.material.uniforms.uLow!.value.set(this.#lowW, this.#lowH)
    this.#updateProjection()
  }

  #updateProjection(): void {
    // Size the frustum to the whole target, margin included, so one target
    // pixel covers exactly `texel` world units.
    const texel = this.viewHeight / (this.#lowH - MARGIN * 2)
    const halfH = (this.#lowH * texel) / 2
    const halfW = (this.#lowW * texel) / 2
    Object.assign(this.camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH, near: 0.1, far: 200 })
    this.camera.updateProjectionMatrix()
  }

  /** Low-res pixel size in world units. */
  get texel(): number {
    return this.viewHeight / (this.#lowH - MARGIN * 2)
  }

  /** Point the camera at a world position (smoothly done by the caller). */
  lookAt(x: number, y: number, z: number): void {
    this.#focus.set(x, y, z)
  }

  render(time: number): void {
    // Express the focus in camera-plane coordinates, snap to whole texels,
    // and hand the remainder to the upscale pass.
    const right = new Vector3(Math.cos(AZIMUTH), 0, -Math.sin(AZIMUTH))
    const up = new Vector3().crossVectors(this.#dir, right).normalize()
    const t = this.texel
    const u = this.#focus.dot(right) / t
    const v = this.#focus.dot(up) / t
    const su = Math.round(u), sv = Math.round(v)
    const depth = this.#focus.dot(this.#dir)
    const snapped = right.clone().multiplyScalar(su * t).addScaledVector(up, sv * t).addScaledVector(this.#dir, depth)
    this.camera.position.copy(snapped).addScaledVector(this.#dir, CAMERA_DISTANCE)
    this.camera.lookAt(snapped)
    const uniforms = this.#post.material.uniforms
    uniforms.uShift!.value.set(u - su, v - sv)
    uniforms.uTime!.value = time

    this.gl.setRenderTarget(this.#target)
    this.gl.render(this.scene, this.camera)
    this.gl.setRenderTarget(null)
    this.gl.render(this.#post.scene, this.#post.camera)
  }
}
