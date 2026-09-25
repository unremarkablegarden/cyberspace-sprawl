// Look lab: things that move. Pedestrians wander the pavements (path found on
// the tile grid, then straightened, so they walk free diagonals instead of
// staircases), cars and taxis run along the streets with lights at night, and
// steam rises from grates in the road.

import {
  AdditiveBlending, CanvasTexture, Color, CylinderGeometry, DynamicDrawUsage, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  NormalBlending, Object3D, PlaneGeometry, Sprite, SpriteMaterial, Vector3, type BufferGeometry, type Material, type Matrix4, type Texture,
} from 'three'
import { findPath, hashString, Tile, type DistrictMap, type XY } from '@sprawl/shared'
import { animateWalk, buildFigure, type Crowd, type FigureSpec, type Rig } from './figure.ts'
import { hazed } from './haze.ts'
import { Merger, roundedBox, slab } from './shapes.ts'

let seed = 1234
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!

// ── Pedestrians ────────────────────────────────────────────────────────────

const SKINS = [0xf6d7c3, 0xeac0a0, 0xd9a37e, 0xc0875f, 0xa06a45, 0x7d4e30]
const COATS = [0x2e2f33, 0x161615, 0x6b5a45, 0x8a7a5c, 0x4a5a68, 0x5e2424, 0x4d4f52, 0x8c8a84, 0x3d2c29]
const HAIR = [0x141312, 0x3b2a20, 0x7a4b2a, 0x8e8f8c, 0xc9a06b]

interface Walker {
  root: Group
  rig: Rig
  path: [number, number][]
  speed: number
  wait: number
  phase: number
  heading: number
}

/** Pavement only: people keep to their block, as most people do. */
function footway(map: DistrictMap) {
  return {
    width: map.width,
    height: map.height,
    walkable: (x: number, y: number) => {
      const t = map.tile(x, y)
      return (t === Tile.Pavement || t === Tile.Plaza || t === Tile.Door) && map.walkable(x, y)
    },
  }
}

/** Drop waypoints that can be seen past, so paths become straight lines. */
function straighten(ok: (x: number, y: number) => boolean, from: [number, number], path: XY[]): [number, number][] {
  const clear = (a: [number, number], b: readonly [number, number]) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 4)
    for (let i = 1; i < n; i++) {
      const t = i / n
      // Check a little either side too, so people don't shave corners.
      for (const o of [-0.3, 0, 0.3]) {
        const x = a[0] + (b[0] - a[0]) * t + o, y = a[1] + (b[1] - a[1]) * t + o
        if (!ok(Math.round(x), Math.round(y))) return false
      }
    }
    return true
  }
  const out: [number, number][] = []
  let at = from
  let i = 0
  while (i < path.length) {
    let j = path.length - 1
    while (j > i && !clear(at, path[j]!)) j--
    const p: [number, number] = [path[j]![0] + (rnd() - 0.5) * 0.5, path[j]![1] + (rnd() - 0.5) * 0.5]
    out.push(p)
    at = p
    i = j + 1
  }
  return out
}

// ── Cars ───────────────────────────────────────────────────────────────────

interface Car {
  axis: 'x' | 'z'
  dir: 1 | -1
  lane: number
  pos: number
  speed: number
  taxi: number
}

function cone(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 128, 0)
  grad.addColorStop(0, 'rgba(255,214,160,0.5)')
  grad.addColorStop(1, 'rgba(255,236,200,0)')
  g.fillStyle = grad
  g.beginPath()
  g.moveTo(0, 26)
  g.lineTo(128, 0)
  g.lineTo(128, 64)
  g.lineTo(0, 38)
  g.fill()
  return new CanvasTexture(c)
}

/**
 * All the cars, one instanced mesh per part: body (painted per car), cabin,
 * wheels, head- and tail-lamps, the taxi sign and the headlight beams.
 */
