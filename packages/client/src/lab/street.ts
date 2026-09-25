// Look lab: the generated district rebuilt as whole buildings on a painted
// street. The map is the live game's; only the dressing differs. Each block of
// building tiles becomes a few lots, each lot a podium with a tower on it,
// rounded in plan and softened at the edges. The ground is one painted
// texture: asphalt, kerbs, lane lines, crossings, and soft shade at the feet
// of buildings. The capsule hotel is a Nakagin-style tower of pods.

import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, LineBasicMaterial, LineSegments, Color, CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, SRGBColorSpace, Vector2,
  type Material,
} from 'three'
import { hashString, PropKind, Tile, type DistrictMap, type Prop } from '@sprawl/shared'
import { hazed, haze } from './haze.ts'
import { Merger, roundedBox, slab } from './shapes.ts'

/** World height of one storey. People are about 1.0 tall. */
export const STOREY = 1.05

const CONCRETE = [0x8a8780, 0x7c7a74, 0x9a968d, 0x6f6d68, 0x85817a]
// Signs: mostly the warm Chiba set, with the odd paid-for cyan or magenta.
const SIGN_WARM = [0xf09a3a, 0xe6dcc0, 0xc2412f, 0x8fc58a, 0xe0b85a, 0xd06a30]
const SIGN_LOUD = [0x4fd6e0, 0xe04f9a]

// ── Cutaway: buildings between the camera and the player drop to a low
// podium, like the Sims' walls-down view. ──────────────────────────────────

const focus = { value: new Vector2() }
const CUT = /* glsl */ `
  uniform vec2 uFocus;
  float cutaway(vec2 pos) {
    vec2 rel = pos - uFocus;
    float ahead = dot(rel, vec2(0.7071, 0.7071));
    float across = abs(dot(rel, vec2(0.7071, -0.7071)));
    return smoothstep(0.3, 1.8, ahead) * (1.0 - smoothstep(7.0, 10.0, across)) * (1.0 - smoothstep(30.0, 34.0, ahead));
  }`

/**
 * Concrete with ribbon windows, lit at night; takes the cutaway. Drawn on
 * merged geometry: the concrete colour comes per vertex, and `aLot` carries
 * each piece's origin for the cutaway.
 */
