// The Worker in front of everything:
//   /rooms/<kind>/<name>  WebSocket into a Durable Object room, after sign-in
//   /api/...              small HTTP endpoints (health)
//   anything else         the built client (static assets)

import { CLOSE, PROTOCOL_VERSION } from '@sprawl/shared'
import { districtById } from '@sprawl/content'
import { authenticate } from './auth.ts'
import type { Env } from './env.ts'
import { encodeIdentity, IDENTITY_HEADER } from './room.ts'

export { District } from './rooms/district.ts'
export { Player } from './rooms/player.ts'

/**
 * The room kinds a client may connect to, and how to check a room name.
 * Player rooms are deliberately absent: only other rooms reach those.
 */
const ROOM_KINDS: Record<string, { binding: (env: Env) => DurableObjectNamespace; exists: (name: string) => boolean }> = {
  district: { binding: (env) => env.DISTRICT, exists: (name) => districtById(name) !== undefined },
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/rooms/')) return rooms(request, env, url)
    if (url.pathname.startsWith('/api/')) return api(request, url)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>

async function rooms(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('expected a WebSocket', { status: 426 })

  const [, , kind = '', name = ''] = url.pathname.split('/')
  const room = ROOM_KINDS[kind]
  if (!room || !room.exists(name)) return refuse(CLOSE.Refused, 'no such place')
  if (url.searchParams.get('v') !== String(PROTOCOL_VERSION)) return refuse(CLOSE.Protocol, 'please reload')

  const auth = await authenticate(request, env)
  if (!auth.ok) return refuse(CLOSE.Refused, auth.reason)

  const forwarded = new Request(request)
  forwarded.headers.set(IDENTITY_HEADER, encodeIdentity(auth.identity))
  const ns = room.binding(env)
  return withRetry(() => ns.get(ns.idFromName(name)).fetch(forwarded.clone()))
}

/**
 * Refuse a WebSocket in a way the browser can read: accept it, then close it
 * with a code and a reason. A plain 403 shows up client-side as a bare
 * "connection failed" with no way to tell "sign in again" from "offline".
 */
function refuse(code: number, reason: string): Response {
  const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]
  server.accept()
  server.close(code, reason)
  return new Response(null, { status: 101, webSocket: client })
}

/** Durable Object calls can fail transiently during deploys; retry those with jitter. */
async function withRetry(op: () => Promise<Response>, attempts = 3): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      return await op()
    } catch (err) {
      const e = err as { retryable?: boolean; overloaded?: boolean }
      if (i >= attempts || e.retryable !== true || e.overloaded === true) throw err
      await new Promise((r) => setTimeout(r, Math.random() * Math.min(800, 100 * 2 ** (i - 1))))
    }
  }
}

function api(_request: Request, url: URL): Response {
  // Sign-in goes from the browser straight to the cyberspace API, not through
  // here: that API rate-limits logins per IP, and proxying would put every
  // player behind the same few Cloudflare addresses.
  if (url.pathname === '/api/health') return Response.json({ ok: true, protocol: PROTOCOL_VERSION })
  return new Response('not found', { status: 404 })
}
