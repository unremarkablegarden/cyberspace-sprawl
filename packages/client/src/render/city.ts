// Builds the meshes for a generated district: floor tiles, towers, props.
// Tiles are 1×1 world units centred on integer coordinates, with world X = tile
// x and world Z = tile y. Everything of one kind is a single InstancedMesh, so
// a district is a handful of draw calls however big it grows.

import {
  BoxGeometry, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial,
  Object3D, PlaneGeometry, Vector2, type Material,
} from 'three'
import { hashString, PropKind, Tile, type DistrictMap, type Prop } from '@sprawl/shared'
import { NEON, TILE_LOOKS } from '@sprawl/content'

/** World height of one storey. */
export const STOREY = 0.6

export interface City {
  group: Group
  /** Things that move every frame (holograms), and the cutaway around `focus`. */
  animate(time: number, focusX: number, focusZ: number): void
}

// Cutaway: towers standing between the camera and the player drop to stumps,
// so the street is always visible. The camera looks from +X+Z, so "in front
// of the player" means further along (1, 1). Shared by every material that
// needs it through one uniform.
const focus = { value: new Vector2() }
const CUT_GLSL = /* glsl */ `
  uniform vec2 uFocus;
  float cutaway(mat4 inst) {
    vec2 rel = (inst * vec4(0.0, 0.0, 0.0, 1.0)).xz - uFocus;
    float ahead = dot(rel, vec2(0.7071, 0.7071));
    float across = abs(dot(rel, vec2(0.7071, -0.7071)));
    return smoothstep(0.2, 1.2, ahead) * (1.0 - smoothstep(4.0, 6.5, across)) * (1.0 - smoothstep(11.0, 14.0, ahead));
  }`

/** Signs on cut-away towers vanish with them. */
function cutawaySigns(m: MeshBasicMaterial): MeshBasicMaterial {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFocus = focus
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${CUT_GLSL}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed *= step(cutaway(instanceMatrix), 0.5);')
  }
  return m
}

const tmp = new Object3D()

function instanced(geometry: BoxGeometry | PlaneGeometry | CylinderGeometry, material: Material, count: number): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, count))
  mesh.count = count
  return mesh
}

export function buildCity(map: DistrictMap): City {
  const group = new Group()
  const color = new Color()

  // Floor: every non-building tile, with a little per-tile variation so large
  // areas don't read as flat colour.
  const floorTiles: [number, number, number][] = []
  const towers: [number, number, number, number][] = []
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const t = map.tile(x, y)
      const h = map.heights[y * map.width + x]!
      if (t === Tile.Building || t === Tile.Capsule) towers.push([x, y, h, t])
      else floorTiles.push([x, y, t])
    }

  const floorGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  const floor = instanced(floorGeo, new MeshLambertMaterial(), floorTiles.length)
  floorTiles.forEach(([x, y, t], i) => {
    tmp.position.set(x, 0, y)
    tmp.updateMatrix()
    floor.setMatrixAt(i, tmp.matrix)
    const jitter = ((hashString(`${x},${y}`) % 16) - 8) / 255
    color.setHex(TILE_LOOKS[t]!.color)
    color.r += jitter; color.g += jitter; color.b += jitter
    floor.setColorAt(i, color)
  })
  group.add(floor)

  // Towers: one box per tile, lit windows drawn in the shader from world position.
  const towerMat = windowMaterial()
  const towerGeo = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
  const towerMesh = instanced(towerGeo, towerMat, towers.length)
  towers.forEach(([x, y, h, t], i) => {
    tmp.position.set(x, 0, y)
    tmp.scale.set(1, Math.max(0.2, h * STOREY), 1)
    tmp.updateMatrix()
    towerMesh.setMatrixAt(i, tmp.matrix)
    color.setHex(TILE_LOOKS[t]!.side ?? TILE_LOOKS[t]!.color)
    towerMesh.setColorAt(i, color)
  })
  tmp.scale.set(1, 1, 1)
  group.add(towerMesh)

  const holos = buildProps(map.props, group)
  return {
    group,
    animate(time, fx, fz) {
      focus.value.set(fx, fz)
      for (const h of holos) {
        h.rotation.y = time * 0.8 + h.position.x
        h.position.y = 0.9 + Math.sin(time * 2 + h.position.z) * 0.06
      }
    },
  }
}

/** Lambert with procedurally lit windows on the vertical faces. */
function windowMaterial(): MeshLambertMaterial {
  const m = new MeshLambertMaterial()
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFocus = focus
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;\n${CUT_GLSL}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y *= mix(1.0, 0.06, cutaway(instanceMatrix));')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace(
        'vec3 totalEmissiveRadiance = emissive;',
        `vec3 totalEmissiveRadiance = emissive;
        {
          float side = step(0.5, 1.0 - abs(vWNormal.y));
          float along = abs(vWNormal.x) > 0.5 ? vWPos.z : vWPos.x;
          float across = abs(vWNormal.x) > 0.5 ? vWPos.x : vWPos.z;
          vec2 g = vec2(along * 3.0, vWPos.y * 2.2);
          vec2 f = fract(g);
          float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.75);
          float h = fract(sin(dot(floor(g) + floor(across) * 7.13, vec2(12.9898, 78.233))) * 43758.5453);
          float lit = step(0.8, h) * step(0.35, vWPos.y);
          vec3 warm = vec3(1.0, 0.72, 0.38), cold = vec3(0.45, 0.85, 1.0), pink = vec3(1.0, 0.35, 0.75);
          vec3 wc = h > 0.93 ? pink : (h > 0.84 ? cold : warm);
          totalEmissiveRadiance += side * win * lit * wc * 0.75;
          // Faint roof edge glow.
          totalEmissiveRadiance += (1.0 - side) * vec3(0.05, 0.03, 0.09);
        }`,
      )
  }
  return m
}

