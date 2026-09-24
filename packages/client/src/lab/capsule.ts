// Look lab: a coffin as a Nakagin capsule (Kurokawa, 1972). Moulded white
// plastic, a porthole onto the city, a built-in unit with a tape deck and a
// small screen, a pull-down desk, a bed, and one tungsten lamp. Units: metres.

import {
  BackSide, BoxGeometry, CanvasTexture, Color, CylinderGeometry, ExtrudeGeometry, Group, HemisphereLight,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, Path, PerspectiveCamera, PlaneGeometry, PointLight, Scene, Shape,
  SphereGeometry, SpotLight, TorusGeometry, type Material,
} from 'three'
import type { Sky } from './haze.ts'

const W = 2.3, H = 2.1, D = 3.8, R = 0.42
const PORT_Y = 1.2, PORT_R = 0.6

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

function box(w: number, h: number, d: number, m: Material, x: number, y: number, z: number, parent: Group): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), m)
  mesh.position.set(x, y, z)
  mesh.castShadow = mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

/** What you see through the porthole: haze, towers, lit windows at night. */
function outsideView(sky: Sky): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const hz = new Color().setHex(sky.haze)
  const css = (col: Color, k = 1) => `rgb(${(col.r * 255 * k) | 0},${(col.g * 255 * k) | 0},${(col.b * 255 * k) | 0})`
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, css(hz, 1.08))
  grad.addColorStop(1, css(hz, 0.8))
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  // Towers in layers, nearer ones darker.
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (const [depth, k] of [[0, 0.8], [1, 0.62], [2, 0.45]] as const) {
    for (let i = 0; i < 7; i++) {
      const w = 26 + rnd() * 40, x = rnd() * 256 - 20, top = 40 + depth * 30 + rnd() * 80
      g.fillStyle = css(hz, k)
      g.fillRect(x, top, w, 256)
      if (sky.night > 0.3)
        for (let wy = top + 6; wy < 256; wy += 7)
          for (let wx = x + 3; wx < x + w - 3; wx += 6)
            if (rnd() > 0.8) {
              g.fillStyle = rnd() > 0.9 ? '#cfe0c8' : '#ffb46a'
              g.globalAlpha = sky.night * (0.4 + depth * 0.2)
              g.fillRect(wx, wy, 2, 2)
              g.globalAlpha = 1
            }
    }
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = 'srgb'
  return tex
}

