// Look lab: tall, lean figures, about eight heads high, built from a few
// tapered cylinders. Legs and arms hang from pivots so they can walk.

import {
  Color, CylinderGeometry, DynamicDrawUsage, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry,
  SphereGeometry, type Texture,
} from 'three'
import { hazed } from './haze.ts'

export interface FigureSpec {
  skin: number
  coat: number
  legs: number
  hair: number
  /** 0 none, 1 short, 2 long */
  hairStyle: number
  /** Coat length: 0 jacket, 1 knee-length */
  coatLength: number
  height: number
}

/** The parts a walk moves. */
export interface Rig {
  body: Group
  legL: Group
  legR: Group
  armL: Group
  armR: Group
  coat: Object3D | null
}

type Role = 'skin' | 'cloth' | 'hair' | 'shoe'
const ROUGH: Record<Role, number> = { skin: 0.7, cloth: 0.85, hair: 0.95, shoe: 0.5 }

const mats = new Map<string, MeshStandardMaterial>()
function mat(hex: number, rough = 0.85): MeshStandardMaterial {
  const k = `${hex}:${rough}`
  let m = mats.get(k)
  if (!m) mats.set(k, (m = hazed(new MeshStandardMaterial({ color: hex, roughness: rough }), 'fig')))
  return m
}

// Every part a figure is made of. Geometry is shared between figures.
const GEO = {
  leg: () => new CylinderGeometry(0.03, 0.022, 0.5, 10).translate(0, -0.25, 0),
  shoe: () => new CylinderGeometry(0.022, 0.028, 0.03, 8),
  torso: () => new CylinderGeometry(0.085, 0.065, 0.34, 10).translate(0, -0.17, 0),
  hem: () => new CylinderGeometry(0.07, 0.1, 0.3, 10).translate(0, -0.15, 0),
  collar: () => new CylinderGeometry(0.03, 0.05, 0.05, 10, 1, true),
  arm: () => new CylinderGeometry(0.022, 0.018, 0.34, 10).translate(0, -0.17, 0),
  hand: () => new SphereGeometry(0.018, 8, 6),
  neck: () => new CylinderGeometry(0.018, 0.02, 0.04, 10).translate(0, -0.02, 0),
  head: () => new SphereGeometry(0.05, 14, 12),
  cap: () => new SphereGeometry(0.053, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
  fall: () => new CylinderGeometry(0.045, 0.04, 0.12, 10).translate(0, -0.06, 0),
  blob: () => new PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2),
}
type Kind = keyof typeof GEO
const SHADOWS: Kind[] = ['leg', 'torso', 'hem', 'arm', 'neck', 'head', 'fall']

/**
 * Everybody on the street drawn together: one instanced mesh per kind of
 * part, so a crowd costs a dozen draw calls instead of fifteen per person.
 * Figures keep their own hierarchy of empty slots; `sync` copies the slots'
 * world matrices into the instances after they have been animated.
 */
export class Crowd {
  readonly group = new Group()
  #roots: Object3D[] = []
  #slots = new Map<Kind, { role: Role | null; parts: [Object3D, Color | null][] }>()
  #meshes: [InstancedMesh, Object3D[]][] = []

  constructor(private blob: Texture) {}

  slot(kind: Kind, role: Role | null, hex: number | null): Object3D {
    let k = this.#slots.get(kind)
    if (!k) this.#slots.set(kind, (k = { role, parts: [] }))
    const o = new Object3D()
    k.parts.push([o, hex === null ? null : new Color().setHex(hex)])
    return o
  }

  add(root: Object3D): void {
    this.#roots.push(root)
  }

  /** Make the instanced meshes; call once, after every figure is added. */
  build(): Group {
    for (const [kind, { role, parts }] of this.#slots) {
      const m = role
        ? hazed(new MeshStandardMaterial({ roughness: ROUGH[role] }), 'fig')
        : new MeshBasicMaterial({ map: this.blob, transparent: true, depthWrite: false })
      const mesh = new InstancedMesh(GEO[kind](), m, parts.length)
      parts.forEach(([, c], i) => c && mesh.setColorAt(i, c))
      mesh.castShadow = SHADOWS.includes(kind)
      mesh.frustumCulled = false
      if (kind === 'blob') mesh.renderOrder = 1
      mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      this.group.add(mesh)
      this.#meshes.push([mesh, parts.map(([o]) => o)])
    }
    return this.group
  }

