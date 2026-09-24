// Look lab: a coffin as a Nakagin capsule (Kurokawa, 1972), seen like a
// dollhouse through the same isometric camera as the street. The shell is
// drawn inside-out, so the walls facing the camera vanish on their own and the
// far walls, floor and porthole stay: the Sims cutaway for free.
// Units: the street's, where a person is about 1.0 (≈ 1.75 m).

import {
  BackSide, BoxGeometry, CanvasTexture, Color, CylinderGeometry, ExtrudeGeometry, Group, HemisphereLight, Mesh,
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
function outsideView(sky: Sky): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
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
  const tex = new CanvasTexture(c)
  tex.colorSpace = 'srgb'
  return tex
}

export interface Capsule {
  scene: Scene
  /** Where the camera looks. */
  focus: Vector3
}

export function buildCapsule(sky: Sky, blob: Texture): Capsule {
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
  const view = new Mesh(new PlaneGeometry(PORT_R * 2.1, PORT_R * 2.1), new MeshBasicMaterial({ map: outsideView(sky) }))
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
  part(new BoxGeometry(0.006, 0.11, 0.15), new MeshBasicMaterial({ color: new Color(0x3f6a45).multiplyScalar(0.8 + sky.night * 0.4) }), 0.1, 0.72, 0.27, unit)
  for (let i = 0; i < 5; i++) part(new CylinderGeometry(0.008, 0.008, 0.025, 8).rotateZ(Math.PI / 2), chrome, 0.08, 0.85, -0.3 + i * 0.045, unit)
  // Pull-down desk, folded out, with a deck and a cup.
  part(soft(0.3, 0.02, 0.56, 0.01), panel, 0.2, 0.47, 0.15, unit)
  part(soft(0.13, 0.02, 0.2, 0.008), dark, 0.2, 0.49, 0.1, unit)
  part(new CylinderGeometry(0.022, 0.018, 0.05, 16), new MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.6 }), 0.24, 0.505, 0.36, unit)

  // A sticker on the far wall: somebody's old sign.
  const sticker = new Mesh(new PlaneGeometry(0.13, 0.18), new MeshBasicMaterial({ color: 0xa8352c }))
  sticker.position.set(-0.45, 0.9, -D / 2 + 0.02)
  room.add(sticker)

  // Tungsten reading lamp over the bed.
  const lampPos = new Vector3(W / 2 - 0.2, 0.95, -0.95)
  const shade = new Mesh(new CylinderGeometry(0.03, 0.07, 0.07, 20, 1, true), new MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.5, side: 2 }))
  shade.position.copy(lampPos)
  room.add(shade)
  const bulb = new Mesh(new SphereGeometry(0.018, 10, 8), new MeshBasicMaterial({ color: 0xffd09a }))
  bulb.position.copy(lampPos).y -= 0.02
  room.add(bulb)
  const lamp = new PointLight(0xffa860, 0.5 + sky.night * 0.5, 0, 2)
  lamp.position.copy(lampPos).y -= 0.05
  lamp.castShadow = true
  lamp.shadow.mapSize.set(1024, 1024)
  lamp.shadow.bias = -0.002
  room.add(lamp)

  // Daylight through the porthole, and the room's soft bounce.
  const day = 1 - sky.night
  const port = new SpotLight(new Color().setHex(sky.haze).lerp(new Color(0xffffff), 0.5), 2.5 * day + 0.05, 5, 0.9, 0.8, 1.5)
  port.position.set(0, PORT_Y, -D / 2 - 0.2)
  port.target.position.set(0.15, 0.1, 0.6)
  port.castShadow = true
  room.add(port, port.target)
  scene.add(new HemisphereLight(0xfff4e6, 0x3a2e24, 0.35 + day * 0.8))

  // Somebody at home.
  const me = buildFigure({ skin: 0xd9a37e, coat: 0x2e2f33, legs: 0x161615, hair: 0x141312, hairStyle: 1, coatLength: 0, height: 0.8 }, blob)
  me.position.set(-0.12, 0.02, 0.35)
  me.rotation.y = -2.2
  room.add(me)

  return { scene, focus: new Vector3(0, 0.45, 0) }
}
