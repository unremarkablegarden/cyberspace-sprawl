// Player: one Durable Object per account, holding what belongs to that person.
// Today that is their character and where they last stood; inventory, wallet
// and home will join it. One single-threaded object per player means their
// belongings are never written by two things at once.
//
// Only other rooms talk to it (RPC); clients never connect here directly.

import { DurableObject } from 'cloudflare:workers'
import { clampAvatar, type AvatarSpec } from '@sprawl/shared'
import type { Env } from '../env.ts'
import { migrate } from '../sql.ts'

export interface PlayerProfile {
  avatar: AvatarSpec | null
  /** Last district and tile, restored on the next visit. */
  place: { district: string; x: number; y: number } | null
}

const SCHEMA = [
  // Small key-value table: each key is one aspect of the player, stored as JSON.
  'CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated INTEGER NOT NULL)',
]

export class Player extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    migrate(ctx.storage.sql, SCHEMA)
  }

  #get<T>(k: string): T | null {
    const row = this.ctx.storage.sql.exec<{ v: string }>('SELECT v FROM kv WHERE k = ?', k).toArray()[0]
    return row ? (JSON.parse(row.v) as T) : null
  }

  #put(k: string, v: unknown): void {
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO kv (k, v, updated) VALUES (?, ?, ?)', k, JSON.stringify(v), Date.now())
  }

  getProfile(): PlayerProfile {
    const avatar = this.#get<AvatarSpec>('avatar')
    return { avatar: avatar ? clampAvatar(avatar) : null, place: this.#get('place') }
  }

  /** Stores and returns the clamped spec. Returns only after the write. */
  setAvatar(input: AvatarSpec): AvatarSpec {
    const avatar = clampAvatar(input)
    this.#put('avatar', avatar)
    return avatar
  }

  setPlace(district: string, x: number, y: number): void {
    this.#put('place', { district, x, y })
  }

  /** Everything this player owns, for backups and exports. */
  exportState(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const row of this.ctx.storage.sql.exec<{ k: string; v: string }>('SELECT k, v FROM kv')) out[row.k] = JSON.parse(row.v)
    return out
  }
}
