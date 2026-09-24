// Tile and prop kinds the generator can place. The numbers are stored in
// generated maps, so they are append-only: never renumber or reuse one.

export const Tile = {
  Void: 0,
  Road: 1,
  Pavement: 2,
  Building: 3,
  Plaza: 4,
  Capsule: 5, // the capsule hotel block, where every newcomer's coffin is
  Door: 6, // a walkable entrance tile in front of a building
} as const
export type TileId = (typeof Tile)[keyof typeof Tile]

export const WALKABLE: ReadonlySet<number> = new Set([Tile.Road, Tile.Pavement, Tile.Plaza, Tile.Door])

export const PropKind = {
  Neon: 'neon', // sign on a building face
  Lamp: 'lamp',
  Vending: 'vending',
  Crate: 'crate',
  Bonsai: 'bonsai', // vat-grown, in plazas
  Holo: 'holo', // advertising hologram in plazas
} as const
export type PropKindId = (typeof PropKind)[keyof typeof PropKind]

/** Props that stop a walker. Everything else is walked through. */
export const BLOCKING_PROPS: ReadonlySet<string> = new Set([PropKind.Vending, PropKind.Crate, PropKind.Bonsai, PropKind.Holo])
