// Look lab: a coffin as a Nakagin capsule (Kurokawa, 1972), seen like a
// dollhouse through the same isometric camera as the street. The shell is
// drawn inside-out, so the walls facing the camera vanish on their own and the
// far walls, floor and porthole stay: the Sims cutaway for free.
// Units: the street's, where a person is about 1.0 (≈ 1.75 m).

import {
  BackSide, BoxGeometry, CanvasTexture, CatmullRomCurve3, IcosahedronGeometry, TubeGeometry, Color, CylinderGeometry, ExtrudeGeometry, Group, HemisphereLight, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, Path, PlaneGeometry, PointLight, Scene, Shape, SphereGeometry, SpotLight,
  FrontSide, Plane, ShapeGeometry, TorusGeometry, Vector3, type BufferGeometry, type Material, type Texture,
} from 'three'
import type { Sky } from './haze.ts'
import { buildFigure } from './figure.ts'
import { roundedBox } from './shapes.ts'

// A Nakagin capsule is about 2.5 × 2.5 × 4 m.
const W = 1.45, H = 1.4, D = 2.3, R = 0.26
const PORT_Y = 0.7, PORT_R = 0.34

function roundedRect(w: number, h: number, r: number): Shape {
  const s = new Shape()
  const x0 = -w / 2, x1 = w / 2
  s.moveTo(x0 + r, 0)
  s.lineTo(x1 - r, 0)
  s.quadraticCurveTo(x1, 0, x1, r)
  s.lineTo(x1, h - r)
  s.quadraticCurveTo(x1, h, x1 - r, h)
  s.lineTo(x0 + r, h)
  s.quadraticCurveTo(x0, h, x0, h - r)
  s.lineTo(x0, r)
  s.quadraticCurveTo(x0, 0, x0 + r, 0)
  return s
}

function part(geo: BufferGeometry, m: Material, x: number, y: number, z: number, parent: Group): Mesh {
  const mesh = new Mesh(geo, m)
  mesh.position.set(x, y, z)
  mesh.castShadow = mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}
const soft = (w: number, h: number, d: number, r = 0.02) => roundedBox(w, h, d, Math.min(r, w / 2, h / 2, d / 2))

/** What you see through the porthole: haze, towers, lit windows at night. */
function paintOutside(c: HTMLCanvasElement, sky: Sky): void {
  const g = c.getContext('2d')!
  const hz = new Color().setHex(sky.haze)
  const css = (k: number) => `rgb(${(hz.r * 255 * k) | 0},${(hz.g * 255 * k) | 0},${(hz.b * 255 * k) | 0})`
  g.fillStyle = css(1.05)
  g.fillRect(0, 0, 128, 128)
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (const [depth, k] of [[0, 0.82], [1, 0.62]] as const)
    for (let i = 0; i < 6; i++) {
      const w = 14 + rnd() * 22, x = rnd() * 128 - 10, top = 30 + depth * 22 + rnd() * 40
      g.fillStyle = css(k)
      g.fillRect(x, top, w, 128)
      if (sky.night > 0.3)
        for (let wy = top + 4; wy < 128; wy += 5)
          for (let wx = x + 2; wx < x + w - 2; wx += 4)
            if (rnd() > 0.8) {
              g.fillStyle = rnd() > 0.9 ? '#cfe0c8' : '#ffb46a'
              g.fillRect(wx, wy, 1.5, 1.5)
            }
    }
}


/** A gig poster: cream paper, a sodium sun, a few lines of type. */
function posterTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 110
  c.height = 150
  const g = c.getContext('2d')!
  g.fillStyle = '#e8e0cc'
  g.fillRect(0, 0, 110, 150)
  g.fillStyle = '#c2412f'
  g.beginPath()
  g.arc(55, 58, 30, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#1e1d1c'
  g.fillRect(0, 70, 110, 5)
  for (let i = 0; i < 4; i++) g.fillRect(14, 102 + i * 9, 30 + ((i * 29) % 50), 4)
  const t = new CanvasTexture(c)
  t.colorSpace = 'srgb'
  return t
}

