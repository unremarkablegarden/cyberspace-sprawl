// Room: a Durable Object that holds WebSocket connections using the
// hibernation API, so an idle room costs nothing and wakes on the next message.
//
// The shape (lifecycle hooks, attachments that survive hibernation, tags,
// broadcast, close-handshake care) follows partyserver by the PartyKit team
// (ISC licence), trimmed to hibernation-only and written out here so the whole
// path from socket to game logic can be read in one place.
//
// Lifecycle:
//   constructor → onStart()      once per wake, before any event is delivered
//   fetch (upgrade) → onConnect() after the socket is accepted
//   webSocketMessage → onMessage()
//   webSocketClose/Error → onClose()
//   fetch (plain HTTP) → onRequest()
//
// Memory is a cache. Anything that must outlive a hibernation or a redeploy
// goes in SQLite (this.ctx.storage.sql) or in a connection's attachment.

import { DurableObject } from 'cloudflare:workers'

/** Who a connection belongs to. Set by the Worker after it checks the token. */
export interface Identity {
  uid: string
  name: string
  staff: boolean
}

export const IDENTITY_HEADER = 'x-sprawl-identity'

export function encodeIdentity(id: Identity): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(id))))
}

function decodeIdentity(header: string | null): Identity | null {
  if (!header) return null
  try {
    const bytes = Uint8Array.from(atob(header), (c) => c.charCodeAt(0))
    const v = JSON.parse(new TextDecoder().decode(bytes)) as Identity
    return typeof v.uid === 'string' && typeof v.name === 'string' ? v : null
  } catch {
    return null
  }
}

/** What each socket carries through hibernation. Keep it small: it is serialised on every change. */
interface Attachment<S> {
  id: string
  identity: Identity
  state: S
}

/** A connected socket plus its identity and per-connection state. */
export class Conn<S> {
  constructor(readonly ws: WebSocket, private att: Attachment<S>, private save: (a: Attachment<S>) => void) {}
  get id(): string { return this.att.id }
  get identity(): Identity { return this.att.identity }
  get state(): S { return this.att.state }
  setState(state: S): void {
    this.att = { ...this.att, state }
    this.save(this.att)
  }
  send(msg: unknown): void {
    try {
      this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } catch {
      // A socket we can't write to is gone; closing lets the runtime clean up.
      try { this.ws.close(1011, 'send failed') } catch { /* already closed */ }
    }
  }
  close(code: number, reason: string): void {
    try { this.ws.close(code, reason) } catch { /* already closed */ }
  }
}

const OPEN = 1

export abstract class Room<Env, S> extends DurableObject<Env> {
  #attachments = new WeakMap<WebSocket, Attachment<S>>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Nothing is delivered until onStart finishes, on every wake.
    void ctx.blockConcurrencyWhile(async () => { await this.onStart() })
  }

  /** The room's name, e.g. "chiba-ninsei". Rooms are always addressed by name. */
  get name(): string {
    const n = this.ctx.id.name
    if (!n) throw new Error('rooms must be addressed with idFromName')
    return n
  }

  // Hooks for subclasses.
  protected onStart(): void | Promise<void> {}
  protected abstract initialState(identity: Identity, request: Request): S | Promise<S>
  protected onConnect(_conn: Conn<S>): void | Promise<void> {}
  protected onMessage(_conn: Conn<S>, _message: string | ArrayBuffer): void | Promise<void> {}
  protected onClose(_conn: Conn<S>): void | Promise<void> {}
  protected onRequest(_request: Request): Response | Promise<Response> {
    return new Response('not found', { status: 404 })
  }

  /** Open connections, optionally only those tagged `tag` (every connection is tagged with its uid). */
  protected *connections(tag?: string): Generator<Conn<S>> {
    for (const ws of this.ctx.getWebSockets(tag)) {
      if (ws.readyState !== OPEN) continue
      const conn = this.#wrap(ws)
      if (conn) yield conn
    }
  }

  /** Send to every open connection except those whose ids are listed. */
  protected broadcast(msg: unknown, except: readonly string[] = []): void {
    const text = JSON.stringify(msg)
    for (const c of this.connections()) if (!except.includes(c.id)) c.send(text)
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return this.onRequest(request)

    const identity = decodeIdentity(request.headers.get(IDENTITY_HEADER))
    if (!identity) return new Response('no identity', { status: 400 })

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]
    // Tag with the uid so a second login can find and replace the first.
    this.ctx.acceptWebSocket(server, [identity.uid])
    try {
      const att: Attachment<S> = { id: crypto.randomUUID(), identity, state: await this.initialState(identity, request) }
      this.#store(server, att)
      await this.onConnect(this.#wrap(server)!)
    } catch (err) {
      // Tell the client why, then close, rather than leaving it hanging.
      console.error(`[${this.constructor.name}:${this.name}] connect failed`, err)
      try {
        server.send(JSON.stringify({ t: 'error', code: 'setup', msg: 'room failed to start' }))
        server.close(1011, 'setup failed')
      } catch { /* nothing to do */ }
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const conn = this.#wrap(ws)
    if (!conn) return
    try {
      await this.onMessage(conn, message)
    } catch (err) {
      console.error(`[${this.constructor.name}:${this.name}] message failed`, err)
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    await this.#closed(ws)
    // Complete the close handshake, except for codes the runtime makes up when
    // the peer vanished without one; there is nobody left to answer.
    if (code !== 1005 && code !== 1006 && code !== 1015) {
      try { ws.close(code, reason) } catch { /* already closed */ }
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.#closed(ws)
  }

  #closedIds = new WeakSet<WebSocket>()
  async #closed(ws: WebSocket): Promise<void> {
    // Close and error can both fire for one socket; handle it once.
    if (this.#closedIds.has(ws)) return
    this.#closedIds.add(ws)
    const conn = this.#wrap(ws)
    if (!conn) return
    try {
      await this.onClose(conn)
    } catch (err) {
      console.error(`[${this.constructor.name}:${this.name}] close failed`, err)
    }
  }

  #store(ws: WebSocket, att: Attachment<S>): void {
    this.#attachments.set(ws, att)
    ws.serializeAttachment(att)
  }

  #wrap(ws: WebSocket): Conn<S> | null {
    let att = this.#attachments.get(ws)
    if (!att) {
      // After hibernation memory is empty; the attachment came back with the socket.
      att = ws.deserializeAttachment() as Attachment<S> | null ?? undefined
      if (!att) return null
      this.#attachments.set(ws, att)
    }
    return new Conn(ws, att, (a) => this.#store(ws, a))
  }
}
