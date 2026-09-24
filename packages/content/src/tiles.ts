import { Tile } from '@sprawl/shared'
import type { TileLook } from './types.ts'

/** How each tile kind looks. Keyed by the numeric Tile id. */
export const TILE_LOOKS: Record<number, TileLook> = {
  [Tile.Void]: { color: 0x05040a },
  [Tile.Road]: { color: 0x343246 },
  [Tile.Pavement]: { color: 0x646079 },
  [Tile.Building]: { color: 0x3a3560, side: 0x2e2a4c },
  [Tile.Plaza]: { color: 0x3d5652 },
  [Tile.Capsule]: { color: 0x6a4a3a, side: 0x5a3c2e },
  [Tile.Door]: { color: 0xb08a3a },
}
