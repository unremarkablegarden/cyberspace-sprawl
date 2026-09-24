import type { DistrictSpec } from '@sprawl/shared'

export interface DistrictDef extends DistrictSpec {
  name: string
  blurb: string
  /** Background and fog colours, 0xRRGGBB. */
  sky: number
  fog: number
}

export interface TileLook {
  /** Top colour, 0xRRGGBB. */
  color: number
  /** Side colour for raised tiles. */
  side?: number
}
