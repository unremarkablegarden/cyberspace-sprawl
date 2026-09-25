// Look lab: a small post-processing chain in three.js core (no addons).
// The scene renders to a multisampled half-float target in linear light; then
// bright parts are blurred into a bloom, the top and bottom of the frame get a
// gentle tilt-shift blur, and the result is tone mapped, graded and grained.

import {
  HalfFloatType, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderTarget,
  type Camera, type WebGLRenderer,
} from 'three'

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

function target(samples = 0): WebGLRenderTarget {
  return new WebGLRenderTarget(1, 1, { type: HalfFloatType, magFilter: LinearFilter, minFilter: LinearFilter, samples })
}

export class Post {
  exposure = 1.0
  bloom = 0.6
  #scene = target(2)
  #soft = target()
  #blurA = [target(), target()]
  #blurB = [target(), target()]
  #quad = new Mesh(new PlaneGeometry(2, 2))
  #quadScene = new Scene()
  #cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

  // Straight from full size to a quarter: four bilinear taps cover the 4×4
  // source pixels under each output pixel. The bright pass keeps only what
  // is over the threshold, tap by tap, so thin lit windows still bloom.
  #downMat = (bright: boolean) => new ShaderMaterial({
    uniforms: { tSrc: { value: null }, uTexel: { value: new Vector2() }, uThreshold: { value: 0.85 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
      vec3 tap(vec2 o) {
        vec3 c = texture2D(tSrc, vUv + o * uTexel).rgb;
        ${bright ? 'c *= smoothstep(uThreshold, uThreshold + 0.6, dot(c, vec3(0.2126, 0.7152, 0.0722)));' : ''}
        return c;
      }
      void main() {
        gl_FragColor = vec4((tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.25, 1.0);
      }`,
  })
  #brightMat = this.#downMat(true)
  #boxMat = this.#downMat(false)

  #blurMat = new ShaderMaterial({
    uniforms: { tSrc: { value: null }, uDir: { value: new Vector2() } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
        c += (texture2D(tSrc, vUv + uDir * 1.385).rgb + texture2D(tSrc, vUv - uDir * 1.385).rgb) * 0.316;
        c += (texture2D(tSrc, vUv + uDir * 3.231).rgb + texture2D(tSrc, vUv - uDir * 3.231).rgb) * 0.070;
        gl_FragColor = vec4(c, 1.0);
      }`,
  })

  #finalMat = new ShaderMaterial({
    uniforms: {
      tScene: { value: null }, tSoft: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
      uExposure: { value: 1 }, uBloom: { value: 0.6 }, uTime: { value: 0 }, uRes: { value: new Vector2(1, 1) },
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene, tSoft, tBloomA, tBloomB;
      uniform float uExposure, uBloom, uTime;
      uniform vec2 uRes;
      varying vec2 vUv;
      // ACES filmic fit (Stephen Hill), the same curve three.js uses.
      vec3 rrt(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 aces(vec3 c) {
        const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
        const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
        return clamp(outM * rrt(inM * (c * uExposure / 0.6)), 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 sharp = texture2D(tScene, vUv).rgb;
        vec3 soft = texture2D(tSoft, vUv).rgb;
        // Tilt-shift: the band around the player stays sharp, top and bottom soften.
        float tilt = smoothstep(0.22, 0.5, abs(vUv.y - 0.5));
        vec3 c = mix(sharp, soft, tilt * 0.85);
        c += (texture2D(tBloomA, vUv).rgb * 0.6 + texture2D(tBloomB, vUv).rgb * 0.8) * uBloom;
        c = toSRGB(aces(c));
        vec2 q = vUv - 0.5;
        c *= 1.0 - dot(q, q) * 0.45;
        c += (hash(vUv * uRes + fract(uTime) * 91.0) - 0.5) * 0.028;
        gl_FragColor = vec4(c, 1.0);
      }`,
  })

  constructor(private gl: WebGLRenderer) {
    this.#quad.frustumCulled = false
    this.#quadScene.add(this.#quad)
  }

  setSize(w: number, h: number): void {
    const pr = this.gl.getPixelRatio()
    const W = Math.floor(w * pr), H = Math.floor(h * pr)
    this.#scene.setSize(W, H)
    this.#soft.setSize(W >> 2, H >> 2)
    for (const m of [this.#brightMat, this.#boxMat]) m.uniforms.uTexel!.value.set(1 / W, 1 / H)
    for (const t of this.#blurA) t.setSize(W >> 2, H >> 2)
    for (const t of this.#blurB) t.setSize(W >> 3, H >> 3)
    this.#finalMat.uniforms.uRes!.value.set(W, H)
  }

  #pass(mat: ShaderMaterial, out: WebGLRenderTarget | null): void {
    this.#quad.material = mat
    this.gl.setRenderTarget(out)
    this.gl.render(this.#quadScene, this.#cam)
  }

  #blur(src: WebGLRenderTarget, pair: WebGLRenderTarget[], passes: number): void {
    const [a, b] = pair as [WebGLRenderTarget, WebGLRenderTarget]
    const u = this.#blurMat.uniforms
    let from = src
    for (let i = 0; i < passes; i++) {
      u.tSrc!.value = from.texture
      u.uDir!.value.set(1 / a.width, 0)
      this.#pass(this.#blurMat, a)
      u.tSrc!.value = a.texture
      u.uDir!.value.set(0, 1 / a.height)
      this.#pass(this.#blurMat, b)
      from = b
    }
  }

  render(scene: Scene, camera: Camera, time: number): void {
    this.gl.setRenderTarget(this.#scene)
    this.gl.render(scene, camera)

    // Bloom: bright pass straight to a quarter, blurred there and at an eighth.
    const [qa, qb] = this.#blurA as [WebGLRenderTarget, WebGLRenderTarget]
    this.#brightMat.uniforms.tSrc!.value = this.#scene.texture
    this.#pass(this.#brightMat, qb)
    this.#blur(qb, this.#blurA, 2)
    this.#blur(qb, this.#blurB, 2)

    // A soft copy of the scene for the tilt-shift, at a quarter. The blur
    // steps match the old half-size chain: three full-size pixels.
    this.#boxMat.uniforms.tSrc!.value = this.#scene.texture
    this.#pass(this.#boxMat, this.#soft)
    const u = this.#blurMat.uniforms
    u.tSrc!.value = this.#soft.texture
    u.uDir!.value.set(0.75 / qa.width, 0)
    this.#pass(this.#blurMat, qa)
    u.tSrc!.value = qa.texture
    u.uDir!.value.set(0, 0.75 / qa.height)
    this.#pass(this.#blurMat, this.#soft)
    const softTarget = this.#soft

    const f = this.#finalMat.uniforms
    f.tScene!.value = this.#scene.texture
    f.tSoft!.value = softTarget.texture
    f.tBloomA!.value = qb.texture
    f.tBloomB!.value = this.#blurB[1]!.texture
    f.uExposure!.value = this.exposure
    f.uBloom!.value = this.bloom
    f.uTime!.value = time
    this.#pass(this.#finalMat, null)
  }
}
