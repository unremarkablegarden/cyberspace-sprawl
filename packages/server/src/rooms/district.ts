// District: one Durable Object per district. It is the authority on who is
// here, where they are walking and what they say.
//
// The layout itself is never stored: it is regenerated from the district's
// seed (see @sprawl/shared world/gen.ts). Storage holds only what changes.
//
// Movement is event-driven, with no tick: a player asks to walk to a tile,
// the room finds the path and tells everyone the path and its start time, and
// every client animates it with the shared WALK_SPEED. Positions are derived
// from (from, path, t0) whenever needed, so an idle room does no work at all
// and can hibernate.

import {
  CHAT_HISTORY, CHAT_MIN_INTERVAL_MS, CLOSE, MOVE_MIN_INTERVAL_MS, WALK_SPEED,
  findPath, generateDistrict, hashString, parseClientMsg, randomAvatar, rng, tileAt,
  type AvatarSpec, type ChatLine, type DistrictMap, type PublicPlayer, type ServerMsg, type XY,
} from '@sprawl/shared'
import { districtById } from '@sprawl/content'
import type { Env } from '../env.ts'
import { Room, type Conn, type Identity } from '../room.ts'
import { migrate } from '../sql.ts'

interface Walker {
  avatar: AvatarSpec
  from: XY
  path: XY[]
  t0: number
  lastMove: number
  lastChat: number
}

const SCHEMA = [
  'CREATE TABLE chat (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL)',
]

// Generated layouts are cached per isolate; they are pure functions of the def.
const maps = new Map<string, DistrictMap>()
function mapFor(id: string): DistrictMap {
  let m = maps.get(id)
  if (!m) {
    const def = districtById(id)
    if (!def) throw new Error(`unknown district ${id}`)
    m = generateDistrict(def)
    maps.set(id, m)
  }
  return m
}

export class District extends Room<Env, Walker> {
  #map!: DistrictMap

  protected override onStart(): void {
    this.#map = mapFor(this.name)
    migrate(this.ctx.storage.sql, SCHEMA)
  }

  #player(uid: string) {
    return this.env.PLAYER.get(this.env.PLAYER.idFromName(uid))
  }

  protected override async initialState(identity: Identity): Promise<Walker> {
    const player = this.#player(identity.uid)
    const profile = await player.getProfile()
    // Newcomers get a random look, stored at once so it's the same next time.
    const avatar = profile.avatar ?? (await player.setAvatar(randomAvatar(rng(hashString(identity.uid)))))
    const place = profile.place
    let from: XY =
      place && place.district === this.name && this.#map.walkable(place.x, place.y) ? [place.x, place.y] : this.#map.spawn
    // Replacing a live session (a new tab): pick up where that one is standing.
    for (const prev of this.connections(identity.uid)) {
      const s = prev.state
      from = tileAt(s.from, s.path, s.t0, WALK_SPEED, Date.now())
    }
    return { avatar, from, path: [], t0: Date.now(), lastMove: 0, lastChat: 0 }
  }

  protected override onConnect(conn: Conn<Walker>): void {
    // One connection per account: a new tab or device replaces the old one.
    for (const other of this.connections(conn.identity.uid))
      if (other.id !== conn.id) other.close(CLOSE.Superseded, 'signed in elsewhere')

    const welcome: ServerMsg = {
      t: 'welcome',
      you: conn.identity.uid,
      district: this.name,
      players: this.#players(),
      chat: this.#recentChat(),
      now: Date.now(),
    }
    conn.send(welcome)
    this.#send({ t: 'join', p: publicPlayer(conn) }, [conn.id])
  }

  protected override async onMessage(conn: Conn<Walker>, raw: string | ArrayBuffer): Promise<void> {
    const msg = parseClientMsg(raw)
    if (!msg) return
    const now = Date.now()
    const s = conn.state

    switch (msg.t) {
      case 'move': {
        if (now - s.lastMove < MOVE_MIN_INTERVAL_MS) return
        // Start from wherever they are right now, mid-walk or not.
        const here = tileAt(s.from, s.path, s.t0, WALK_SPEED, now)
        const path = findPath(this.#map, here, msg.to, 64)
        if (!path) return
        conn.setState({ ...s, from: here, path, t0: now, lastMove: now })
        this.#send({ t: 'path', id: conn.identity.uid, from: here, path, t0: now })
        return
      }
      case 'chat': {
        if (now - s.lastChat < CHAT_MIN_INTERVAL_MS) return
        conn.setState({ ...s, lastChat: now })
        const line: ChatLine = { id: conn.identity.uid, name: conn.identity.name, text: msg.text, ts: now }
        const sql = this.ctx.storage.sql
        sql.exec('INSERT INTO chat (uid, name, text, ts) VALUES (?, ?, ?, ?)', line.id, line.name, line.text, line.ts)
        sql.exec('DELETE FROM chat WHERE id <= (SELECT MAX(id) FROM chat) - ?', CHAT_HISTORY)
        this.#send({ t: 'chat', line })
        return
      }
      case 'avatar': {
        // Saved before anyone is told, so a change that was shown is a change that was kept.
        const avatar = await this.#player(conn.identity.uid).setAvatar(msg.avatar)
        conn.setState({ ...conn.state, avatar })
        this.#send({ t: 'avatar', id: conn.identity.uid, avatar })
        return
      }
      case 'ping':
        conn.send({ t: 'pong', c: msg.c, now } satisfies ServerMsg)
        return
    }
  }

  protected override async onClose(conn: Conn<Walker>): Promise<void> {
    const uid = conn.identity.uid
    // A replaced connection leaves quietly: the player is still here on the new one.
    for (const other of this.connections(uid)) if (other.id !== conn.id) return
    this.#send({ t: 'leave', id: uid }, [conn.id])
    const s = conn.state
    const [x, y] = tileAt(s.from, s.path, s.t0, WALK_SPEED, Date.now())
    await this.#player(uid).setPlace(this.name, x, y)
  }

  protected override onRequest(request: Request): Response {
    if (new URL(request.url).pathname.endsWith('/info'))
      return Response.json({ district: this.name, players: this.#players().length })
    return new Response('not found', { status: 404 })
  }

  /** Everything stored for this district, for backups and exports. */
  exportState(): Record<string, unknown> {
    return { district: this.name, chat: this.#recentChat() }
  }

  #send(msg: ServerMsg, except: readonly string[] = []): void {
    this.broadcast(msg, except)
  }

  #players(): PublicPlayer[] {
    const seen = new Map<string, PublicPlayer>()
    for (const c of this.connections()) seen.set(c.identity.uid, publicPlayer(c))
    return [...seen.values()]
  }

  #recentChat(): ChatLine[] {
    return this.ctx.storage.sql
      .exec<{ uid: string; name: string; text: string; ts: number }>('SELECT uid, name, text, ts FROM chat ORDER BY id')
      .toArray()
      .map((r) => ({ id: r.uid, name: r.name, text: r.text, ts: r.ts }))
  }
}

function publicPlayer(c: Conn<Walker>): PublicPlayer {
  const s = c.state
  return { id: c.identity.uid, name: c.identity.name, avatar: s.avatar, from: s.from, path: s.path, t0: s.t0, staff: c.identity.staff }
}
