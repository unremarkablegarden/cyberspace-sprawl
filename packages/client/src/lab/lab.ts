// Look lab: a page for trying the new look without the server. Controls along
// the bottom switch scene, hour, weather and seams live. The query string sets
// the starting state:  /lab.html?scene=capsule&hour=23&weather=drizzle&seams=1&zoom=12
// Hour and weather default to the real Japan clock and today's seeded weather.

import {
  Color, DirectionalLight, HemisphereLight, NoToneMapping, OrthographicCamera, PCFShadowMap, Scene, SRGBColorSpace,
  Vector3, WebGLRenderer,
} from 'three'
import { generateDistrict } from '@sprawl/shared'
import { districtById, START_DISTRICT } from '@sprawl/content'
import { haze, jstHour, skyAt, weatherFor, type WeatherKind } from './haze.ts'
import { Post } from './post.ts'
import { blobTexture, buildStreet } from './street.ts'
import { animateWalk, buildFigure, type FigureSpec, type Rig } from './figure.ts'
import { buildLife } from './life.ts'
import { buildCapsule } from './capsule.ts'
import { Rain } from '../render/rain.ts'

const WEATHERS: WeatherKind[] = ['overcast', 'drizzle', 'fog', 'clear']
const q = new URLSearchParams(location.search)
const state = {
  scene: q.get('scene') === 'capsule' ? 'capsule' : 'street',
  hour: q.has('hour') ? Number(q.get('hour')) : jstHour(),
  weather: WEATHERS.includes(q.get('weather') as WeatherKind) ? (q.get('weather') as WeatherKind) : weatherFor(),
  seams: q.get('seams') === '1',
}

const gl = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
gl.setPixelRatio(Math.min(devicePixelRatio, 1.5))
gl.setSize(innerWidth, innerHeight)
gl.outputColorSpace = SRGBColorSpace
// Tone mapping and the colour-space conversion happen in the post pass.
gl.toneMapping = NoToneMapping
gl.shadowMap.enabled = true
gl.localClippingEnabled = true
gl.shadowMap.type = PCFShadowMap
gl.domElement.className = 'lab-view'
document.body.append(gl.domElement)
const post = new Post(gl)
post.setSize(innerWidth, innerHeight)

// ── The street, built once; light and haze change around it ─────────────

const map = generateDistrict(districtById(START_DISTRICT)!)
const street = buildStreet(map)
const streetScene = new Scene()
streetScene.add(street.group)
const [sx, sy] = map.spawn
const focus = new Vector3(sx + 0.5, 0, sy + 1)

const hemi = new HemisphereLight()
const sun = new DirectionalLight()
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 })
sun.shadow.bias = -0.0006
sun.shadow.normalBias = 0.02
sun.shadow.radius = 3
sun.target.position.copy(focus)
streetScene.add(hemi, sun, sun.target)

const rain = new Rain()
streetScene.add(rain.mesh)

// A few people on the main street.
const blob = blobTexture()
const people: [string, number, number, FigureSpec][] = [
  ['case', 0, 0, { skin: 0xd9a37e, coat: 0x2e2f33, legs: 0x161615, hair: 0x141312, hairStyle: 1, coatLength: 1, height: 1.02 }],
  ['molly', 1.4, 0.6, { skin: 0xeac0a0, coat: 0x161615, legs: 0x161615, hair: 0x141312, hairStyle: 1, coatLength: 0, height: 0.98 }],
  ['ratz', -1.8, 1.2, { skin: 0xc0875f, coat: 0x6b5a45, legs: 0x3d2c29, hair: 0x8e8f8c, hairStyle: 0, coatLength: 0, height: 0.95 }],
  ['linda', -0.6, -1.3, { skin: 0xf6d7c3, coat: 0x8a7a5c, legs: 0x2e2f33, hair: 0x3b2a20, hairStyle: 2, coatLength: 1, height: 0.97 }],
  ['armitage', 3.0, -0.4, { skin: 0xa06a45, coat: 0x4a5a68, legs: 0x1f2a36, hair: 0x141312, hairStyle: 1, coatLength: 1, height: 1.06 }],
  ['finn', 2.2, 2.0, { skin: 0x7d4e30, coat: 0x5e2424, legs: 0x2e2f33, hair: 0x2c3440, hairStyle: 0, coatLength: 0, height: 1.0 }],
]
const tags: [HTMLElement, Vector3][] = []
const cast: Rig[] = []
for (const [name, dx, dz, spec] of people) {
  const f = buildFigure(spec, blob)
  f.position.set(focus.x + dx, 0, focus.z + dz)
  f.rotation.y = (dx * 1.7 + dz) % (Math.PI * 2)
  streetScene.add(f)
  cast.push(f.userData.rig as Rig)
  const tag = document.createElement('div')
  tag.className = 'lab-tag'
  tag.textContent = name
  document.body.append(tag)
  tags.push([tag, new Vector3(f.position.x, f.position.y + spec.height * 1.06, f.position.z)])
}

// People walking, traffic, steam.
const life = buildLife(map, focus, blob)
streetScene.add(life.group)