function buildFleet(paints: number[], taxis: number, beamTex: Texture) {
  const n = paints.length
  const merged = (geo: () => BufferGeometry, at: [number, number, number][]) => {
    const m = new Merger()
    for (const [x, y, z] of at) {
      const g = geo()
      m.add(g, x, y, z)
      g.dispose()
    }
    return m.build()
  }
  const part = (geo: BufferGeometry, mat: Material, count = n, shadow = false) => {
    const mesh = new InstancedMesh(geo, mat, Math.max(1, count))
    mesh.count = count
    mesh.castShadow = shadow
    mesh.frustumCulled = false
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    return mesh
  }
  const body = part(
    slab(0.95, 0.44, 0.2, 0.1, 0.05, 8).translate(0, 0.06, 0),
    hazed(new MeshStandardMaterial({ roughness: 0.35, metalness: 0.3 }), 'car'), n, true,
  )
  const colour = new Color()
  paints.forEach((hex, i) => body.setColorAt(i, colour.setHex(hex)))
  const cabin = part(
    slab(0.52, 0.38, 0.17, 0.08, 0.05, 8).translate(-0.06, 0.25, 0),
    hazed(new MeshStandardMaterial({ color: 0x16181a, roughness: 0.15, metalness: 0.5 }), 'glass'), n, true,
  )
  const wheels = part(
    merged(() => new CylinderGeometry(0.09, 0.09, 0.06, 14).rotateX(Math.PI / 2), [[0.3, 0.09, 0.2], [0.3, 0.09, -0.2], [-0.3, 0.09, 0.2], [-0.3, 0.09, -0.2]]),
    hazed(new MeshStandardMaterial({ color: 0x111111 }), 'tyre'),
  )
  const heads = part(
    merged(() => roundedBox(0.02, 0.05, 0.1, 0.01), [[0.475, 0.16, -0.14], [0.475, 0.16, 0.14]]),
    hazed(new MeshBasicMaterial({ color: 0xfff2d8 }), 'headlamp'),
  )
  const tails = part(
    merged(() => roundedBox(0.02, 0.04, 0.1, 0.01), [[-0.475, 0.17, -0.14], [-0.475, 0.17, 0.14]]),
    hazed(new MeshBasicMaterial({ color: 0xff3a2a }), 'taillamp'),
  )
  const signs = part(roundedBox(0.14, 0.06, 0.08, 0.02).translate(-0.04, 0.37, 0), hazed(new MeshBasicMaterial({ color: 0xffb35c }), 'taxilamp'), taxis)
  const beamMat = new MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: AdditiveBlending })
  const beams = part(new PlaneGeometry(2.2, 1.1).rotateX(-Math.PI / 2).translate(0.48 + 1.1, 0.012, 0), beamMat)
  const all = [body, cabin, wheels, heads, tails, beams]
  const group = new Group()
  group.add(...all, signs)
  return {
    group,
    beamMat,
    beams,
    /** Place car `i`; `taxi` is its index among the taxis, or -1. */
    set(i: number, taxi: number, m: Matrix4) {
      for (const mesh of all) mesh.setMatrixAt(i, m)
      if (taxi >= 0) signs.setMatrixAt(taxi, m)
    },
    commit() {
      for (const mesh of all) mesh.instanceMatrix.needsUpdate = true
      signs.instanceMatrix.needsUpdate = true
    },
  }
}

// ── Steam ──────────────────────────────────────────────────────────────────

function puffTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,0.5)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new CanvasTexture(c)
}

// ── Everything together ────────────────────────────────────────────────────

export interface Life {
  group: Group
  update(time: number, dt: number, night: number): void
}

