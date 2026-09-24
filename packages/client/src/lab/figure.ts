// Look lab: tall, lean figures, about eight heads high, built from a few
// tapered cylinders. A long coat, trousers, a small head, optional hair.

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

const mat = (hex: number, rough = 0.85) => hazed(new MeshStandardMaterial({ color: hex, roughness: rough }), 'fig')

function limb(r1: number, r2: number, len: number, m: MeshStandardMaterial): Mesh {
  const mesh = new Mesh(new CylinderGeometry(r1, r2, len, 8).translate(0, -len / 2, 0), m)
  mesh.castShadow = true
  return mesh
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

  // Legs: long and thin, a little apart.
  for (const x of [-0.045, 0.045]) {
    const leg = limb(0.03, 0.022, 0.5, legs)
    leg.position.set(x, 0.52, 0)
    body.add(leg)
    const shoe = new Mesh(new CylinderGeometry(0.022, 0.028, 0.03, 6), mat(0x141312, 0.5))
    shoe.position.set(x, 0.015, 0.012)
    shoe.scale.z = 1.6
    body.add(shoe)
  }

  // Torso, tapering from the shoulders.
  const torso = limb(0.085, 0.065, 0.34, coat)
  torso.position.y = 0.86
  torso.scale.z = 0.65
  body.add(torso)
  if (spec.coatLength > 0) {
    const skirt = limb(0.07, 0.1, 0.3, coat)
    skirt.position.y = 0.54
    skirt.scale.z = 0.7
    body.add(skirt)
  }

  // Arms hang close to the body.
  for (const x of [-0.1, 0.1]) {
    const arm = limb(0.022, 0.018, 0.34, coat)
    arm.position.set(x, 0.84, 0)
    arm.rotation.z = x > 0 ? 0.06 : -0.06
    body.add(arm)
    const hand = new Mesh(new SphereGeometry(0.018, 6, 5), skin)
    hand.position.set(x * 1.12, 0.49, 0)
    body.add(hand)
  }

  // Neck and a small head.
  const neck = limb(0.018, 0.02, 0.04, skin)
  neck.position.y = 0.9
  body.add(neck)
  const head = new Mesh(new SphereGeometry(0.05, 12, 10), skin)
  head.scale.set(0.9, 1.15, 1)
  head.position.y = 0.94
  head.castShadow = true
  body.add(head)
  if (spec.hairStyle > 0) {
    const cap = new Mesh(new SphereGeometry(0.053, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair)
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
  return root
}
