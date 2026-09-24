import { Tile } from '@sprawl/shared'
import type { TileLook } from './types.ts'

/** How each tile kind looks. Keyed by the numeric Tile id. */
export const TILE_LOOKS: Record<number, TileLook> = {
  [Tile.Void]: { color: 0x0c0c0c },
  [Tile.Road]: { color: 0x2f2f30 },
  [Tile.Pavement]: { color: 0x5f5d58 },
  [Tile.Building]: { color: 0x4d4c4a, side: 0x403f3d },
  [Tile.Plaza]: { color: 0x4a4d40 },
  [Tile.Capsule]: { color: 0x6a5c48, side: 0x5a4e3c },
  [Tile.Door]: { color: 0xb08a3a },
}
