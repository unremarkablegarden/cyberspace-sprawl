// Look lab: a local-only page for trying the new look without the server.
//   /lab.html?scene=street&hour=12&weather=overcast&seams=0&zoom=16
//   /lab.html?scene=capsule&hour=23
// hour and weather default to the real Japan clock and today's seeded weather.

import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, OrthographicCamera, PCFShadowMap, SRGBColorSpace,
  Vector3, WebGLRenderer, type Camera, type Scene as SceneT,
} from 'three'
import { Scene } from 'three'
import { generateDistrict } from '@sprawl/shared'
import { districtById, START_DISTRICT } from '@sprawl/content'
import { haze, jstHour, setRaw, skyAt, weatherFor, type WeatherKind } from './haze.ts'
import { blobTexture, buildStreet } from './street.ts'
import { buildFigure, type FigureSpec } from './figure.ts'
import { buildCapsule } from './capsule.ts'
import { Rain } from '../render/rain.ts'

const q = new URLSearchParams(location.search)
const hour = q.has('hour') ? Number(q.get('hour')) : jstHour()
const weather = (q.get('weather') as WeatherKind | null) ?? weatherFor()
const sky = skyAt(hour, weather)

const gl = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
gl.setPixelRatio(Math.min(devicePixelRatio, 2))
gl.setSize(innerWidth, innerHeight)
gl.outputColorSpace = SRGBColorSpace
gl.toneMapping = ACESFilmicToneMapping
gl.toneMappingExposure = 1.0
gl.shadowMap.enabled = true
gl.shadowMap.type = PCFShadowMap
document.body.append(gl.domElement)

const label = document.getElementById('label')!
label.textContent = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')} JST · ${weather}`

let scene: SceneT
let camera: Camera
let tick: (t: number) => void = () => {}

if (q.get('scene') === 'capsule') {
  const c = buildCapsule(sky)
  scene = c.scene
  camera = c.camera
  c.camera.aspect = innerWidth / innerHeight
  c.camera.updateProjectionMatrix()
} else {
  const def = districtById(START_DISTRICT)!
  const map = generateDistrict(def)
  const street = buildStreet(map)
  scene = new Scene()
  scene.background = new Color().setHex(sky.haze)
  scene.add(street.group)

  setRaw(haze.uHzColor.value, sky.haze)
  setRaw(haze.uSeamColor.value, sky.night > 0.5 ? 0x6f7a70 : 0xe9ebe6)
  haze.uHzNear.value = sky.near
  haze.uHzFar.value = sky.far
  haze.uSeams.value = q.get('seams') === '1' ? 1 : 0

  const [sx, sy] = map.spawn
  const focus = new Vector3(sx + 0.5, 0, sy + 1)

  scene.add(new HemisphereLight(new Color().setHex(sky.hemiSky), new Color().setHex(sky.hemiGround), sky.hemi))
  const sun = new DirectionalLight(new Color().setHex(sky.sun), sky.sunI * 2.2)
  sun.position.set(...sky.sunDir).multiplyScalar(40).add(focus)
  sun.target.position.copy(focus)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 })
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.02
  scene.add(sun, sun.target)

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
  for (const [name, dx, dz, spec] of people) {
    const f = buildFigure(spec, blob)
    f.position.set(focus.x + dx, 0.08, focus.z + dz)
    f.rotation.y = (dx * 1.7 + dz) % (Math.PI * 2)
    scene.add(f)
    const tag = document.createElement('div')
    tag.className = 'tag'
    tag.textContent = name
    document.body.append(tag)
    tags.push([tag, new Vector3(f.position.x, f.position.y + spec.height * 1.06, f.position.z)])
  }

  // Isometric camera: 30° down, from the south-east.
  const zoom = Number(q.get('zoom') ?? 16)
  const aspect = innerWidth / innerHeight
  const cam = new OrthographicCamera((-zoom * aspect) / 2, (zoom * aspect) / 2, zoom / 2, -zoom / 2, 0.1, 400)
  const elev = (30 * Math.PI) / 180
  cam.position.set(Math.cos(elev) * Math.SQRT1_2, Math.sin(elev), Math.cos(elev) * Math.SQRT1_2).multiplyScalar(80).add(focus)
  cam.lookAt(focus)
  camera = cam
  haze.uHzFocus.value.set(focus.x, focus.z)
  haze.uHzView.value.copy(cam.position).sub(focus).normalize()

  const rain = weather === 'drizzle' ? new Rain() : null
  if (rain) scene.add(rain.mesh)

  const v = new Vector3()
  tick = (t) => {
    street.update(focus.x, focus.z, sky.night)
    rain?.update(t, focus.x, focus.z)
    for (const [el, p] of tags) {
      v.copy(p).project(cam)
      el.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px) translate(-50%, -100%)`
    }
  }
}

let frames = 0
gl.setAnimationLoop((ms) => {
  tick(ms / 1000)
  gl.render(scene, camera)
  if (++frames === 3) (window as unknown as { labReady: boolean }).labReady = true
})