function facade(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ roughness: 0.9, vertexColors: true })
  return hazed(m, 'facade', (shader) => {
    shader.uniforms.uFocus = focus
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 aLot;\nvarying vec3 vFW;\nvarying vec3 vFN;\n${CUT}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.y = mix(transformed.y, min(transformed.y, 0.35), cutaway(aLot.xz));`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vFW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vFN = normalize(mat3(modelMatrix) * objectNormal);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFW;\nvarying vec3 vFN;\nuniform float uNight;')
      .replace(
        'vec3 totalEmissiveRadiance = emissive;',
        `vec3 totalEmissiveRadiance = emissive;
        diffuseColor.rgb *= vColor.rgb;
        {
          float wall = smoothstep(0.6, 0.3, abs(vFN.y));
          vec2 tang = normalize(vec2(-vFN.z, vFN.x) + 1e-5);
          float along = dot(vFW.xz, tang);
          float storey = vFW.y / ${STOREY.toFixed(2)};
          float fy = fract(storey);
          // Ribbon windows: a glass band in each storey, thin mullions.
          float band = smoothstep(0.34, 0.37, fy) * smoothstep(0.83, 0.80, fy) * step(0.9, vFW.y);
          float mull = smoothstep(0.035, 0.06, abs(fract(along * 2.2) - 0.5));
          float glass = wall * band * mull;
          // Dark glass by day, with a pale reflection near the top of the band.
          vec3 glassCol = mix(vec3(0.05, 0.055, 0.06), vec3(0.24, 0.25, 0.26), smoothstep(0.55, 0.8, fy));
          diffuseColor.rgb = mix(diffuseColor.rgb, glassCol, glass);
          // Weathering: faint streaks under each window band.
          float streak = fract(sin(floor(along * 7.0) * 91.7) * 4375.5);
          diffuseColor.rgb *= 1.0 - wall * (1.0 - band) * streak * 0.14 * smoothstep(0.34, 0.0, fy);
          // A few panes lit at night.
          float cell = fract(sin(dot(vec2(floor(along * 0.8), floor(storey)), vec2(12.9898, 78.233))) * 43758.5453);
          vec3 warm = vec3(1.0, 0.7, 0.4), tube = vec3(0.8, 0.9, 0.8);
          totalEmissiveRadiance += glass * step(0.84, cell) * (cell > 0.97 ? tube : warm) * 1.1 * uNight;
          // Roofs a touch darker.
          diffuseColor.rgb *= mix(1.0, 0.8, 1.0 - wall);
        }`,
      )
      // Applied above, before the windows are painted in.
      .replace('#include <color_fragment>', '')
  })
}

// ── The ground ─────────────────────────────────────────────────────────────

function paintGround(map: DistrictMap): CanvasTexture {
  const S = 24 // pixels per tile
  const c = document.createElement('canvas')
  c.width = map.width * S
  c.height = map.height * S
  const g = c.getContext('2d')!
  const t = (x: number, y: number) => (map.inBounds(x, y) ? map.tile(x, y) : Tile.Void)
  const road = (x: number, y: number) => t(x, y) === Tile.Road
  const built = (x: number, y: number) => t(x, y) === Tile.Building || t(x, y) === Tile.Capsule

  g.fillStyle = '#2b2c2d'
  g.fillRect(0, 0, c.width, c.height)
  // Pavement and plazas.
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const k = t(x, y)
      if (k === Tile.Road) continue
      g.fillStyle = k === Tile.Plaza ? '#6d6c66' : k === Tile.Door ? '#8f8570' : '#76746e'
      g.fillRect(x * S, y * S, S, S)
    }
  // Paving joints.
  g.strokeStyle = 'rgba(0,0,0,0.07)'
  g.lineWidth = 1
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (!road(x, y) && !built(x, y)) {
        g.strokeRect(x * S + 0.5, y * S + 0.5, S / 2, S / 2)
        g.strokeRect(x * S + S / 2 + 0.5, y * S + S / 2 + 0.5, S / 2, S / 2)
      }
  // Kerbs: a pale edge wherever pavement meets road.
  g.fillStyle = '#a19e96'
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (road(x, y) || built(x, y)) continue
      if (road(x, y - 1)) g.fillRect(x * S, y * S, S, 2)
      if (road(x, y + 1)) g.fillRect(x * S, y * S + S - 2, S, 2)
      if (road(x - 1, y)) g.fillRect(x * S, y * S, 2, S)
      if (road(x + 1, y)) g.fillRect(x * S + S - 2, y * S, 2, S)
    }
  // Lane lines down two-tile streets; zebra crossings where a street meets a junction.
  g.fillStyle = 'rgba(225,220,205,0.55)'
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!road(x, y)) continue
      if (road(x, y + 1) && !road(x, y - 1) && !road(x, y + 2)) {
        const junction = (xx: number) => road(xx, y - 1) || road(xx, y + 2)
        if (junction(x + 1) || junction(x - 1)) for (let i = 0; i < 5; i++) g.fillRect(x * S + 3 + i * 4.2, y * S + 2, 2.2, S * 2 - 4)
        else if (x % 2 === 0) g.fillRect(x * S + 3, y * S + S - 1, S - 6, 2)
      }
      if (road(x + 1, y) && !road(x - 1, y) && !road(x + 2, y)) {
        const junction = (yy: number) => road(x - 1, yy) || road(x + 2, yy)
        if (junction(y + 1) || junction(y - 1)) for (let i = 0; i < 5; i++) g.fillRect(x * S + 2, y * S + 3 + i * 4.2, S * 2 - 4, 2.2)
        else if (y % 2 === 0) g.fillRect(x * S + S - 1, y * S + 3, 2, S - 6)
      }
    }
  // Soft shade at the feet of buildings.
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.55)'
  g.shadowBlur = S * 0.8
  g.fillStyle = '#000'
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (built(x, y)) g.fillRect(x * S, y * S, S, S)
  g.restore()
  // Wear: faint speckle so large areas don't read as flat colour.
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < c.width * c.height * 0.02; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)'
    g.fillRect(rnd() * c.width, rnd() * c.height, 1 + rnd() * 2, 1 + rnd() * 2)
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

// ── Signs: blade signs with made-up glyphs, lit from inside ────────────────

function signTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 192
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, 64, 192)
  g.fillStyle = 'rgba(20,16,12,0.85)'
  let seed = 5
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  // Four stacked characters, each a few strokes in a cell.
  for (let ch = 0; ch < 4; ch++) {
    const cy = 14 + ch * 44
    for (let s = 0; s < 4 + ((rnd() * 3) | 0); s++) {
      const x = 14 + rnd() * 30, y = cy + rnd() * 30
      if (rnd() > 0.45) g.fillRect(x - 8, y, 16 + rnd() * 12, 4)
      else g.fillRect(x, y - 6, 4, 14 + rnd() * 14)
    }
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

function radial(inner: string, outer: string): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, inner)
  grad.addColorStop(1, outer)
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new CanvasTexture(c)
}

export const blobTexture = () => radial('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)')

const tmp = new Object3D()
function inst(geo: BufferGeometry, mat: Material, n: number): InstancedMesh {
  const m = new InstancedMesh(geo, mat, Math.max(1, n))
  m.count = n
  return m
}

/** Bounding rectangles of connected groups of one tile kind. */
function blocks(map: DistrictMap, kind: number): [number, number, number, number][] {
  const seen = new Uint8Array(map.width * map.height)
  const out: [number, number, number, number][] = []
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (seen[y * map.width + x] || map.tile(x, y) !== kind) continue
      let x0 = x, x1 = x, y0 = y, y1 = y
      const stack: [number, number][] = [[x, y]]
      seen[y * map.width + x] = 1
      while (stack.length) {
        const [cx, cy] = stack.pop()!
        x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx, ny = cy + dy
          if (!map.inBounds(nx, ny) || seen[ny * map.width + nx] || map.tile(nx, ny) !== kind) continue
          seen[ny * map.width + nx] = 1
          stack.push([nx, ny])
        }
      }
      out.push([x0, y0, x1, y1])
    }
  return out
}

export interface Street {
  group: Group
  /** `wet` is 0 dry to 1 soaked: reflections on the ground. */
  update(focusX: number, focusZ: number, night: number, wet: number): void
}

export function buildStreet(map: DistrictMap): Street {
  const group = new Group()
  const color = new Color()

  // Ground: one painted plane over the district, plain asphalt beyond it.
  const outer = new Mesh(new PlaneGeometry(400, 400).rotateX(-Math.PI / 2), hazed(new MeshStandardMaterial({ color: 0x2b2c2d, roughness: 0.9 })))
  outer.position.set(map.width / 2, -0.01, map.height / 2)
  outer.receiveShadow = true
  const groundMat = hazed(new MeshStandardMaterial({ map: paintGround(map), roughness: 0.85 }), 'ground')
  const ground = new Mesh(new PlaneGeometry(map.width, map.height).rotateX(-Math.PI / 2), groundMat)
  ground.position.set(map.width / 2 - 0.5, 0, map.height / 2 - 0.5)
  ground.receiveShadow = true
  group.add(outer, ground)

  // Buildings: each block split into lots; each lot a podium and a tower.
  // Everything static is merged per 16-tile chunk: one draw for the concrete,
  // one for the roof kit, and the chunks still cull off-screen.
  const facadeMat = facade()
  const roofMat = hazed(new MeshStandardMaterial({ color: 0x9c998f, roughness: 0.8 }), 'roofkit')
  const concrete = CONCRETE.map((hex) => new Color().setHex(hex))
  const chunks = new Map<string, { walls: Merger; roof: Merger }>()
  const chunk = (x: number, z: number) => {
    const k = `${Math.floor(x / 16)}:${Math.floor(z / 16)}`
    let c = chunks.get(k)
    if (!c) chunks.set(k, (c = { walls: new Merger(), roof: new Merger() }))
    return c
  }
  const wall = (geo: BufferGeometry, tint: Color, x: number, z: number, y = 0) => {
    chunk(x, z).walls.add(geo, x, y, z, 0, tint)
    geo.dispose()
  }
  const kit = (geo: BufferGeometry, x: number, z: number, y: number) => {
    chunk(x, z).roof.add(geo, x, y, z)
    geo.dispose()
  }
  const heightAt = (x: number, y: number) => map.heights[y * map.width + x] ?? 1
  for (const [bx0, by0, bx1, by1] of blocks(map, Tile.Building)) {
    const long = bx1 - bx0 >= by1 - by0
    const len = long ? bx1 - bx0 + 1 : by1 - by0 + 1
    let start = 0
    while (start < len) {
      const h = hashString(`lot:${bx0}:${by0}:${start}`) >>> 0
      const size = Math.min(len - start, 3 + (h % 4))
      const [lx0, lx1, ly0, ly1] = long ? [bx0 + start, bx0 + start + size - 1, by0, by1] : [bx0, bx1, by0 + start, by0 + start + size - 1]
      start += size
      const w = lx1 - lx0 + 1, d = ly1 - ly0 + 1
      const cx = (lx0 + lx1) / 2, cz = (ly0 + ly1) / 2
      let hSum = 0
      for (let y = ly0; y <= ly1; y++) for (let x = lx0; x <= lx1; x++) hSum += heightAt(x, y)
      const storeys = Math.max(2, Math.round((hSum / (w * d)) * 1.5 + ((h >>> 3) % 3)))
      const tint = concrete[(h >>> 5) % concrete.length]!
      const corner = [0.08, 0.25, 0.5][(h >>> 7) % 3]!
      const podium = Math.min(storeys, 2) * STOREY
      wall(slab(w - 0.06, d - 0.06, podium, corner * 0.5, 0.03), tint, cx, cz)
      if (storeys > 2 && w > 1.5 && d > 1.5) {
        const inset = 0.3 + ((h >>> 9) % 3) * 0.12
        const tw = Math.max(1, w - inset * 2), td = Math.max(1, d - inset * 2)
        const top = storeys * STOREY
        wall(slab(tw, td, top - podium, corner, 0.04, 10), tint, cx, cz, podium)
        // A setback crown on the tallest.
        const crown = storeys > 7
        if (crown) wall(slab(tw * 0.6, td * 0.6, 1.4 * STOREY, corner, 0.04, 10), tint, cx, cz, top)
        // Roof kit: a plant box and sometimes a water tank.
        const roofY = top + (crown ? 1.4 * STOREY : 0)
        const kw = crown ? tw * 0.6 : tw, kd = crown ? td * 0.6 : td
        kit(roundedBox(0.35, 0.22, 0.25, 0.03), cx - kw * 0.2, cz + kd * 0.15, roofY + 0.11)
        if ((h >>> 11) % 2) kit(new CylinderGeometry(0.16, 0.16, 0.34, 16), cx + kw * 0.2, cz - kd * 0.15, roofY + 0.17)
      }
    }
  }

  // The capsule hotel as a Nakagin-style tower: two concrete cores with
  // white pods hung off them, each with a round window.
  const podMat = hazed(new MeshStandardMaterial({ color: 0xe4e0d6, roughness: 0.45 }), 'pod')
  const portMat = hazed(new MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.2, metalness: 0.4 }), 'port')
  const podAt: [number, number, number, number][] = [] // x, y, z, quarter turns
  const portAt: [number, number, number, number][] = []
  for (const [bx0, by0, bx1, by1] of blocks(map, Tile.Capsule)) {
    const cx = (bx0 + bx1) / 2, cz = (by0 + by1) / 2
    const floors = 8
    const cores = [cx - 1.2, cx + 1.2]
    for (const x of cores) wall(slab(0.9, 0.9, floors * 0.62 + 0.8, 0.12, 0.03), concrete[3]!, x, cz)
    let n = 0
    for (let f = 0; f < floors; f++)
      for (const x of cores)
        for (const [ox, oz, ry] of [[0, 0.72, 0], [0.72, 0, 1], [-0.72, 0, 1], [0, -0.72, 0]] as const) {
          if ((hashString(`pod:${x}:${f}:${ox}:${oz}`) >>> 0) % 5 === 0) continue
          const px = x + ox, pz = cz + oz, py = 0.5 + f * 0.62 + (n++ % 2) * 0.04
          podAt.push([px, py, pz, ry])
          portAt.push([px + ox * 0.51, py + 0.02, pz + oz * 0.51, ry])
        }
  }
  const pods = inst(roundedBox(0.72, 0.56, 0.56, 0.09), podMat, podAt.length)
  const ports = inst(new CylinderGeometry(0.15, 0.15, 0.03, 20).rotateX(Math.PI / 2), portMat, portAt.length)
  for (const [m, at] of [[pods, podAt], [ports, portAt]] as const)
    at.forEach(([x, y, z, ry], i) => {
      tmp.position.set(x, y, z)
      tmp.rotation.set(0, (ry * Math.PI) / 2, 0)
      tmp.updateMatrix()
      m.setMatrixAt(i, tmp.matrix)
    })
  tmp.rotation.set(0, 0, 0)
  pods.castShadow = pods.receiveShadow = true
  ports.receiveShadow = true
  group.add(pods, ports)
  for (const { walls, roof } of chunks.values()) {
    const w = new Mesh(walls.build(), facadeMat)
    w.castShadow = w.receiveShadow = true
    group.add(w)
    if (roof.empty) continue
    const r = new Mesh(roof.build(), roofMat)
    r.castShadow = r.receiveShadow = true
    group.add(r)
  }

  // Blade signs sticking out from the facade.
  const neon = map.props.filter((p) => p.kind === PropKind.Neon)
  const signMat = hazed(new MeshBasicMaterial({ map: signTexture() }), 'sign')
  const glowMat = new MeshBasicMaterial({ map: radial('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), transparent: true, blending: AdditiveBlending, depthWrite: false })
  const signs = inst(roundedBox(0.07, 1.1, 0.32, 0.025), signMat, neon.length)
  const glows = inst(new PlaneGeometry(1.4, 2.2), glowMat, neon.length)
  const faces = [[0, 0.5], [-0.5, 0], [0, -0.5], [0.5, 0]] as const
  neon.forEach((p: Prop, i) => {
    const [ox, oz] = faces[p.rot]!
    tmp.position.set(p.x + ox * 0.62, Math.min(p.z * STOREY * 1.5, 3 * STOREY) + 1.0, p.y + oz * 0.62)
    tmp.rotation.set(0, p.rot % 2 === 1 ? Math.PI / 2 : 0, 0)
    tmp.updateMatrix()
    signs.setMatrixAt(i, tmp.matrix)
    tmp.rotation.set(-Math.PI / 6, Math.PI / 4, 0, 'YXZ')
    tmp.updateMatrix()
    glows.setMatrixAt(i, tmp.matrix)
    tmp.rotation.set(0, 0, 0, 'XYZ')
    const r = (hashString(`sign:${p.x}:${p.y}`) >>> 0) % 100
    const hex = r < 6 ? SIGN_LOUD[r % 2]! : SIGN_WARM[p.hue % SIGN_WARM.length]!
    signs.setColorAt(i, color.setHex(hex))
    glows.setColorAt(i, color.setHex(hex))
  })
  group.add(signs, glows)
  const reflect: [number, number, number, number, number][] = [] // x, z, height, colour, width
  neon.forEach((p) => {
    const [ox, oz] = faces[p.rot]!
    const r = (hashString(`sign:${p.x}:${p.y}`) >>> 0) % 100
    const hex = r < 6 ? SIGN_LOUD[r % 2]! : SIGN_WARM[p.hue % SIGN_WARM.length]!
    reflect.push([p.x + ox * 0.62, p.y + oz * 0.62, Math.min(p.z * STOREY * 1.5, 3 * STOREY) + 1.0, hex, 0.3])
  })

  // Sodium lamps with a pool of light on the ground.
  const lamps = map.props.filter((p) => p.kind === PropKind.Lamp)
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (map.tile(x, y) === Tile.Pavement && (x * 7 + y * 13) % 11 === 0 && map.walkable(x, y))
        lamps.push({ x, y, kind: PropKind.Lamp, rot: 0, hue: 0, z: 0 })
  const posts = inst(new CylinderGeometry(0.022, 0.032, 2.4, 10).translate(0, 1.2, 0), hazed(new MeshStandardMaterial({ color: 0x3b3a38, roughness: 0.5, metalness: 0.3 }), 'post'), lamps.length)
  const heads = inst(roundedBox(0.36, 0.05, 0.13, 0.02), hazed(new MeshBasicMaterial({ color: 0xffb35c }), 'lamphead'), lamps.length)
  const poolMat = new MeshBasicMaterial({ map: radial('rgba(255,170,80,0.5)', 'rgba(255,170,80,0)'), transparent: true, depthWrite: false, blending: AdditiveBlending })
  const pools = inst(new PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2), poolMat, lamps.length)
  lamps.forEach((p, i) => {
    tmp.position.set(p.x + 0.35, 0, p.y + 0.35)
    tmp.updateMatrix()
    posts.setMatrixAt(i, tmp.matrix)
    tmp.position.set(p.x + 0.25, 2.4, p.y + 0.35)
    tmp.updateMatrix()
    heads.setMatrixAt(i, tmp.matrix)
    tmp.position.set(p.x + 0.25, 0.01, p.y + 0.35)
    tmp.updateMatrix()
    pools.setMatrixAt(i, tmp.matrix)
  })
  posts.castShadow = true
  group.add(posts, heads, pools)
  for (const p of lamps) reflect.push([p.x + 0.25, p.y + 0.35, 2.4, 0xffb35c, 0.34])

  // Vending machines, the one bright cheap thing on every corner.
  const vend = map.props.filter((p) => p.kind === PropKind.Vending)
  const bodies = inst(roundedBox(0.6, 1.3, 0.5, 0.05).translate(0, 0.65, 0), hazed(new MeshStandardMaterial({ color: 0xc9c4b8, roughness: 0.4 }), 'vend'), vend.length)
  const panels = inst(roundedBox(0.46, 0.8, 0.02, 0.008).translate(0, 0.8, 0.255), hazed(new MeshBasicMaterial({ color: 0xe8e4d8 }), 'panel'), vend.length)
  vend.forEach((p, i) => {
    tmp.position.set(p.x, 0, p.y)
    tmp.rotation.set(0, (p.rot * Math.PI) / 2, 0)
    tmp.updateMatrix()
    bodies.setMatrixAt(i, tmp.matrix)
    panels.setMatrixAt(i, tmp.matrix)
  })
  tmp.rotation.set(0, 0, 0)
  bodies.castShadow = true
  group.add(bodies, panels)
  for (const p of vend) reflect.push([p.x, p.y, 0.8, 0xe8e4d8, 0.4])

  // Plaza trees: dark trunks, soft round crowns.
  const trees = map.props.filter((p) => p.kind === PropKind.Bonsai)
  const trunks = inst(new CylinderGeometry(0.035, 0.06, 1.0, 8).translate(0, 0.5, 0), hazed(new MeshStandardMaterial({ color: 0x5a4a3c }), 'trunk'), trees.length)
  const crowns = inst(new IcosahedronGeometry(0.42, 2).scale(1, 0.8, 1).translate(0, 1.15, 0), hazed(new MeshStandardMaterial({ color: 0x5d6b47, roughness: 1 }), 'crown'), trees.length)
  trees.forEach((p, i) => {
    tmp.position.set(p.x, 0, p.y)
    tmp.scale.setScalar(0.85 + ((hashString(`t${p.x}:${p.y}`) >>> 0) % 30) / 100)
    tmp.updateMatrix()
    trunks.setMatrixAt(i, tmp.matrix)
    crowns.setMatrixAt(i, tmp.matrix)
  })
  tmp.scale.setScalar(1)
  trunks.castShadow = crowns.castShadow = true
  group.add(trunks, crowns)

  // Wet ground: every light smears a streak across the ground towards the
  // viewer, as it would on wet asphalt.
  const streakTex = (() => {
    const c = document.createElement('canvas')
    c.width = 32
    c.height = 128
    const g = c.getContext('2d')!
    const v = g.createLinearGradient(0, 0, 0, 128)
    v.addColorStop(0, 'rgba(255,255,255,0.0)')
    v.addColorStop(0.08, 'rgba(255,255,255,0.9)')
    v.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = v
    g.fillRect(0, 0, 32, 128)
    const hmask = g.createLinearGradient(0, 0, 32, 0)
    hmask.addColorStop(0, 'rgba(0,0,0,1)')
    hmask.addColorStop(0.5, 'rgba(0,0,0,0)')
    hmask.addColorStop(1, 'rgba(0,0,0,1)')
    g.globalCompositeOperation = 'destination-out'
    g.fillStyle = hmask
    g.fillRect(0, 0, 32, 128)
    return new CanvasTexture(c)
  })()
  const streakMat = new MeshBasicMaterial({ map: streakTex, transparent: true, depthWrite: false, blending: AdditiveBlending })
  const streaks = inst(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), streakMat, reflect.length)
  reflect.forEach(([x, z, h, hex, w], i) => {
    const len = h * 0.9
    tmp.position.set(x + len * 0.3536, 0.015, z + len * 0.3536)
    tmp.rotation.set(0, Math.PI / 4, 0)
    tmp.scale.set(w, 1, len)
    tmp.updateMatrix()
    streaks.setMatrixAt(i, tmp.matrix)
    streaks.setColorAt(i, color.setHex(hex))
  })
  tmp.rotation.set(0, 0, 0)
  tmp.scale.set(1, 1, 1)
  streaks.renderOrder = 2
  group.add(streaks)

  // Overhead wires strung across the streets between facing buildings.
  const pts: number[] = []
  const isB = (x: number, y: number) => map.inBounds(x, y) && (map.tile(x, y) === Tile.Building || map.tile(x, y) === Tile.Capsule)
  const road = (x: number, y: number) => map.inBounds(x, y) && map.tile(x, y) === Tile.Road
  const catenary = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number) => {
    const n = 14
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n
      for (const t of [t0, t1]) pts.push(ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(t * Math.PI) * sag, az + (bz - az) * t)
    }
  }
  for (let y = 2; y < map.height - 3; y++)
    for (let x = 1; x < map.width - 1; x++) {
      if (!(road(x, y) && road(x, y + 1) && !road(x, y - 1))) continue
      if (!isB(x, y - 2) || !isB(x, y + 3)) continue
      if ((hashString(`wire:${x}:${y}`) >>> 0) % 9 !== 0) continue
      const wires = 2 + ((hashString(`w${x}${y}`) >>> 0) % 3)
      for (let k = 0; k < wires; k++) {
        const h0 = 2.6 + ((x * 13 + k * 7) % 10) * 0.16, h1 = 2.6 + ((x * 7 + k * 11) % 10) * 0.16
        catenary(x - 0.3 + k * 0.08, h0, y - 1.5, x + 0.2 + k * 0.12, h1, y + 2.5, 0.3 + k * 0.06)
      }
    }
  for (let x = 2; x < map.width - 3; x++)
    for (let y = 1; y < map.height - 1; y++) {
      if (!(road(x, y) && road(x + 1, y) && !road(x - 1, y))) continue
      if (!isB(x - 2, y) || !isB(x + 3, y)) continue
      if ((hashString(`wire:${x}:${y}:v`) >>> 0) % 9 !== 0) continue
      const wires = 2 + ((hashString(`v${x}${y}`) >>> 0) % 3)
      for (let k = 0; k < wires; k++) {
        const h0 = 2.6 + ((y * 13 + k * 7) % 10) * 0.16, h1 = 2.6 + ((y * 7 + k * 11) % 10) * 0.16
        catenary(x - 1.5, h0, y - 0.3 + k * 0.08, x + 2.5, h1, y + 0.2 + k * 0.12, 0.3 + k * 0.06)
      }
    }
  const wireGeo = new BufferGeometry()
  wireGeo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
  group.add(new LineSegments(wireGeo, hazed(new LineBasicMaterial({ color: 0x1c1b1a }), 'wire')))

  // Nothing here moves: skip the per-frame matrix work.
  group.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false })

  return {
    group,
    update(fx, fz, night, wet) {
      focus.value.set(fx, fz)
      // Signs run brighter than white at night so the bloom picks them up.
      signMat.color.setScalar(0.8 + 0.9 * night)
      glowMat.opacity = 0.12 * night
      poolMat.opacity = night
      haze.uNight.value = night
      streakMat.opacity = wet * (0.12 + night * 0.6)
      groundMat.color.setScalar(1 - wet * 0.22)
      groundMat.roughness = 0.85 - wet * 0.4
    },
  }
}