/** A striped wool rug. */
function rugTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 96
  const g = c.getContext('2d')!
  g.fillStyle = '#5e2424'
  g.fillRect(0, 0, 64, 96)
  const stripes = ['#c9a24a', '#e6dcc0', '#2e2f33']
  for (let y = 8, i = 0; y < 96; y += 11, i++) {
    g.fillStyle = stripes[i % 3]!
    g.fillRect(0, y, 64, 3)
  }
  const t = new CanvasTexture(c)
  t.colorSpace = 'srgb'
  return t
}

export interface Capsule {
  scene: Scene
  /** Where the camera looks. */
  focus: Vector3
  /** Relight for another hour or weather. */
  update(sky: Sky): void
}

/** Built once; `update` changes the light and the view out of the porthole. */
export function buildCapsule(blob: Texture): Capsule {
  const scene = new Scene()
  scene.background = new Color(0x141312)
  const room = new Group()
  scene.add(room)

  // Walls are cut at shoulder height like the Sims' walls-cutaway, so the
  // ceiling and its curved edges never block the view in.
  const plastic = new MeshStandardMaterial({ color: 0xebe7dd, roughness: 0.55, side: BackSide, clippingPlanes: [new Plane(new Vector3(0, -1, 0), H - R * 1.1)] })
  const panel = new MeshStandardMaterial({ color: 0xdcd6c9, roughness: 0.45 })
  const dark = new MeshStandardMaterial({ color: 0x1e1d1c, roughness: 0.5 })
  const chrome = new MeshStandardMaterial({ color: 0xb8b6b0, roughness: 0.25, metalness: 0.9 })

  // The shell: one moulded tube with rounded corners, porthole in the far end.
  // The tube's own end caps are hidden (material slot 0); the far end is a
  // separate wall with the porthole cut in it.
  const hidden = new MeshBasicMaterial({ visible: false })
  const shell = new Mesh(new ExtrudeGeometry(roundedRect(W, H, R), { depth: D, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -D / 2), [hidden, plastic])
  shell.receiveShadow = true
  room.add(shell)
  const endShape = roundedRect(W, H, R)
  endShape.holes.push(new Path().absarc(0, PORT_Y, PORT_R, 0, Math.PI * 2, true))
  const endWall = new Mesh(new ShapeGeometry(endShape, 24), plastic.clone())
  endWall.material.side = FrontSide
  endWall.position.z = -D / 2
  endWall.receiveShadow = true
  room.add(endWall)

  // Porthole ring, and the city right behind the hole.
  const ring = new Mesh(new TorusGeometry(PORT_R, 0.045, 12, 48), new MeshStandardMaterial({ color: 0xe2ddd1, roughness: 0.3 }))
  ring.position.set(0, PORT_Y, -D / 2 + 0.015)
  room.add(ring)
  const outside = document.createElement('canvas')
  outside.width = outside.height = 128
  const outsideTex = new CanvasTexture(outside)
  outsideTex.colorSpace = 'srgb'
  const view = new Mesh(new PlaneGeometry(PORT_R * 2.1, PORT_R * 2.1), new MeshBasicMaterial({ map: outsideTex }))
  view.position.set(0, PORT_Y, -D / 2 - 0.02)
  room.add(view)

  // Carpet between the curves.
  part(soft(W - 2 * R + 0.2, 0.02, D - 0.04, 0.01), new MeshStandardMaterial({ color: 0x4a3a2e, roughness: 1 }), 0, 0.01, 0, room)

  // Bed along the right wall on a moulded plinth.
  const bx = W / 2 - 0.36
  part(soft(0.62, 0.22, 1.25, 0.06), panel, bx, 0.11, -0.45, room)
  part(soft(0.58, 0.08, 1.2, 0.035), new MeshStandardMaterial({ color: 0xe6dfcf, roughness: 0.95 }), bx, 0.26, -0.45, room)
  part(soft(0.61, 0.04, 0.66, 0.02), new MeshStandardMaterial({ color: 0x6e2a2a, roughness: 1 }), bx, 0.32, -0.2, room)
  part(soft(0.34, 0.06, 0.18, 0.03), new MeshStandardMaterial({ color: 0xf0ead8, roughness: 1 }), bx, 0.33, -0.95, room)

  // Built-in unit on the left wall: tape deck, a small screen, switches.
  const unit = new Group()
  unit.position.set(-W / 2 + 0.12, 0, -0.35)
  room.add(unit)
  part(soft(0.14, 0.56, 0.9, 0.04), panel, 0, 0.8, 0, unit)
  part(soft(0.02, 0.12, 0.38, 0.008), dark, 0.075, 0.96, -0.15, unit)
  for (const z of [-0.25, -0.05]) part(new CylinderGeometry(0.04, 0.04, 0.012, 20).rotateZ(Math.PI / 2), chrome, 0.09, 0.96, z, unit)
  part(soft(0.12, 0.16, 0.2, 0.025), new MeshStandardMaterial({ color: 0x2a2826, roughness: 0.6 }), 0.04, 0.72, 0.27, unit)
  const screen = new MeshBasicMaterial()
  part(new BoxGeometry(0.006, 0.11, 0.15), screen, 0.1, 0.72, 0.27, unit)
  for (let i = 0; i < 5; i++) part(new CylinderGeometry(0.008, 0.008, 0.025, 8).rotateZ(Math.PI / 2), chrome, 0.08, 0.85, -0.3 + i * 0.045, unit)
  // Pull-down desk, folded out, with a deck and a cup.
  part(soft(0.3, 0.02, 0.56, 0.01), panel, 0.2, 0.47, 0.15, unit)
  part(soft(0.13, 0.02, 0.2, 0.008), dark, 0.2, 0.49, 0.1, unit)
  part(new CylinderGeometry(0.022, 0.018, 0.05, 16), new MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.6 }), 0.24, 0.505, 0.36, unit)

  // A print on the far wall: a gig poster from somewhere in Ninsei.
  const poster = new Mesh(new PlaneGeometry(0.22, 0.3), new MeshStandardMaterial({ map: posterTexture(), roughness: 0.9 }))
  poster.position.set(-0.47, 0.66, -D / 2 + 0.012)
  room.add(poster)

  // A shelf of paperbacks above the poster.
  const shelfX = -0.47, shelfY = 0.93
  part(soft(0.26, 0.018, 0.12, 0.006), panel, shelfX, shelfY, -D / 2 + 0.08, room)
  const BOOKS = [0x6e2a2a, 0xd9d0bc, 0x2e3a44, 0xb8652f, 0x4a5236, 0xe6dcc0, 0x3d2c29]
  let bx0 = shelfX - 0.11
  BOOKS.forEach((hex, i) => {
    const w = 0.022 + (i % 3) * 0.006, h = 0.09 + ((i * 7) % 4) * 0.012
    part(new BoxGeometry(w, h, 0.075), new MeshStandardMaterial({ color: hex, roughness: 0.8 }), bx0 + w / 2, shelfY + 0.009 + h / 2, -D / 2 + 0.08, room)
    bx0 += w + 0.003
  })

  // A plant in the corner, doing its best.
  part(new CylinderGeometry(0.06, 0.045, 0.1, 16), new MeshStandardMaterial({ color: 0xb8652f, roughness: 0.9 }), -0.46, 0.07, -D / 2 + 0.16, room)
  for (let i = 0; i < 5; i++) {
    const leaf = part(new IcosahedronGeometry(0.055, 1), new MeshStandardMaterial({ color: [0x4f6a3a, 0x5d7a42, 0x44602f][i % 3], roughness: 0.9 }),
      -0.46 + Math.cos(i * 1.3) * 0.04, 0.17 + (i % 3) * 0.045, -D / 2 + 0.16 + Math.sin(i * 1.3) * 0.04, room)
    leaf.scale.set(1, 0.7, 1)
  }

  // A rug.
  part(soft(0.46, 0.008, 0.66, 0.06), new MeshStandardMaterial({ map: rugTexture(), roughness: 1 }), -0.05, 0.024, 0.55, room)

  // Coat on a hook by the door.
  part(new CylinderGeometry(0.008, 0.008, 0.05, 8).rotateZ(Math.PI / 2), chrome, -W / 2 + 0.05, 1.02, 0.95, room)
  const hung = part(new CylinderGeometry(0.035, 0.1, 0.5, 12), new MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.9 }), -W / 2 + 0.1, 0.77, 0.95, room)
  hung.scale.z = 0.5

  // Shoes by the bed, tapes on the desk, a cable nobody tidied.
  for (const dz of [0, 0.07]) part(soft(0.12, 0.04, 0.05, 0.015), new MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.5 }), W / 2 - 0.72, 0.045, 0.45 + dz, room)
  for (let i = 0; i < 3; i++) part(soft(0.07, 0.012, 0.045, 0.004), new MeshStandardMaterial({ color: [0x2a2826, 0xd9d0bc, 0x8f3a2e][i]! }), -W / 2 + 0.33, 0.492 + i * 0.013, -0.02 - i * 0.004, room)
  const cable = new CatmullRomCurve3([
    new Vector3(-W / 2 + 0.2, 0.7, -0.08), new Vector3(-W / 2 + 0.24, 0.3, 0.0),
    new Vector3(-0.3, 0.035, 0.15), new Vector3(0.05, 0.035, 0.05), new Vector3(W / 2 - 0.64, 0.035, -0.3),
  ])
  part(new TubeGeometry(cable, 48, 0.006, 6), dark, 0, 0, 0, room)

  // Tungsten reading lamp over the bed.
  const lampPos = new Vector3(W / 2 - 0.2, 0.95, -0.95)
  const shade = new Mesh(new CylinderGeometry(0.03, 0.07, 0.07, 20, 1, true), new MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.5, side: 2 }))
  shade.position.copy(lampPos)
  room.add(shade)
  const bulb = new Mesh(new SphereGeometry(0.018, 10, 8), new MeshBasicMaterial({ color: 0xffd09a }))
  bulb.position.copy(lampPos).y -= 0.02
  room.add(bulb)
  const lamp = new PointLight(0xffa860, 1, 0, 2)
  lamp.position.copy(lampPos).y -= 0.05
  lamp.castShadow = true
  lamp.shadow.mapSize.set(1024, 1024)
  lamp.shadow.bias = -0.002
  room.add(lamp)

  // Daylight through the porthole, and the room's soft bounce.
  const port = new SpotLight(0xffffff, 1, 5, 0.9, 0.8, 1.5)
  port.position.set(0, PORT_Y, -D / 2 - 0.2)
  port.target.position.set(0.15, 0.1, 0.6)
  port.castShadow = true
  room.add(port, port.target)
  const bounce = new HemisphereLight(0xfff4e6, 0x3a2e24, 1)
  scene.add(bounce)

  // Somebody at home.
  const me = buildFigure({ skin: 0xd9a37e, coat: 0x2e2f33, legs: 0x161615, hair: 0x141312, hairStyle: 1, coatLength: 0, height: 0.8 }, blob)
  me.position.set(-0.12, 0.02, 0.35)
  me.rotation.y = -2.2
  room.add(me)

  // Nothing in here moves.
  scene.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false })

  const white = new Color(0xffffff)
  return {
    scene,
    focus: new Vector3(0, 0.45, 0),
    update(sky) {
      const day = 1 - sky.night
      paintOutside(outside, sky)
      outsideTex.needsUpdate = true
      screen.color.setHex(0x3f6a45).multiplyScalar(0.8 + sky.night * 0.4)
      lamp.intensity = 0.5 + sky.night * 0.5
      port.color.setHex(sky.haze).lerp(white, 0.5)
      port.intensity = 2.5 * day + 0.05
      bounce.intensity = 0.35 + day * 0.8
    },
  }
}
