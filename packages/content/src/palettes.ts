// Colour palettes, 0xRRGGBB. Lengths must match PALETTE_SIZES in
// @sprawl/shared/avatar.ts; `bun run content:check` enforces it. Add colours
// by replacing, not appending, unless you also bump PALETTE_SIZES.

export const SKIN = [0xf6d7c3, 0xeac0a0, 0xd9a37e, 0xc0875f, 0xa06a45, 0x7d4e30, 0x5a3622, 0x3d241a]

export const HAIR = [0x141312, 0x3b2a20, 0x7a4b2a, 0xa5552a, 0xc9a06b, 0xe8e0d0, 0x8e8f8c, 0x6e2a2a, 0x3a4636, 0x2c3440]

export const CLOTH = [
  0x161615, 0x2e2f33, 0x4d4f52, 0x8c8a84, 0xe4dccb, 0x5e2424, 0x8f3a2e, 0xb8652f,
  0xc9a24a, 0x4a5236, 0x6b6f45, 0x1f2a36, 0x4a5a68, 0x6b5a45, 0x8a7a5c, 0x3d2c29,
]

/**
 * Signage and trim: sodium, amber, phosphor green, oxblood, cream, rust.
 * No cyan or magenta; see docs/design.md on the look.
 */
export const NEON = [0xf09a3a, 0xd9b45a, 0x8fc58a, 0xa8352c, 0xe6dcc0, 0xb85a2c]
