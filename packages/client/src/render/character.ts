// Characters are built from an AvatarSpec out of simple boxes, so every option
// is a few lines of code and needs no art. To add a hair style or accessory:
// add its name in @sprawl/shared/avatar.ts, then a case below.

import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, type Material } from 'three'
import { ACCESSORIES, BUILDS, HAIR_STYLES, HEIGHTS, TOPS, type AvatarSpec } from '@sprawl/shared'
import { CLOTH, HAIR, NEON, SKIN } from '@sprawl/content'

const geos = new Map<string, BoxGeometry>()
function box(w: number, h: number, d: number): BoxGeometry {
  const k = `${w},${h},${d}`
  let g = geos.get(k)
  if (!g) geos.set(k, (g = new BoxGeometry(w, h, d)))
  return g
}

const mats = new Map<string, Material>()
function lambert(hex: number): Material {
  const k = `l${hex}`
  let m = mats.get(k)
  // A little self-glow keeps characters readable against the night street.
  if (!m) mats.set(k, (m = new MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.35 })))
  return m
}
function glow(hex: number): Material {
  const k = `g${hex}`
  let m = mats.get(k)
  if (!m) mats.set(k, (m = new MeshBasicMaterial({ color: hex })))
  return m
}

function part(geo: BoxGeometry, mat: Material, x: number, y: number, z: number): Mesh {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  return m
}

/** The pieces the walk animation moves. */
export interface Character {
  root: Group
  body: Group
  legL: Group
  legR: Group
  armL: Group
  armR: Group
  /** Height of the top of the head, for placing name tags and bubbles. */
  top: number
}