// Isometric camera, 30° down from the south-east, shared by street and
// capsule. Zoom is the world height of the screen: wheel, pinch, or + and -.
const ZOOM = { street: { min: 5, max: 26, at: Number(q.get('zoom') ?? 12) }, capsule: { min: 2.2, max: 7, at: 3.6 } }
let zoom = ZOOM.street.at
let zoomTarget = zoom
const iso = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400)
const elev = (30 * Math.PI) / 180
const viewDir = new Vector3(Math.cos(elev) * Math.SQRT1_2, Math.sin(elev), Math.cos(elev) * Math.SQRT1_2)
const aim = (at: Vector3) => { iso.position.copy(viewDir).multiplyScalar(80).add(at); iso.lookAt(at) }
aim(focus)
haze.uHzFocus.value.set(focus.x, focus.z)
haze.uHzView.value.copy(viewDir)
const frameIso = () => {
  const aspect = innerWidth / innerHeight
  Object.assign(iso, { left: (-zoom * aspect) / 2, right: (zoom * aspect) / 2, top: zoom / 2, bottom: -zoom / 2 })
  iso.updateProjectionMatrix()
}
frameIso()

// ── Applying the controls ────────────────────────────────────────────────

let scene: Scene = streetScene
let night = 0
let wet = 0
const WET: Record<WeatherKind, number> = { drizzle: 1, fog: 0.45, overcast: 0.2, clear: 0.05 }
let shown = 'street'

function apply(): void {
  const sky = skyAt(state.hour, state.weather)
  night = sky.night
  wet = WET[state.weather]
  if (shown !== state.scene) {
    // Each scene keeps its own zoom.
    ZOOM[shown as 'street'].at = zoomTarget
    shown = state.scene
    zoom = zoomTarget = ZOOM[shown as 'street'].at
    frameIso()
  }
  if (state.scene === 'capsule') {
    const c = buildCapsule(sky, blob)
    scene = c.scene
    aim(c.focus)
    // No street haze indoors.
    haze.uHzNear.value = 1e5
    haze.uHzFar.value = 1e5 + 1
    post.bloom = 0.3
  } else {
    scene = streetScene
    aim(focus)
    post.bloom = 0.5
    streetScene.background = new Color().setHex(sky.haze)
    haze.uHzColor.value.setHex(sky.haze)
    haze.uSeamColor.value.setHex(sky.night > 0.5 ? 0x6f7a70 : 0xe9ebe6)
    haze.uHzNear.value = sky.near
    haze.uHzFar.value = sky.far
    haze.uSeams.value = state.seams ? 1 : 0
    hemi.color.setHex(sky.hemiSky)
    hemi.groundColor.setHex(sky.hemiGround)
    hemi.intensity = sky.hemi
    sun.color.setHex(sky.sun)
    sun.intensity = sky.sunI * 2.2
    sun.position.set(...sky.sunDir).multiplyScalar(40).add(focus)
    rain.mesh.visible = state.weather === 'drizzle'
  }
  for (const [el] of tags) el.hidden = state.scene !== 'street'
  syncControls()
}

// ── Controls ─────────────────────────────────────────────────────────────

const css = document.createElement('style')
css.textContent = `
  .lab-view { position: fixed; inset: 0; display: block; touch-action: none; }
  .lab-tag { position: fixed; left: 0; top: 0; padding: 3px 6px 2px; font: 500 11px/1 var(--lab-font); letter-spacing: 0.12em;
    text-transform: uppercase; color: #ece6d8; background: rgba(20, 20, 20, 0.55); pointer-events: none; white-space: nowrap; }
  .lab-bar { --lab-line: rgba(236, 230, 216, 0.16); position: fixed; left: 0; right: 0; bottom: 0; display: flex; flex-wrap: wrap;
    align-items: center; gap: 10px 18px; padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
    background: rgba(17, 17, 16, 0.84); backdrop-filter: blur(6px); color: #e6e0d0; font: 12px/1.2 var(--lab-font);
    border-top: 1px solid var(--lab-line); }
  .lab-group { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .lab-label { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #8c877a; }
  .lab-seg { display: flex; border: 1px solid var(--lab-line); }
  .lab-seg button { font: inherit; color: inherit; background: transparent; border: 0; padding: 6px 10px; cursor: pointer; }
  .lab-seg button + button { border-left: 1px solid var(--lab-line); }
  .lab-seg button[aria-pressed="true"] { background: #e8a33d; color: #16140f; }
  .lab-seg button:focus-visible, .lab-now:focus-visible, .lab-range:focus-visible { outline: 2px solid #9ccf8f; outline-offset: 2px; }
  .lab-range { width: min(220px, 42vw); accent-color: #e8a33d; }
  .lab-time { font-variant-numeric: tabular-nums; min-width: 6.5em; }
  .lab-now { font: inherit; color: #9ccf8f; background: none; border: 1px solid var(--lab-line); padding: 5px 8px; cursor: pointer; }
  .lab-hint { margin-left: auto; color: #8c877a; }
  @media (max-width: 640px) { .lab-hint { display: none; } }
`
document.head.append(css)
document.documentElement.style.setProperty('--lab-font', `'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif`)

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