export function buildLife(map: DistrictMap, focus: Vector3, blob: Texture, crowd: Crowd): Life {
  const group = new Group()
  const foot = footway(map)

  // Pedestrians near the player.
  const walkers: Walker[] = []
  const near: [number, number][] = []
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (foot.walkable(x, y) && Math.hypot(x - focus.x, y - focus.z) < 14) near.push([x, y])
  for (let i = 0; i < 16 && near.length; i++) {
    const spec: FigureSpec = {
      skin: pick(SKINS), coat: pick(COATS), legs: pick([0x161615, 0x2e2f33, 0x3d2c29, 0x1f2a36]), hair: pick(HAIR),
      hairStyle: Math.floor(rnd() * 3), coatLength: rnd() > 0.5 ? 1 : 0, height: 0.92 + rnd() * 0.14,
    }
    const root = buildFigure(spec, blob, crowd)
    const [x, y] = pick(near)
    root.position.set(x, 0, y)
    walkers.push({ root, rig: root.userData.rig as Rig, path: [], speed: 0.9 + rnd() * 0.5, wait: rnd() * 3, phase: rnd() * 6, heading: rnd() * 6 })
  }

  // Traffic on the long streets: one lane each way.
  const road = (x: number, y: number) => map.inBounds(x, y) && map.tile(x, y) === Tile.Road
  const lanes: { axis: 'x' | 'z'; at: number; dir: 1 | -1 }[] = []
  for (let y = 1; y < map.height - 2; y++) {
    let n = 0
    for (let x = 0; x < map.width; x++) if (road(x, y) && road(x, y + 1) && !road(x, y - 1)) n++
    if (n > map.width * 0.5) lanes.push({ axis: 'x', at: y + 0.2, dir: -1 }, { axis: 'x', at: y + 0.8, dir: 1 })
  }
  for (let x = 1; x < map.width - 2; x++) {
    let n = 0
    for (let y = 0; y < map.height; y++) if (road(x, y) && road(x + 1, y) && !road(x - 1, y)) n++
    if (n > map.height * 0.5) lanes.push({ axis: 'z', at: x + 0.2, dir: 1 }, { axis: 'z', at: x + 0.8, dir: -1 })
  }
  const beamTex = cone()
  const cars: Car[] = []
  const paints: number[] = []
  const PAINT = [0xd8d4ca, 0x2a2b2d, 0x5a1f1f, 0x8c8a84, 0x3a4a3c, 0x1d2a3a]
  let taxis = 0
  for (let i = 0; i < Math.min(14, lanes.length * 2); i++) {
    const lane = lanes[i % lanes.length]!
    const taxi = rnd() < 0.35
    paints.push(taxi ? pick([0x1b1b1d, 0x5e2424]) : pick(PAINT))
    cars.push({ axis: lane.axis, dir: lane.dir, lane: lane.at, pos: rnd() * map.width, speed: 2 + rnd() * 1.5, taxi: taxi ? taxis++ : -1 })
  }
  const fleet = buildFleet(paints, taxis, beamTex)
  group.add(fleet.group)
  const carAt = new Object3D()

  // Steam from a few grates in the road near the player.
  const puffTex = puffTexture()
  const puffs: { s: Sprite; base: Vector3; t0: number }[] = []
  const grates: [number, number][] = []
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (road(x, y) && Math.hypot(x - focus.x, y - focus.z) < 16 && ((hashString(`grate${x}:${y}`) >>> 0) % 37 === 0)) grates.push([x, y])
  for (const [gx, gy] of grates.slice(0, 5)) {
    // A dark grate on the ground.
    const grate = new Mesh(new PlaneGeometry(0.5, 0.3).rotateX(-Math.PI / 2), hazed(new MeshBasicMaterial({ color: 0x151515 }), 'grate'))
    grate.position.set(gx, 0.006, gy)
    group.add(grate)
    for (let i = 0; i < 7; i++) {
      const s = new Sprite(new SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, blending: NormalBlending, color: 0xe8e6e0 }))
      group.add(s)
      puffs.push({ s, base: new Vector3(gx, 0, gy), t0: i / 7 })
    }
  }

  const v = new Vector3()
  return {
    group,
    update(time, dt, night) {
      for (const w of walkers) {
        if (!w.path.length) {
          if ((w.wait -= dt) > 0) { animateWalk(w.rig, w.phase, 0, time); continue }
          const from: XY = [Math.round(w.root.position.x), Math.round(w.root.position.z)]
          const to = pick(near)
          const p = findPath(foot, from, to, 40)
          if (p && p.length) w.path = straighten(foot.walkable, [w.root.position.x, w.root.position.z], p)
          w.wait = 1 + rnd() * 4
          continue
        }
        const [tx, tz] = w.path[0]!
        v.set(tx - w.root.position.x, 0, tz - w.root.position.z)
        const d = v.length()
        const step = w.speed * dt
        if (d <= step) {
          w.root.position.x = tx
          w.root.position.z = tz
          w.path.shift()
        } else {
          w.root.position.addScaledVector(v, step / d)
          // Turn smoothly towards the direction of travel.
          const want = Math.atan2(v.x, v.z)
          let diff = want - w.heading
          diff = Math.atan2(Math.sin(diff), Math.cos(diff))
          w.heading += diff * Math.min(1, dt * 8)
          w.root.rotation.y = w.heading
        }
        w.phase += step * 7
        animateWalk(w.rig, w.phase, 1, time)
      }

      cars.forEach((c, i) => {
        c.pos += c.dir * c.speed * dt
        const len = c.axis === 'x' ? map.width : map.height
        if (c.pos > len + 6) c.pos = -6
        if (c.pos < -6) c.pos = len + 6
        if (c.axis === 'x') carAt.position.set(c.pos, 0, c.lane)
        else carAt.position.set(c.lane, 0, c.pos)
        carAt.rotation.y = c.axis === 'x' ? (c.dir > 0 ? 0 : Math.PI) : c.dir > 0 ? -Math.PI / 2 : Math.PI / 2
        carAt.updateMatrix()
        fleet.set(i, c.taxi, carAt.matrix)
      })
      fleet.commit()
      fleet.beamMat.opacity = night * 0.28
      fleet.beams.visible = night > 0.05

      for (const p of puffs) {
        const t = (time * 0.25 + p.t0) % 1
        p.s.position.set(p.base.x + Math.sin(t * 5 + p.t0 * 9) * 0.15 + t * 0.4, 0.05 + t * 2.2, p.base.z + t * 0.2)
        p.s.scale.setScalar(0.3 + t * 1.4)
        ;(p.s.material as SpriteMaterial).opacity = Math.sin(t * Math.PI) * (0.35 + night * 0.1)
      }
    },
  }
}