export function buildCharacter(spec: AvatarSpec): Character {
  const width = [0.86, 1, 1.18][spec.build]!
  const tall = [0.88, 1, 1.12][spec.height]!
  const skin = lambert(SKIN[spec.skin]!)
  const top = lambert(CLOTH[spec.topColor]!)
  const legs = lambert(CLOTH[spec.legsColor]!)
  const hair = lambert(HAIR[spec.hairColor]!)
  const accent = glow(NEON[spec.accent]!)
  const topStyle = TOPS[spec.top]!

  const root = new Group()
  const body = new Group()
  root.add(body)
  body.scale.set(width, tall, width)

  // Legs pivot at the hip.
  const legGeo = box(0.12, 0.34, 0.13)
  const makeLeg = (x: number) => {
    const g = new Group()
    g.position.set(x, 0.36, 0)
    g.add(part(legGeo, legs, 0, -0.17, 0))
    g.add(part(box(0.13, 0.05, 0.17), lambert(0x111118), 0, -0.33, 0.02))
    body.add(g)
    return g
  }
  const legL = makeLeg(-0.075)
  const legR = makeLeg(0.075)

  // Torso, with the top's shape.
  body.add(part(box(0.32, 0.34, 0.18), top, 0, 0.53, 0))
  body.add(part(box(0.33, 0.025, 0.19), accent, 0, 0.375, 0)) // neon trim
  if (topStyle === 'jacket' || topStyle === 'coat') {
    body.add(part(box(0.3, 0.07, 0.2), top, 0, 0.7, -0.01)) // collar
    body.add(part(box(0.02, 0.3, 0.005), lambert(0x0a0a0f), 0, 0.53, 0.092)) // zip
  }
  if (topStyle === 'coat') body.add(part(box(0.34, 0.22, 0.2), top, 0, 0.3, 0)) // long hem
  if (topStyle === 'hoodie') body.add(part(box(0.24, 0.14, 0.08), top, 0, 0.7, -0.12)) // hood

  // Arms pivot at the shoulder; a tee shows skin below the sleeve.
  const makeArm = (x: number) => {
    const g = new Group()
    g.position.set(x, 0.68, 0)
    if (topStyle === 'tee') {
      g.add(part(box(0.09, 0.12, 0.1), top, 0, -0.06, 0))
      g.add(part(box(0.08, 0.2, 0.09), skin, 0, -0.22, 0))
    } else {
      g.add(part(box(0.09, 0.3, 0.1), top, 0, -0.15, 0))
      g.add(part(box(0.08, 0.05, 0.09), skin, 0, -0.32, 0))
    }
    body.add(g)
    return g
  }
  const armL = makeArm(-0.21)
  const armR = makeArm(0.21)

  // Head.
  const headY = 0.84
  body.add(part(box(0.24, 0.24, 0.22), skin, 0, headY, 0))
  const accessory = ACCESSORIES[spec.accessory]!
  if (accessory !== 'mirrorshades' && accessory !== 'visor') {
    body.add(part(box(0.04, 0.04, 0.01), lambert(0x101014), -0.055, headY + 0.02, 0.112))
    body.add(part(box(0.04, 0.04, 0.01), lambert(0x101014), 0.055, headY + 0.02, 0.112))
  }

  // Hair.
  switch (HAIR_STYLES[spec.hair]) {
    case 'crop':
      body.add(part(box(0.26, 0.06, 0.24), hair, 0, headY + 0.13, -0.005))
      body.add(part(box(0.26, 0.12, 0.05), hair, 0, headY + 0.06, -0.1))
      break
    case 'mohawk':
      body.add(part(box(0.06, 0.14, 0.24), hair, 0, headY + 0.18, -0.01))
      break
    case 'long':
      body.add(part(box(0.27, 0.07, 0.25), hair, 0, headY + 0.13, -0.005))
      body.add(part(box(0.27, 0.34, 0.06), hair, 0, headY - 0.05, -0.11))
      break
    case 'bun':
      body.add(part(box(0.26, 0.06, 0.24), hair, 0, headY + 0.13, -0.005))
      body.add(part(box(0.1, 0.1, 0.1), hair, 0, headY + 0.18, -0.1))
      break
    case 'spikes':
      for (const [x, z] of [[-0.08, 0.04], [0, -0.02], [0.08, 0.04], [-0.05, -0.08], [0.05, -0.08]] as const) {
        const s = part(box(0.05, 0.12, 0.05), hair, x, headY + 0.17, z)
        s.rotation.set(z * 3, 0, -x * 4)
        body.add(s)
      }
      break
  }

  // Accessories.
  switch (accessory) {
    case 'mirrorshades':
      body.add(part(box(0.25, 0.06, 0.02), glow(0x9fb4c8), 0, headY + 0.02, 0.115))
      break
    case 'visor':
      body.add(part(box(0.26, 0.05, 0.02), accent, 0, headY + 0.02, 0.115))
      break
    case 'headphones':
      body.add(part(box(0.04, 0.1, 0.1), lambert(0x1a1a22), -0.14, headY, 0))
      body.add(part(box(0.04, 0.1, 0.1), lambert(0x1a1a22), 0.14, headY, 0))
      body.add(part(box(0.3, 0.03, 0.04), lambert(0x1a1a22), 0, headY + 0.15, 0))
      break
    case 'cap':
      body.add(part(box(0.27, 0.08, 0.25), top, 0, headY + 0.15, 0))
      body.add(part(box(0.24, 0.02, 0.12), top, 0, headY + 0.11, 0.17))
      break
  }

  // A soft dark disc under the feet to seat the character on the ground.
  const shadow = new Mesh(box(0.42, 0.005, 0.42), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }))
  shadow.position.y = 0.003
  root.add(shadow)

  return { root, body, legL, legR, armL, armR, top: (headY + 0.2) * tall }
}

/** Swing limbs; `phase` advances with distance walked, `amount` is 0 idle to 1 walking. */
export function animateWalk(c: Character, phase: number, amount: number): void {
  const swing = Math.sin(phase) * 0.7 * amount
  c.legL.rotation.x = swing
  c.legR.rotation.x = -swing
  c.armL.rotation.x = -swing * 0.8
  c.armR.rotation.x = swing * 0.8
  c.body.position.y = Math.abs(Math.cos(phase)) * 0.025 * amount
}

// Re-exported for the customiser's labels.
export const OPTION_LABELS = { build: BUILDS, height: HEIGHTS, hair: HAIR_STYLES, top: TOPS, accessory: ACCESSORIES }
