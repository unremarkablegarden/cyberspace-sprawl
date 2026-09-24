// Deterministic district generation. A district's base layout is a pure
// function of (seed, genVersion, size), recomputed on the client and the
// server and never stored. Only what players change is stored, as deltas.
//
// A released genVersion is FROZEN: the world is permanent, so changing what
// an existing version outputs would move buildings under people's homes.
// gen.test.ts pins each version with a golden hash. New ideas go in a new
// version, used by new districts.

import { hashString, pick, randInt, rng, type Rand } from '../rng.ts'
import { WALKABLE, BLOCKING_PROPS, PropKind, Tile, type PropKindId } from './tiles.ts'
import { tileKey, type Walkable, type XY } from '../grid.ts'

export interface DistrictSpec {
  id: string
  seed: string
  genVersion: number
  width: number
  height: number
}

export interface Prop {
  x: number
  y: number
  kind: PropKindId
  /** Facing, in quarter turns. */
  rot: number
  /** Index into the neon palette; meaning depends on kind. */
  hue: number
  /** Height in tiles above ground, for signs. */
  z: number
}

export class DistrictMap implements Walkable {
  readonly tiles: Uint8Array
  readonly heights: Uint8Array
  readonly props: Prop[] = []
  spawn: XY = [0, 0]
  #blocked = new Set<number>()

  constructor(readonly width: number, readonly height: number) {
    this.tiles = new Uint8Array(width * height)
    this.heights = new Uint8Array(width * height)
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height
  }
  tile(x: number, y: number): number {
    return this.inBounds(x, y) ? this.tiles[y * this.width + x]! : Tile.Void
  }
  set(x: number, y: number, t: number, h = 0): void {
    const i = y * this.width + x
    this.tiles[i] = t
    this.heights[i] = h
  }
  walkable(x: number, y: number): boolean {
    return WALKABLE.has(this.tile(x, y)) && !this.#blocked.has(tileKey(x, y))
  }
  addProp(p: Prop): void {
    this.props.push(p)
    if (BLOCKING_PROPS.has(p.kind)) this.#blocked.add(tileKey(p.x, p.y))
  }
  /** A short fingerprint of the whole layout, for golden tests. */
  fingerprint(): string {
    let s = `${this.width}x${this.height}:${this.spawn}:`
    for (let i = 0; i < this.tiles.length; i++) s += String.fromCharCode(65 + this.tiles[i]!, 65 + this.heights[i]!)
    for (const p of this.props) s += `|${p.x},${p.y},${p.kind},${p.rot},${p.hue},${p.z}`
    return hashString(s).toString(16)
  }
}

export function generateDistrict(spec: DistrictSpec): DistrictMap {
  const gen = GENERATORS[spec.genVersion]
  if (!gen) throw new Error(`no generator for genVersion ${spec.genVersion}`)
  return gen(spec)
}

const GENERATORS: Record<number, (s: DistrictSpec) => DistrictMap> = { 1: genV1 }

/**
 * v1: a street grid around one wide main street, blocks of towers in 3×3
 * lots, a capsule hotel beside the spawn point, the odd plaza, and neon.
 */
