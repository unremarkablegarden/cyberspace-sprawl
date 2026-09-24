// Every district in the world. A district id is its room name and storage
// key, so once a district is live its id and seed must never change.

import type { DistrictDef } from '../types.ts'
import chibaNinsei from './chiba-ninsei.ts'

export const DISTRICTS: readonly DistrictDef[] = [chibaNinsei]

export const START_DISTRICT = chibaNinsei.id

export const districtById = (id: string): DistrictDef | undefined => DISTRICTS.find((d) => d.id === id)