export function buildCapsule(sky: Sky): { scene: Scene; camera: PerspectiveCamera } {
  const scene = new Scene()
  scene.background = new Color(0x0b0b0b)
  const room = new Group()
  scene.add(room)

  const plastic = new MeshStandardMaterial({ color: 0xebe7dd, roughness: 0.62, side: BackSide })
  const panel = new MeshStandardMaterial({ color: 0xdcd6c9, roughness: 0.4 })
  const dark = new MeshStandardMaterial({ color: 0x1e1d1c, roughness: 0.5 })
  const chrome = new MeshStandardMaterial({ color: 0xb8b6b0, roughness: 0.25, metalness: 0.9 })

  // The shell: one moulded tube with rounded corners, the porthole cut in the far end.
  const shape = roundedRect(W, H, R)
  shape.holes.push(new Path().absarc(0, PORT_Y, PORT_R, 0, Math.PI * 2, true))
  const shell = new Mesh(new ExtrudeGeometry(shape, { depth: D, bevelEnabled: false, curveSegments: 48 }).translate(0, 0, -D / 2), plastic)
  shell.receiveShadow = false
  room.add(shell)

  // Porthole: a thick moulded ring, and the city behind it.
  const ring = new Mesh(new TorusGeometry(PORT_R, 0.07, 12, 48), new MeshStandardMaterial({ color: 0xe2ddd1, roughness: 0.3 }))
  ring.position.set(0, PORT_Y, -D / 2 + 0.02)
  room.add(ring)
  const view = new Mesh(new PlaneGeometry(3, 3), new MeshBasicMaterial({ map: outsideView(sky) }))
  view.position.set(0, PORT_Y, -D / 2 - 0.6)
  room.add(view)

  // Carpeted floor between the curves.
  box(W - 2 * R + 0.3, 0.03, D, new MeshStandardMaterial({ color: 0x4a3a2e, roughness: 1 }), 0, 0.015, 0, room)

  // Bed along the left wall on a moulded plinth.
  box(1.05, 0.38, 2.1, panel, -W / 2 + 0.6, 0.19, -0.4, room)
  box(0.98, 0.14, 2.0, new MeshStandardMaterial({ color: 0xe6dfcf, roughness: 0.95 }), -W / 2 + 0.6, 0.45, -0.4, room)
  box(1.0, 0.07, 1.1, new MeshStandardMaterial({ color: 0x6e2a2a, roughness: 1 }), -W / 2 + 0.6, 0.55, 0.05, room)
  box(0.55, 0.1, 0.3, new MeshStandardMaterial({ color: 0xf0ead8, roughness: 1 }), -W / 2 + 0.6, 0.57, -1.25, room)

  // Built-in unit on the right wall: tape deck, a small screen, switches.
  const unit = new Group()
  unit.position.set(W / 2 - 0.2, 0, -0.5)
  room.add(unit)
  box(0.24, 0.95, 1.5, panel, 0, 1.35, 0, unit)
  box(0.03, 0.2, 0.62, dark, -0.13, 1.62, -0.25, unit) // tape deck face
  for (const z of [-0.42, -0.08]) {
    const reel = new Mesh(new CylinderGeometry(0.065, 0.065, 0.02, 20).rotateZ(Math.PI / 2), chrome)
    reel.position.set(-0.15, 1.62, z)
    unit.add(reel)
  }
  box(0.2, 0.26, 0.32, new MeshStandardMaterial({ color: 0x2a2826, roughness: 0.6 }), -0.06, 1.2, 0.45, unit) // screen housing
  box(0.01, 0.18, 0.24, new MeshBasicMaterial({ color: new Color(0x3f6a45).multiplyScalar(0.8 + sky.night * 0.4) }), -0.165, 1.2, 0.45, unit)
  for (let i = 0; i < 6; i++) {
    const sw = new Mesh(new CylinderGeometry(0.012, 0.012, 0.04, 8).rotateZ(Math.PI / 2), chrome)
    sw.position.set(-0.14, 1.42, -0.5 + i * 0.07)
    unit.add(sw)
  }

  // Pull-down desk, folded out, with a deck and a cup on it.
  box(0.5, 0.035, 0.95, panel, -0.35, 0.8, 0.25, unit)
  box(0.22, 0.03, 0.34, dark, -0.33, 0.83, 0.2, unit)
  const cup = new Mesh(new CylinderGeometry(0.035, 0.03, 0.08, 14), new MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.6 }))
  cup.position.set(-0.4, 0.86, 0.58)
  unit.add(cup)

  // A sticker on the wall: somebody's old sign.
  const sticker = new Mesh(new PlaneGeometry(0.22, 0.3), new MeshBasicMaterial({ color: 0xa8352c }))
  sticker.position.set(-W / 2 + 0.16, 1.35, 0.9)
  sticker.rotation.y = Math.PI / 2 - 0.25
  room.add(sticker)

  // The tungsten reading lamp over the bed.
  const shade = new Mesh(new CylinderGeometry(0.05, 0.11, 0.12, 20, 1, true), new MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.5, side: 2 }))
  shade.position.set(-W / 2 + 0.42, 1.55, -1.1)
  room.add(shade)
  box(0.02, 0.02, 0.3, new MeshStandardMaterial({ color: 0x2b2a28 }), -W / 2 + 0.42, 1.62, -1.25, room) // arm
  const bulb = new Mesh(new SphereGeometry(0.03, 10, 8), new MeshBasicMaterial({ color: 0xffd09a }))
  bulb.position.set(-W / 2 + 0.42, 1.51, -1.1)
  room.add(bulb)
  const lamp = new PointLight(0xffa860, 0.9 + sky.night * 0.6, 0, 2)
  lamp.position.copy(bulb.position).y -= 0.05
  lamp.castShadow = true
  lamp.shadow.mapSize.set(1024, 1024)
  lamp.shadow.bias = -0.002
  room.add(lamp)

  // Daylight through the porthole, and the room's own soft bounce.
  const day = 1 - sky.night
  const port = new SpotLight(new Color().setHex(sky.haze).lerp(new Color(0xffffff), 0.5), 4 * day + 0.1, 8, 0.9, 0.8, 1.5)
  port.position.set(0, PORT_Y, -D / 2 - 0.3)
  port.target.position.set(0.2, 0.4, 1)
  port.castShadow = true
  room.add(port, port.target)
  scene.add(new HemisphereLight(0xfff4e6, 0x3a2e24, 0.3 + day * 0.7))

  const camera = new PerspectiveCamera(62, 1, 0.05, 50)
  camera.position.set(0.35, 1.5, D / 2 - 0.15)
  camera.lookAt(-0.25, 0.95, -D / 2 + 0.2)
  return { scene, camera }
}