function genV1(spec: DistrictSpec): DistrictMap {
  const { width: w, height: h } = spec
  const seed = hashString(`${spec.seed}:v1`)
  const r = rng(seed)
  const m = new DistrictMap(w, h)

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m.set(x, y, Tile.Building)

  // Main street across the middle, three tiles wide.
  const mainY = Math.floor(h / 2) - 1
  for (let y = mainY; y < mainY + 3; y++) for (let x = 1; x < w - 1; x++) m.set(x, y, Tile.Road)

  // Cross streets, two wide, at irregular intervals.
  const streets = (len: number, avoid: (v: number) => boolean) => {
    const out: number[] = []
    for (let v = randInt(r, 3, 6); v < len - 4; v += randInt(r, 8, 12)) if (!avoid(v)) out.push(v)
    return out
  }
  for (const x of streets(w, () => false))
    for (let y = 1; y < h - 1; y++) for (let dx = 0; dx < 2; dx++) m.set(x + dx, y, Tile.Road)
  for (const y of streets(h, (v) => Math.abs(v - mainY) < 5))
    for (let x = 1; x < w - 1; x++) for (let dy = 0; dy < 2; dy++) m.set(x, y + dy, Tile.Road)

  // Pavement wherever a building touches a road (8-neighbourhood).
  const isRoad = (x: number, y: number) => m.tile(x, y) === Tile.Road
  const pave: [number, number][] = []
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (m.tile(x, y) !== Tile.Building) continue
      let near = false
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (isRoad(x + dx, y + dy)) near = true
      if (near) pave.push([x, y])
    }
  for (const [x, y] of pave) m.set(x, y, Tile.Pavement)

  // Tower heights by 3×3 lot, taller towards the main street.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (m.tile(x, y) !== Tile.Building) continue
      const lot = hashString(`${seed}:${Math.floor(x / 3)}:${Math.floor(y / 3)}`)
      const nearMain = 1 - Math.min(1, Math.abs(y - mainY) / (h / 2))
      m.set(x, y, Tile.Building, 1 + (lot % 4) + Math.round(nearMain * 4))
    }

  // Spawn in the middle of the main street; the capsule hotel faces it.
  const sx = Math.floor(w / 2)
  m.spawn = [sx, mainY + 1]
  placeCapsuleHotel(m, sx, mainY)

  // Turn some whole blocks into plazas.
  for (const block of findBlocks(m)) {
    if (block.length < 6 || r() > 0.18) continue
    for (const [x, y] of block) m.set(x, y, Tile.Plaza)
    for (const [x, y] of block) {
      const roll = r()
      if (roll < 0.12) m.addProp({ x, y, kind: PropKind.Bonsai, rot: 0, hue: 0, z: 0 })
      else if (roll < 0.16) m.addProp({ x, y, kind: PropKind.Holo, rot: 0, hue: randInt(r, 0, 5), z: 0 })
    }
  }

  dressStreets(m, r)
  return m
}

/** A 6×3 low block north of the main street with a door onto it. */
function placeCapsuleHotel(m: DistrictMap, cx: number, mainY: number): void {
  const top = mainY - 4
  for (let y = top; y < top + 3; y++)
    for (let x = cx - 3; x < cx + 3; x++) if (m.inBounds(x, y)) m.set(x, y, Tile.Capsule, 3)
  m.set(cx, top + 3, Tile.Door)
}

/** Connected groups of Building tiles. */
function findBlocks(m: DistrictMap): [number, number][][] {
  const seen = new Uint8Array(m.width * m.height)
  const blocks: [number, number][][] = []
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++) {
      const i = y * m.width + x
      if (seen[i] || m.tile(x, y) !== Tile.Building) continue
      const block: [number, number][] = []
      const stack: [number, number][] = [[x, y]]
      seen[i] = 1
      while (stack.length) {
        const [cx, cy] = stack.pop()!
        block.push([cx, cy])
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx, ny = cy + dy
          const ni = ny * m.width + nx
          if (!m.inBounds(nx, ny) || seen[ni] || m.tile(nx, ny) !== Tile.Building) continue
          seen[ni] = 1
          stack.push([nx, ny])
        }
      }
      blocks.push(block)
    }
  return blocks
}

/** Neon on building faces, lamps and vending machines on the pavement. */
function dressStreets(m: DistrictMap, r: Rand): void {
  const faces: [number, number, number][] = [[0, -1, 2], [1, 0, 3], [0, 1, 0], [-1, 0, 1]]
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++) {
      if (m.tile(x, y) !== Tile.Pavement) continue
      const [sx, sy] = m.spawn
      if (Math.abs(x - sx) + Math.abs(y - sy) < 3) continue
      for (const [dx, dy, rot] of faces) {
        const t = m.tile(x + dx, y + dy)
        if (t !== Tile.Building) continue
        const bh = m.heights[(y + dy) * m.width + (x + dx)]!
        if (r() < 0.22) m.addProp({ x, y, kind: PropKind.Neon, rot, hue: randInt(r, 0, 5), z: randInt(r, 1, Math.max(1, bh - 1)) })
        break
      }
      const roll = r()
      if (roll < 0.04 && m.walkable(x, y)) m.addProp({ x, y, kind: PropKind.Vending, rot: pick(r, [0, 1, 2, 3]), hue: randInt(r, 0, 5), z: 0 })
      else if (roll < 0.1 && (x + y) % 4 === 0) m.addProp({ x, y, kind: PropKind.Lamp, rot: 0, hue: 0, z: 0 })
    }
}
