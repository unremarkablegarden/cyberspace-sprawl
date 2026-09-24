// A character is a small record of choices, built into a mesh on the client.
// The option *names* live here rather than in content/ because each one needs
// geometry code in the client's character builder; adding a hair style is a
// code change. Colours are pure data and live in content/palettes.ts.

export const BUILDS = ['slim', 'medium', 'broad'] as const
export const HEIGHTS = ['short', 'average', 'tall'] as const
export const HAIR_STYLES = ['none', 'crop', 'mohawk', 'long', 'bun', 'spikes'] as const
export const TOPS = ['tee', 'jacket', 'coat', 'hoodie'] as const
export const ACCESSORIES = ['none', 'mirrorshades', 'visor', 'headphones', 'cap'] as const

/** Sizes of the colour palettes in content/palettes.ts; checked by content:check. */
export const PALETTE_SIZES = { skin: 8, hair: 10, cloth: 16, neon: 6 } as const

export interface AvatarSpec {
  build: number
  height: number
  skin: number
  hair: number
  hairColor: number
  top: number
  topColor: number
  legsColor: number
  accessory: number
  /** Neon trim colour on the top. */
  accent: number
}

export const DEFAULT_AVATAR: AvatarSpec = {
  build: 1, height: 1, skin: 3, hair: 1, hairColor: 0, top: 1, topColor: 1, legsColor: 0, accessory: 1, accent: 1,
}

const LIMITS: Record<keyof AvatarSpec, number> = {
  build: BUILDS.length,
  height: HEIGHTS.length,
  skin: PALETTE_SIZES.skin,
  hair: HAIR_STYLES.length,
  hairColor: PALETTE_SIZES.hair,
  top: TOPS.length,
  topColor: PALETTE_SIZES.cloth,
  legsColor: PALETTE_SIZES.cloth,
  accessory: ACCESSORIES.length,
  accent: PALETTE_SIZES.neon,
}

export const AVATAR_FIELDS = Object.keys(LIMITS) as (keyof AvatarSpec)[]

export const avatarLimit = (field: keyof AvatarSpec): number => LIMITS[field]

/**
 * Coerce anything into a valid spec. Unknown fields are dropped and bad
 * values fall back to the default, so a stale or hostile client can never
 * store something the builder can't draw.
 */
export function clampAvatar(input: unknown): AvatarSpec {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const out = { ...DEFAULT_AVATAR }
  for (const k of AVATAR_FIELDS) {
    const v = src[k]
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < LIMITS[k]) out[k] = v
  }
  return out
}

/** A random spec, for newcomers and bots. `rand` returns [0,1). */
export function randomAvatar(rand: () => number): AvatarSpec {
  const out = { ...DEFAULT_AVATAR }
  for (const k of AVATAR_FIELDS) out[k] = Math.floor(rand() * LIMITS[k])
  return out
}
