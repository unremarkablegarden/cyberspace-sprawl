// Look lab: tall, lean figures, about eight heads high, built from a few
// tapered cylinders. Legs and arms hang from pivots so they can walk.

import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, type Texture } from 'three'
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
  coat: Mesh | null
}

const mats = new Map<string, MeshStandardMaterial>()
function mat(hex: number, rough = 0.85): MeshStandardMaterial {
  const k = `${hex}:${rough}`
  let m = mats.get(k)
  if (!m) mats.set(k, (m = hazed(new MeshStandardMaterial({ color: hex, roughness: rough }), 'fig')))
  return m
}

function limb(r1: number, r2: number, len: number, m: MeshStandardMaterial): Mesh {
  const mesh = new Mesh(new CylinderGeometry(r1, r2, len, 10).translate(0, -len / 2, 0), m)
  mesh.castShadow = true
  return mesh
}

function pivot(parent: Group, x: number, y: number): Group {
  const g = new Group()
  g.position.set(x, y, 0)
  parent.add(g)
  return g
}

export function buildFigure(spec: FigureSpec, blob: Texture): Group {
  const root = new Group()
  const body = new Group()
  body.scale.setScalar(spec.height)
  root.add(body)
  const skin = mat(spec.skin, 0.7)
  const coat = mat(spec.coat)
  const legs = mat(spec.legs)
  const hair = mat(spec.hair, 0.95)
  const shoe = mat(0x141312, 0.5)

  // Legs hang from the hip.
  const hip = 0.52
  const legPivots = [-0.045, 0.045].map((x) => {
    const p = pivot(body, x, hip)
    p.add(limb(0.03, 0.022, 0.5, legs))
    const s = new Mesh(new CylinderGeometry(0.022, 0.028, 0.03, 8), shoe)
    s.position.set(0, -0.505, 0.012)
    s.scale.z = 1.6
    p.add(s)
    return p
  }) as [Group, Group]

  // Torso, tapering from the shoulders, and a coat hem that swings a little.
  const torso = limb(0.085, 0.065, 0.34, coat)
  torso.position.y = 0.86
  torso.scale.z = 0.65
  body.add(torso)
  let hem: Mesh | null = null
  if (spec.coatLength > 0) {
    hem = limb(0.07, 0.1, 0.3, coat)
    hem.position.y = 0.54
    hem.scale.z = 0.7
    body.add(hem)
  }
  // Collar.
  const collar = new Mesh(new CylinderGeometry(0.03, 0.05, 0.05, 10, 1, true), coat)
  collar.position.y = 0.88
  collar.scale.z = 0.8
  body.add(collar)

  // Arms hang from the shoulder, close to the body.
  const armPivots = [-0.1, 0.1].map((x) => {
    const p = pivot(body, x, 0.84)
    const a = limb(0.022, 0.018, 0.34, coat)
    a.rotation.z = x > 0 ? 0.06 : -0.06
    p.add(a)
    const hand = new Mesh(new SphereGeometry(0.018, 8, 6), skin)
    hand.position.set(x * 0.2, -0.35, 0)
    p.add(hand)
    return p
  }) as [Group, Group]

  // Neck and a small head.
  const neck = limb(0.018, 0.02, 0.04, skin)
  neck.position.y = 0.9
  body.add(neck)
  const head = new Mesh(new SphereGeometry(0.05, 14, 12), skin)
  head.scale.set(0.9, 1.15, 1)
  head.position.y = 0.94
  head.castShadow = true
  body.add(head)
  if (spec.hairStyle > 0) {
    const cap = new Mesh(new SphereGeometry(0.053, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair)
    cap.scale.set(0.92, 1.15, 1.02)
    cap.position.set(0, 0.945, -0.004)
    body.add(cap)
    if (spec.hairStyle === 2) {
      const fall = limb(0.045, 0.04, 0.12, hair)
      fall.position.set(0, 0.95, -0.02)
      fall.scale.z = 0.6
      body.add(fall)
    }
  }

  // Contact shadow: a soft dark disc that seats the figure on the ground.
  const shadow = new Mesh(
    new PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }),
  )
  shadow.position.y = 0.005
  shadow.renderOrder = 1
  root.add(shadow)

  const rig: Rig = { body, legL: legPivots[0], legR: legPivots[1], armL: armPivots[0], armR: armPivots[1], coat: hem }
  root.userData.rig = rig
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
