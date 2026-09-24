// Look lab: distance haze and optional construct seams, patched into any
// three.js material in place of its fog. Haze grows with horizontal distance
// from the player, and with height, so tall towers dissolve into the sky.

import { Color, LinearSRGBColorSpace, Vector2, Vector3, type Material, type WebGLProgramParametersWithUniforms } from 'three'

export const haze = {
  uHzFocus: { value: new Vector2() },
  /** Unit vector from the focus towards the camera; haze grows with depth behind the focus. */
  uHzView: { value: new Vector3(0, 0, 1) },
  uHzY: { value: 0 },
  uHzColor: { value: new Color() },
  uHzNear: { value: 9 },
  uHzFar: { value: 28 },
  uHzTop: { value: 18 },
  uSeams: { value: 0 },
  uSeamColor: { value: new Color() },
  uNight: { value: 0 },
}

const VERT_HEAD = /* glsl */ `varying vec3 vHzW;`
const VERT_BODY = /* glsl */ `
  {
    vec4 hw = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      hw = instanceMatrix * hw;
    #endif
    vHzW = (modelMatrix * hw).xyz;
  }`
const FRAG_HEAD = /* glsl */ `
  varying vec3 vHzW;
  uniform vec2 uHzFocus;
  uniform vec3 uHzColor, uSeamColor, uHzView;
  uniform float uHzY;
  uniform float uHzNear, uHzFar, uHzTop, uSeams;
  float hzLine(vec2 p) {
    vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }`
const FRAG_BODY = /* glsl */ `
  {
    // Depth behind the player as seen from the camera, plus a little radial
    // falloff so the sides of the view thin out too.
    vec3 rel = vHzW - vec3(uHzFocus.x, uHzY, uHzFocus.y);
    float behind = -dot(rel, uHzView);
    float side = length(rel - dot(rel, uHzView) * uHzView);
    float up = max(rel.y - 2.0, 0.0);
    float f = smoothstep(uHzNear, uHzFar, max(behind, 0.0) * 0.8 + side * 0.4 + up * 0.9);
    vec3 col = mix(gl_FragColor.rgb, uHzColor, f);
    if (uSeams > 0.5) {
      // Where the haze thickens the construct shows through: surfaces lose
      // their material and keep only a half-unit grid.
      vec3 n = abs(normalize(cross(dFdx(vHzW), dFdy(vHzW))));
      vec2 p = n.y > 0.5 ? vHzW.xz : (n.x > 0.5 ? vHzW.zy : vHzW.xy);
      float band = smoothstep(0.25, 0.7, f);
      col = mix(col, uHzColor, band * 0.6);
      col = mix(col, uSeamColor, hzLine(p * 2.0) * band * 0.75);
    }
    gl_FragColor.rgb = col;
  }`

type Patch = (shader: WebGLProgramParametersWithUniforms) => void

/** Give a material the haze, plus an optional patch of its own. `key` must differ per patch. */
export function hazed<T extends Material>(m: T, key = 'plain', extra?: Patch): T {
  m.onBeforeCompile = (shader) => {
    extra?.(shader)
    Object.assign(shader.uniforms, haze)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <fog_fragment>', FRAG_BODY)
  }
  m.customProgramCacheKey = () => `hazed-${key}`
  return m
}

// ── Sky, clock and weather ────────────────────────────────────────────────

export type WeatherKind = 'overcast' | 'drizzle' | 'fog' | 'clear'

/** Hours since midnight in Japan (Asia/Tokyo has no daylight saving). */
export function jstHour(now = new Date()): number {
  return ((now.getUTCHours() + 9) % 24) + now.getUTCMinutes() / 60
}

/** The same weather for everyone on a given Japanese calendar day. */
export function weatherFor(now = new Date()): WeatherKind {
  const jst = new Date(now.getTime() + 9 * 3600_000)
  const key = jst.toISOString().slice(0, 10)
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  const r = ((h >>> 0) % 1000) / 1000
  return r < 0.45 ? 'overcast' : r < 0.7 ? 'drizzle' : r < 0.9 ? 'fog' : 'clear'
}

interface Key {
  h: number
  haze: number
  hemiSky: number
  hemiGround: number
  hemi: number
  sun: number
  sunI: number
  night: number
}

