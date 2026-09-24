// Look lab: the generated district rebuilt as concrete megablocks in haze.
// Same map as the live game; only the dressing differs.

import {
  AdditiveBlending, BoxGeometry, CanvasTexture, Color, CylinderGeometry, Group, InstancedMesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, PlaneGeometry, Vector2, type BufferGeometry, type Material,
} from 'three'
import { hashString, PropKind, Tile, type DistrictMap } from '@sprawl/shared'
import { hazed, haze } from './haze.ts'

/** World height of one storey. People are about 1.0 tall. */
export const STOREY = 1.05

const CONCRETE = [0x8a8780, 0x7c7a74, 0x6f6d68, 0x959088, 0x6a6660]
// Signs: mostly the warm Chiba set, with the odd paid-for cyan or magenta.
const SIGN_WARM = [0xf09a3a, 0xe6dcc0, 0xa8352c, 0x8fc58a, 0xd9b45a, 0xb85a2c]
const SIGN_LOUD = [0x4fd6e0, 0xe04f9a]

const focus = { value: new Vector2() }
const CUT = /* glsl */ `
  uniform vec2 uFocus;
  float cutaway(mat4 inst) {
    vec2 rel = (inst * vec4(0.0, 0.0, 0.0, 1.0)).xz - uFocus;
    float ahead = dot(rel, vec2(0.7071, 0.7071));
    float across = abs(dot(rel, vec2(0.7071, -0.7071)));
    return smoothstep(0.2, 1.2, ahead) * (1.0 - smoothstep(7.0, 10.0, across)) * (1.0 - smoothstep(30.0, 34.0, ahead));
  }`

const tmp = new Object3D()
function inst(geo: BufferGeometry, mat: Material, n: number): InstancedMesh {
  const m = new InstancedMesh(geo, mat, Math.max(1, n))
  m.count = n
  return m
}

/** Brutalist tower material: slab bands, rain streaks, small windows lit at night. */
function concrete(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ roughness: 0.93, metalness: 0 })
  return hazed(m, 'tower', (shader) => {
    shader.uniforms.uFocus = focus
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vTW;\nvarying vec3 vTN;\n${CUT}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y *= mix(1.0, 0.05, cutaway(instanceMatrix));')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vTW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vTN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW;\nvarying vec3 vTN;\nuniform float uNight;')
      .replace(
        'vec3 totalEmissiveRadiance = emissive;',
        `vec3 totalEmissiveRadiance = emissive;
        float side = step(0.5, 1.0 - abs(vTN.y));
        float along = abs(vTN.x) > 0.5 ? vTW.z : vTW.x;
        float across = abs(vTN.x) > 0.5 ? vTW.x : vTW.z;
        // Rain streaks run down from each slab edge.
        float streak = fract(sin(floor(along * 9.0) * 91.7 + floor(across) * 3.1) * 4375.5);
        float slab = fract(vTW.y / ${STOREY.toFixed(2)});
        diffuseColor.rgb *= side > 0.5 ? mix(1.0, 0.82, streak * smoothstep(0.0, 0.7, 1.0 - slab)) : 0.9;
        // A darker cast band at every floor slab.
        diffuseColor.rgb *= side > 0.5 ? 1.0 - 0.18 * step(0.9, slab) : 1.0;
        // Small deep-set windows: dark glass by day.
        vec2 g = vec2(along * 2.0, vTW.y / ${STOREY.toFixed(2)});
        vec2 f = fract(g);
        // Many faces are blank concrete; windows come in patches.
        float patchy = step(0.45, fract(sin(dot(floor(vec2(along, vTW.y) / vec2(3.0, 4.0 * ${STOREY.toFixed(2)})) + floor(across) * 3.7, vec2(41.3, 17.9))) * 9631.7));
        float win = patchy * side * step(0.3, f.x) * step(f.x, 0.7) * step(0.35, f.y) * step(f.y, 0.7) * step(0.8, vTW.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.14, 0.15), win * 0.85);
        float wh = fract(sin(dot(floor(g) + floor(across) * 7.13, vec2(12.9898, 78.233))) * 43758.5453);
        {
          vec3 warm = vec3(1.0, 0.72, 0.42), tube = vec3(0.82, 0.9, 0.8);
          float lit = step(0.72, wh);
          totalEmissiveRadiance += win * lit * (wh > 0.95 ? tube : warm) * 0.9 * uNight;
        }`,
      )
  })
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