  sync(): void {
    for (const r of this.#roots) r.updateMatrixWorld()
    for (const [mesh, slots] of this.#meshes) {
      slots.forEach((o, i) => mesh.setMatrixAt(i, o.matrixWorld))
      mesh.instanceMatrix.needsUpdate = true
    }
  }
}

function pivot(parent: Group, x: number, y: number): Group {
  const g = new Group()
  g.position.set(x, y, 0)
  parent.add(g)
  return g
}

/**
 * A figure. With a crowd its parts are empty slots the crowd draws;
 * without, ordinary meshes (for a scene with a single person in it).
 */
export function buildFigure(spec: FigureSpec, blob: Texture, crowd?: Crowd): Group {
  const root = new Group()
  const body = new Group()
  body.scale.setScalar(spec.height)
  root.add(body)
  const colour: Record<Role, number> = { skin: spec.skin, cloth: spec.coat, hair: spec.hair, shoe: 0x141312 }
  const part = (kind: Kind, role: Role, hex = colour[role]): Object3D => {
    if (crowd) return crowd.slot(kind, role, hex)
    const m = new Mesh(GEO[kind](), mat(hex, ROUGH[role]))
    m.castShadow = SHADOWS.includes(kind)
    return m
  }

  // Legs hang from the hip.
  const hip = 0.52
  const legPivots = [-0.045, 0.045].map((x) => {
    const p = pivot(body, x, hip)
    p.add(part('leg', 'cloth', spec.legs))
    const s = part('shoe', 'shoe')
    s.position.set(0, -0.505, 0.012)
    s.scale.z = 1.6
    p.add(s)
    return p
  }) as [Group, Group]

  // Torso, tapering from the shoulders, and a coat hem that swings a little.
  const torso = part('torso', 'cloth')
  torso.position.y = 0.86
  torso.scale.z = 0.65
  body.add(torso)
  let hem: Object3D | null = null
  if (spec.coatLength > 0) {
    hem = part('hem', 'cloth')
    hem.position.y = 0.54
    hem.scale.z = 0.7
    body.add(hem)
  }
  // Collar.
  const collar = part('collar', 'cloth')
  collar.position.y = 0.88
  collar.scale.z = 0.8
  body.add(collar)

  // Arms hang from the shoulder, close to the body.
  const armPivots = [-0.1, 0.1].map((x) => {
    const p = pivot(body, x, 0.84)
    const a = part('arm', 'cloth')
    a.rotation.z = x > 0 ? 0.06 : -0.06
    p.add(a)
    const hand = part('hand', 'skin')
    hand.position.set(x * 0.2, -0.35, 0)
    p.add(hand)
    return p
  }) as [Group, Group]

  // Neck and a small head.
  const neck = part('neck', 'skin')
  neck.position.y = 0.9
  body.add(neck)
  const head = part('head', 'skin')
  head.scale.set(0.9, 1.15, 1)
  head.position.y = 0.94
  body.add(head)
  if (spec.hairStyle > 0) {
    const cap = part('cap', 'hair')
    cap.scale.set(0.92, 1.15, 1.02)
    cap.position.set(0, 0.945, -0.004)
    body.add(cap)
    if (spec.hairStyle === 2) {
      const fall = part('fall', 'hair')
      fall.position.set(0, 0.95, -0.02)
      fall.scale.z = 0.6
      body.add(fall)
    }
  }

  // Contact shadow: a soft dark disc that seats the figure on the ground.
  let shadow: Object3D
  if (crowd) shadow = crowd.slot('blob', null, null)
  else {
    const m = new Mesh(GEO.blob(), new MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }))
    m.renderOrder = 1
    shadow = m
  }
  shadow.position.y = 0.005
  root.add(shadow)

  const rig: Rig = { body, legL: legPivots[0], legR: legPivots[1], armL: armPivots[0], armR: armPivots[1], coat: hem }
  root.userData.rig = rig
  crowd?.add(root)
  return root
}

/** Walk cycle: `phase` advances with distance, `amount` is 0 standing to 1 walking. */
export function animateWalk(rig: Rig, phase: number, amount: number, time: number): void {
  const s = Math.sin(phase) * 0.55 * amount
  rig.legL.rotation.x = s
  rig.legR.rotation.x = -s
  rig.armL.rotation.x = -s * 0.7
  rig.armR.rotation.x = s * 0.7
  rig.body.position.y = Math.abs(Math.cos(phase)) * 0.018 * amount
  // Standing people breathe and shift weight a little.
  rig.body.rotation.z = Math.sin(time * 0.7 + phase) * 0.012 * (1 - amount)
  if (rig.coat) rig.coat.rotation.x = -0.12 * amount + Math.sin(phase * 2) * 0.03 * amount
}