const bar = el('div', 'lab-bar')
const segs: { key: 'scene' | 'weather' | 'seams'; buttons: [HTMLButtonElement, string | boolean][] }[] = []
function segment(label: string, key: 'scene' | 'weather' | 'seams', options: [string, string | boolean][]): HTMLElement {
  const g = el('div', 'lab-group')
  g.append(el('span', 'lab-label', label))
  const s = el('div', 'lab-seg')
  s.setAttribute('role', 'group')
  s.setAttribute('aria-label', label)
  const buttons: [HTMLButtonElement, string | boolean][] = []
  for (const [text, value] of options) {
    const b = el('button', '', text)
    b.type = 'button'
    b.addEventListener('click', () => { (state as unknown as Record<string, unknown>)[key] = value; apply() })
    s.append(b)
    buttons.push([b, value])
  }
  segs.push({ key, buttons })
  g.append(s)
  return g
}

const timeGroup = el('div', 'lab-group')
const range = el('input', 'lab-range')
range.type = 'range'
range.id = 'lab-hour'
range.min = '0'
range.max = '23.75'
range.step = '0.25'
range.setAttribute('aria-label', 'Hour in Japan')
const time = el('span', 'lab-time')
const now = el('button', 'lab-now', 'Now')
now.type = 'button'
range.addEventListener('input', () => { state.hour = Number(range.value); apply() })
now.addEventListener('click', () => { state.hour = jstHour(); state.weather = weatherFor(); apply() })
timeGroup.append(el('span', 'lab-label', 'Time'), range, time, now)

bar.append(
  segment('Scene', 'scene', [['Street', 'street'], ['Capsule', 'capsule']]),
  timeGroup,
  segment('Weather', 'weather', WEATHERS.map((w) => [w[0]!.toUpperCase() + w.slice(1), w])),
  segment('Seams', 'seams', [['Off', false], ['On', true]]),
  el('span', 'lab-hint', 'Scroll, pinch or +/− to zoom'),
)
document.body.append(bar)

function syncControls(): void {
  for (const { key, buttons } of segs)
    for (const [b, v] of buttons) b.setAttribute('aria-pressed', String(state[key] === v))
  range.value = String(state.hour)
  const hh = Math.floor(state.hour), mm = Math.round((state.hour % 1) * 60)
  time.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} JST`
}

// ── Zoom input ───────────────────────────────────────────────────────────

const zoomBy = (k: number) => {
  const z = ZOOM[state.scene as 'street']
  zoomTarget = Math.min(z.max, Math.max(z.min, zoomTarget * k))
}
gl.domElement.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0015)) }, { passive: false })
addEventListener('keydown', (e) => {
  if (e.key === '+' || e.key === '=') zoomBy(1 / 1.25)
  if (e.key === '-' || e.key === '_') zoomBy(1.25)
})
const touches = new Map<number, [number, number]>()
let pinch = 0
const spread = () => { const [a, b] = [...touches.values()]; return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0 }
gl.domElement.addEventListener('pointerdown', (e) => { touches.set(e.pointerId, [e.clientX, e.clientY]); pinch = spread() })
addEventListener('pointermove', (e) => {
  if (!touches.has(e.pointerId)) return
  touches.set(e.pointerId, [e.clientX, e.clientY])
  const d = spread()
  if (pinch && d) zoomBy(pinch / d)
  pinch = d
})
const lift = (e: PointerEvent) => { touches.delete(e.pointerId); pinch = spread() }
addEventListener('pointerup', lift)
addEventListener('pointercancel', lift)
addEventListener('resize', () => {
  gl.setSize(innerWidth, innerHeight)
  post.setSize(innerWidth, innerHeight)
  frameIso()
})

// ── Loop ─────────────────────────────────────────────────────────────────

apply()
const v = new Vector3()
let frames = 0
let last = 0
gl.setAnimationLoop((ms) => {
  const dt = Math.min(0.1, (ms - (last || ms)) / 1000)
  last = ms
  if (Math.abs(zoom - zoomTarget) > 0.001) { zoom += (zoomTarget - zoom) * 0.18; frameIso() }
  if (state.scene === 'street') {
    street.update(focus.x, focus.z, night, wet)
    life.update(ms / 1000, dt, night)
    cast.forEach((r, i) => animateWalk(r, i * 1.7, 0, ms / 1000))
    if (rain.mesh.visible) rain.update(ms / 1000, focus.x, focus.z)
    // Name tags fade as you pull back; from far away they are clutter.
    const alpha = String(1 - Math.min(1, Math.max(0, (zoom - 16) / 5)))
    for (const [tag, p] of tags) {
      v.copy(p).project(iso)
      tag.style.opacity = alpha
      tag.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px) translate(-50%, -100%)`
    }
  }
  post.render(scene, iso, ms / 1000)
  if (++frames === 3) (window as unknown as { labReady: boolean }).labReady = true
})