export interface Street {
  group: Group
  update(focusX: number, focusZ: number, night: number): void
}

export function buildStreet(map: DistrictMap): Street {
  const group = new Group()
  const color = new Color()

  // Ground beyond the district, so the city fades into haze rather than stopping.
  const ground = new InstancedMesh(new PlaneGeometry(400, 400).rotateX(-Math.PI / 2), hazed(new MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 })), 1)
  tmp.position.set(map.width / 2, -0.01, map.height / 2)
  tmp.updateMatrix()
  ground.setMatrixAt(0, tmp.matrix)
  ground.receiveShadow = true
  group.add(ground)

  const floors: [number, number, number][] = []
  const towers: [number, number, number, number][] = []
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const t = map.tile(x, y)
      const h = map.heights[y * map.width + x]!
      if (t === Tile.Building || t === Tile.Capsule) towers.push([x, y, h, t])
      else floors.push([x, y, t])
    }

  // Floors: asphalt roads, raised concrete pavement with a kerb.
  const floorMat = hazed(new MeshStandardMaterial({ roughness: 0.8 }))
  const floorMesh = inst(new BoxGeometry(1, 1, 1).translate(0, -0.5, 0), floorMat, floors.length)
  floors.forEach(([x, y, t], i) => {
    const raised = t === Tile.Pavement || t === Tile.Plaza || t === Tile.Door
    tmp.position.set(x, raised ? 0.08 : 0, y)
    tmp.updateMatrix()
    floorMesh.setMatrixAt(i, tmp.matrix)
    const j = ((hashString(`${x},${y}`) % 12) - 6) / 255
    const base = t === Tile.Road ? 0x2e2f30 : t === Tile.Plaza ? 0x6e6d66 : t === Tile.Door ? 0xa0916e : 0x7a7872
    color.setHex(base)
    color.r += j; color.g += j; color.b += j
    floorMesh.setColorAt(i, color)
  })
  floorMesh.receiveShadow = true
  group.add(floorMesh)

  // Towers, taller than the pixel version: megablocks, not shops.
  const towerMesh = inst(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), concrete(), towers.length)
  towers.forEach(([x, y, h, t], i) => {
    tmp.position.set(x, 0, y)
    const storeys = t === Tile.Capsule ? 5 : Math.round(h * 1.5)
    tmp.scale.set(1, Math.max(1, storeys) * STOREY, 1)
    tmp.updateMatrix()
    towerMesh.setMatrixAt(i, tmp.matrix)
    const lot = hashString(`lot:${Math.floor(x / 3)}:${Math.floor(y / 3)}`)
    color.setHex(t === Tile.Capsule ? 0xd8d4ca : CONCRETE[lot % CONCRETE.length]!)
    towerMesh.setColorAt(i, color)
  })
  tmp.scale.set(1, 1, 1)
  towerMesh.castShadow = true
  towerMesh.receiveShadow = true
  group.add(towerMesh)

  // Blade signs sticking out from the facade, Tokyo-style.
  const neon = map.props.filter((p) => p.kind === PropKind.Neon)
  const signMat = hazed(new MeshBasicMaterial(), 'sign')
  const glowMat = new MeshBasicMaterial({ map: radial('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.2 })
  const signs = inst(new BoxGeometry(0.08, 1.1, 0.34), signMat, neon.length)
  const glows = inst(new PlaneGeometry(1.6, 2.4), glowMat, neon.length)
  const faces = [[0, 0.5], [-0.5, 0], [0, -0.5], [0.5, 0]] as const
  neon.forEach((p, i) => {
    const [ox, oz] = faces[p.rot]!
    const alongX = p.rot % 2 === 1
    tmp.position.set(p.x + ox * 0.66, p.z * STOREY * 1.5 + 0.9, p.y + oz * 0.66)
    tmp.rotation.set(0, alongX ? Math.PI / 2 : 0, 0)
    tmp.updateMatrix()
    signs.setMatrixAt(i, tmp.matrix)
    tmp.rotation.set(-Math.PI / 6, Math.PI / 4, 0, 'YXZ')
    tmp.updateMatrix()
    glows.setMatrixAt(i, tmp.matrix)
    tmp.rotation.set(0, 0, 0, 'XYZ')
    const r = hashString(`sign:${p.x}:${p.y}`) % 100
    const hex = r < 6 ? SIGN_LOUD[r % 2]! : SIGN_WARM[p.hue % SIGN_WARM.length]!
    signs.setColorAt(i, color.setHex(hex))
    glows.setColorAt(i, color.setHex(hex))
  })
  tmp.rotation.set(0, 0, 0)
  group.add(signs, glows)

  // Sodium lamps with a pool of light on the ground.
  const lamps = map.props.filter((p) => p.kind === PropKind.Lamp)
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (map.tile(x, y) === Tile.Pavement && (x * 7 + y * 13) % 11 === 0 && map.walkable(x, y))
        lamps.push({ x, y, kind: PropKind.Lamp, rot: 0, hue: 0, z: 0 })
  const posts = inst(new CylinderGeometry(0.025, 0.035, 2.4, 6).translate(0, 1.2, 0), hazed(new MeshStandardMaterial({ color: 0x3b3a38, roughness: 0.6 })), lamps.length)
  const heads = inst(new BoxGeometry(0.35, 0.06, 0.14), hazed(new MeshBasicMaterial({ color: 0xffb35c }), 'lamphead'), lamps.length)
  const poolMat = new MeshBasicMaterial({ map: radial('rgba(255,170,80,0.55)', 'rgba(255,170,80,0)'), transparent: true, depthWrite: false, blending: AdditiveBlending })
  const pools = inst(new PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2), poolMat, lamps.length)
  lamps.forEach((p, i) => {
    tmp.position.set(p.x + 0.35, 0.08, p.y + 0.35)
    tmp.updateMatrix()
    posts.setMatrixAt(i, tmp.matrix)
    tmp.position.set(p.x + 0.25, 2.4, p.y + 0.35)
    tmp.updateMatrix()
    heads.setMatrixAt(i, tmp.matrix)
    tmp.position.set(p.x + 0.25, 0.1, p.y + 0.35)
    tmp.updateMatrix()
    pools.setMatrixAt(i, tmp.matrix)
  })
  posts.castShadow = true
  group.add(posts, heads, pools)

  // Vending machines, the one bright cheap thing on every corner.
  const vend = map.props.filter((p) => p.kind === PropKind.Vending)
  const bodies = inst(new BoxGeometry(0.6, 1.3, 0.5).translate(0, 0.73, 0), hazed(new MeshStandardMaterial({ color: 0xc9c4b8, roughness: 0.5 })), vend.length)
  const panels = inst(new BoxGeometry(0.46, 0.8, 0.02).translate(0, 0.85, 0.26), hazed(new MeshBasicMaterial(), 'panel'), vend.length)
  vend.forEach((p, i) => {
    tmp.position.set(p.x, 0.08, p.y)
    tmp.rotation.set(0, (p.rot * Math.PI) / 2, 0)
    tmp.updateMatrix()
    bodies.setMatrixAt(i, tmp.matrix)
    panels.setMatrixAt(i, tmp.matrix)
    panels.setColorAt(i, color.setHex(0xe8e4d8))
  })
  tmp.rotation.set(0, 0, 0)
  bodies.castShadow = true
  group.add(bodies, panels)

  // Plaza trees, pale and pruned.
  const trees = map.props.filter((p) => p.kind === PropKind.Bonsai)
  const trunks = inst(new CylinderGeometry(0.04, 0.07, 0.9, 6).translate(0, 0.45, 0), hazed(new MeshStandardMaterial({ color: 0x3e3129 })), trees.length)
  const crowns = inst(new BoxGeometry(0.7, 0.35, 0.7).translate(0, 1.0, 0), hazed(new MeshStandardMaterial({ color: 0x55603f, roughness: 1 })), trees.length)
  trees.forEach((p, i) => {
    tmp.position.set(p.x, 0.08, p.y)
    tmp.updateMatrix()
    trunks.setMatrixAt(i, tmp.matrix)
    crowns.setMatrixAt(i, tmp.matrix)
  })
  trunks.castShadow = crowns.castShadow = true
  group.add(trunks, crowns)

  return {
    group,
    update(fx, fz, night) {
      focus.value.set(fx, fz)
      signMat.color.setScalar(0.55 + 0.45 * night)
      glowMat.opacity = 0.45 * night
      poolMat.opacity = night
      haze.uNight.value = night
    },
  }
}