// Keyframes through a Chiba day. Overcast is the base; weather adjusts it.
const KEYS: Key[] = [
  { h: 0, haze: 0x2b2724, hemiSky: 0x55504c, hemiGround: 0x1c1814, hemi: 1.5, sun: 0xb8c0cc, sunI: 0.15, night: 1 },
  { h: 5, haze: 0x2e2e30, hemiSky: 0x55565a, hemiGround: 0x1a1714, hemi: 1.5, sun: 0xb8c0cc, sunI: 0.15, night: 1 },
  { h: 7, haze: 0x9a9b9c, hemiSky: 0xb9bcc0, hemiGround: 0x4a4540, hemi: 2.0, sun: 0xf2e6d4, sunI: 0.6, night: 0.2 },
  { h: 12, haze: 0xb7b8b4, hemiSky: 0xdcded9, hemiGround: 0x5a5550, hemi: 2.4, sun: 0xfff2e2, sunI: 0.9, night: 0 },
  { h: 16, haze: 0xafa89e, hemiSky: 0xd6cfc2, hemiGround: 0x5a5046, hemi: 2.2, sun: 0xffe2c0, sunI: 0.9, night: 0 },
  { h: 18, haze: 0x7d736b, hemiSky: 0x9c948d, hemiGround: 0x36302b, hemi: 1.5, sun: 0xffa35a, sunI: 1.3, night: 0.45 },
  { h: 19.5, haze: 0x2f2a27, hemiSky: 0x57524e, hemiGround: 0x1c1814, hemi: 1.5, sun: 0xb8c0cc, sunI: 0.15, night: 1 },
  { h: 24, haze: 0x2b2724, hemiSky: 0x55504c, hemiGround: 0x1c1814, hemi: 1.5, sun: 0xb8c0cc, sunI: 0.15, night: 1 },
]

const ca = new Color(), cb = new Color()
function lerpHex(a: number, b: number, t: number): number {
  return ca.setHex(a, LinearSRGBColorSpace).lerp(cb.setHex(b, LinearSRGBColorSpace), t).getHex(LinearSRGBColorSpace)
}

export interface Sky {
  haze: number
  hemiSky: number
  hemiGround: number
  hemi: number
  sun: number
  sunI: number
  night: number
  near: number
  far: number
  /** Unit vector towards the sun (or moon). */
  sunDir: [number, number, number]
}

export function skyAt(hour: number, weather: WeatherKind): Sky {
  let i = 0
  while (KEYS[i + 1]!.h < hour) i++
  const a = KEYS[i]!, b = KEYS[i + 1]!
  const t = (hour - a.h) / (b.h - a.h)
  const mix = (x: number, y: number) => x + (y - x) * t
  const s: Sky = {
    haze: lerpHex(a.haze, b.haze, t),
    hemiSky: lerpHex(a.hemiSky, b.hemiSky, t),
    hemiGround: lerpHex(a.hemiGround, b.hemiGround, t),
    hemi: mix(a.hemi, b.hemi),
    sun: lerpHex(a.sun, b.sun, t),
    sunI: mix(a.sunI, b.sunI),
    night: mix(a.night, b.night),
    near: 2,
    far: 17,
    sunDir: [0, 1, 0],
  }
  if (weather === 'clear') { s.sunI *= 2.4; s.near = 5; s.far = 30 }
  if (weather === 'drizzle') { s.sunI *= 0.6; s.near = 1.5; s.far = 13; s.haze = lerpHex(s.haze, 0x6f7479, 0.2 * (1 - s.night)) }
  if (weather === 'fog') { s.sunI *= 0.4; s.near = 0.5; s.far = 10 }
  // The sun rises in the east (+X) at six and sets in the west at six.
  const day = (hour - 6) / 12
  const elev = day > 0 && day < 1 ? Math.max(0.14, Math.sin(day * Math.PI) * 0.95) : 1.1
  const az = day > 0 && day < 1 ? Math.PI * (1 - day) : 0.6
  s.sunDir = [Math.cos(az) * Math.cos(elev), Math.sin(elev), -0.45 * Math.cos(elev)]
  return s
}
