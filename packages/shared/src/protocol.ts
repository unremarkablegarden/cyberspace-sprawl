// The wire protocol between the client and a District room. JSON text frames,
// one message per frame, discriminated by `t`. See docs/protocol.md.

import { clampAvatar, type AvatarSpec } from './avatar.ts'
import type { XY } from './grid.ts'

export const PROTOCOL_VERSION = 1

/** Walking speed, tiles per second. Shared so both sides agree where anyone is. */
export const WALK_SPEED = 4
export const CHAT_MAX_LEN = 160
export const CHAT_MIN_INTERVAL_MS = 700
export const MOVE_MIN_INTERVAL_MS = 90
export const CHAT_HISTORY = 30
export const NAME_MAX_LEN = 32

export const CLOSE = {
  Superseded: 4001, // the same account connected somewhere else
  Refused: 4003, // not signed in, banned, or unknown room
  Protocol: 4004, // client speaks another protocol version
} as const

export interface PublicPlayer {
  id: string
  name: string
  avatar: AvatarSpec
  /** Where the current walk started, the tiles still to walk, and when it started (server ms). */
  from: XY
  path: XY[]
  t0: number
  staff: boolean
}

export interface ChatLine {
  id: string
  name: string
  text: string
  ts: number
}

export type ClientMsg =
  | { t: 'move'; to: XY }
  | { t: 'chat'; text: string }
  | { t: 'avatar'; avatar: AvatarSpec }
  | { t: 'ping'; c: number }

export type ServerMsg =
  | { t: 'welcome'; you: string; district: string; players: PublicPlayer[]; chat: ChatLine[]; now: number }
  | { t: 'join'; p: PublicPlayer }
  | { t: 'leave'; id: string }
  | { t: 'path'; id: string; from: XY; path: XY[]; t0: number }
  | { t: 'chat'; line: ChatLine }
  | { t: 'avatar'; id: string; avatar: AvatarSpec }
  | { t: 'pong'; c: number; now: number }
  | { t: 'error'; code: string; msg: string }

const isTile = (v: unknown): v is XY =>
  Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 0 && n < 4096)

/** Strip control characters and trim; empty after cleaning means no message. */
export const cleanText = (s: string, max: number): string =>
  s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮]/g, '').trim().slice(0, max)

/** Parse and validate one frame from a client. Returns null for anything malformed. */
export function parseClientMsg(raw: string | ArrayBuffer): ClientMsg | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null
  let m: unknown
  try {
    m = JSON.parse(raw)
  } catch {
    return null
  }
  if (!m || typeof m !== 'object') return null
  const o = m as Record<string, unknown>
  switch (o.t) {
    case 'move':
      return isTile(o.to) ? { t: 'move', to: [o.to[0], o.to[1]] } : null
    case 'chat': {
      if (typeof o.text !== 'string') return null
      const text = cleanText(o.text, CHAT_MAX_LEN)
      return text ? { t: 'chat', text } : null
    }
    case 'avatar':
      return { t: 'avatar', avatar: clampAvatar(o.avatar) }
    case 'ping':
      return typeof o.c === 'number' ? { t: 'ping', c: o.c } : null
    default:
      return null
  }
}
