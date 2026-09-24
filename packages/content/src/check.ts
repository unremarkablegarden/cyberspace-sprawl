// `bun run content:check`: catches content mistakes before they ship.
import { PALETTE_SIZES, Tile, generateDistrict, findPath } from '@sprawl/shared'
import { CLOTH, DISTRICTS, HAIR, NEON, SKIN, TILE_LOOKS } from './index.ts'

const errors: string[] = []
const expect = (ok: boolean, msg: string) => { if (!ok) errors.push(msg) }

expect(SKIN.length === PALETTE_SIZES.skin, `SKIN has ${SKIN.length}, expected ${PALETTE_SIZES.skin}`)
expect(HAIR.length === PALETTE_SIZES.hair, `HAIR has ${HAIR.length}, expected ${PALETTE_SIZES.hair}`)
expect(CLOTH.length === PALETTE_SIZES.cloth, `CLOTH has ${CLOTH.length}, expected ${PALETTE_SIZES.cloth}`)
expect(NEON.length === PALETTE_SIZES.neon, `NEON has ${NEON.length}, expected ${PALETTE_SIZES.neon}`)
for (const id of Object.values(Tile)) expect(TILE_LOOKS[id] !== undefined, `no TILE_LOOKS entry for tile ${id}`)

const ids = new Set<string>()
for (const d of DISTRICTS) {
  expect(/^[a-z0-9-]{3,40}$/.test(d.id), `district id ${d.id} must be lowercase-kebab`)
  expect(!ids.has(d.id), `duplicate district id ${d.id}`)
  ids.add(d.id)
  const map = generateDistrict(d)
  expect(map.walkable(...map.spawn), `${d.id}: spawn is not walkable`)
  // Every walkable tile should be reachable from spawn, or players get stuck.
  let unreachable = 0
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (map.walkable(x, y) && !findPath(map, map.spawn, [x, y], 4096)) unreachable++
  expect(unreachable === 0, `${d.id}: ${unreachable} walkable tiles unreachable from spawn`)
}

if (errors.length) {
  for (const e of errors) console.error(`content: ${e}`)
  process.exit(1)
}
console.log(`content: ok (${DISTRICTS.length} district${DISTRICTS.length === 1 ? '' : 's'})`)