function buildProps(props: Prop[], group: Group): Object3D[] {
  const byKind = new Map<string, Prop[]>()
  for (const p of props) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p])
  const color = new Color()
  const holos: Object3D[] = []

  // Neon signs hang on the building face at the tile's edge.
  const neon = byKind.get(PropKind.Neon) ?? []
  const signs = instanced(new BoxGeometry(0.7, 0.45, 0.06), cutawaySigns(new MeshBasicMaterial()), neon.length)
  const faceOffset = [[0, 0.46], [-0.46, 0], [0, -0.46], [0.46, 0]] as const
  neon.forEach((p, i) => {
    const [ox, oz] = faceOffset[p.rot]!
    tmp.position.set(p.x + ox, p.z * STOREY + 0.2, p.y + oz)
    tmp.rotation.set(0, (p.rot % 2) * (Math.PI / 2), 0)
    tmp.updateMatrix()
    signs.setMatrixAt(i, tmp.matrix)
    signs.setColorAt(i, color.setHex(NEON[p.hue]!))
  })
  tmp.rotation.set(0, 0, 0)
  group.add(signs)

  // Lamps: a post and a glowing head.
  const lamps = byKind.get(PropKind.Lamp) ?? []
  const posts = instanced(new BoxGeometry(0.06, 1.2, 0.06).translate(0, 0.6, 0), new MeshLambertMaterial({ color: 0x3a3a48 }), lamps.length)
  const heads = instanced(new BoxGeometry(0.2, 0.08, 0.2), new MeshBasicMaterial({ color: 0xffd9a0 }), lamps.length)
  lamps.forEach((p, i) => {
    tmp.position.set(p.x + 0.35, 0, p.y + 0.35)
    tmp.updateMatrix()
    posts.setMatrixAt(i, tmp.matrix)
    tmp.position.y = 1.22
    tmp.updateMatrix()
    heads.setMatrixAt(i, tmp.matrix)
  })
  group.add(posts, heads)

  // Vending machines: a box with a lit front panel.
  const vend = byKind.get(PropKind.Vending) ?? []
  const bodies = instanced(new BoxGeometry(0.6, 0.95, 0.5).translate(0, 0.475, 0), new MeshLambertMaterial({ color: 0xcfd4e0 }), vend.length)
  const panels = instanced(new BoxGeometry(0.46, 0.6, 0.02).translate(0, 0.55, 0.26), new MeshBasicMaterial(), vend.length)
  vend.forEach((p, i) => {
    tmp.position.set(p.x, 0, p.y)
    tmp.rotation.set(0, (p.rot * Math.PI) / 2, 0)
    tmp.updateMatrix()
    bodies.setMatrixAt(i, tmp.matrix)
    panels.setMatrixAt(i, tmp.matrix)
    panels.setColorAt(i, color.setHex(NEON[p.hue]!))
  })
  tmp.rotation.set(0, 0, 0)
  group.add(bodies, panels)

  // Vat-grown bonsai in plazas.
  const trees = byKind.get(PropKind.Bonsai) ?? []
  const trunks = instanced(new CylinderGeometry(0.05, 0.08, 0.5, 5).translate(0, 0.25, 0), new MeshLambertMaterial({ color: 0x4a3526 }), trees.length)
  const crowns = instanced(new BoxGeometry(0.55, 0.35, 0.55).translate(0, 0.62, 0), new MeshLambertMaterial({ color: 0x2f7d5a }), trees.length)
  trees.forEach((p, i) => {
    tmp.position.set(p.x, 0, p.y)
    tmp.updateMatrix()
    trunks.setMatrixAt(i, tmp.matrix)
    crowns.setMatrixAt(i, tmp.matrix)
  })
  group.add(trunks, crowns)

  // Holograms: slowly turning translucent shapes on a plinth.
  for (const p of byKind.get(PropKind.Holo) ?? []) {
    const plinth = new InstancedMesh(new BoxGeometry(0.5, 0.2, 0.5).translate(0, 0.1, 0), new MeshLambertMaterial({ color: 0x2a2a38 }), 1)
    tmp.position.set(p.x, 0, p.y)
    tmp.updateMatrix()
    plinth.setMatrixAt(0, tmp.matrix)
    const holo = new InstancedMesh(
      new BoxGeometry(0.35, 0.35, 0.35),
      new MeshBasicMaterial({ color: NEON[p.hue]!, transparent: true, opacity: 0.55, wireframe: true }),
      1,
    )
    holo.setMatrixAt(0, new Matrix4())
    holo.position.set(p.x, 0.9, p.y)
    group.add(plinth, holo)
    holos.push(holo)
  }

  return holos
}
