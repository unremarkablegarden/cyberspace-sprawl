// A WebSocket that reconnects by itself. The retry behaviour follows
// partysocket (MIT, the PartyKit team): the delay grows ×1.3 from a minimum up
// to a cap, with jitter so a server restart isn't met by every client at once;
// a connection that doesn't open in time is abandoned; and the retry count
// only resets once a connection has stayed up for a while.
//
// Messages sent while offline are queued (up to a limit) and flushed on open.

import { CLOSE } from '@sprawl/shared'

const MIN_DELAY = 1000
const MAX_DELAY = 15_000
const GROW = 1.3
const OPEN_TIMEOUT = 4000
const MIN_UPTIME = 5000
const MAX_QUEUE = 32

export interface SocketEvents {
  message(data: string): void
  open(): void
  /** `retrying` is false when the server refused us for good (sign-in, protocol). */
  close(code: number, reason: string, retrying: boolean): void
}

export class ReconnectingSocket {
  #ws: WebSocket | null = null
  #retries = 0
  #queue: string[] = []
  #stopped = false
  #uptimeTimer = 0

  /** `url` is called on every attempt, so it can fetch a fresh token. */
  constructor(private url: () => Promise<string>, private on: SocketEvents) {
    void this.#connect()
  }

  get open(): boolean {
    return this.#ws?.readyState === WebSocket.OPEN
  }

  send(data: unknown): void {
    const text = typeof data === 'string' ? data : JSON.stringify(data)
    if (this.open) this.#ws!.send(text)
    else if (this.#queue.length < MAX_QUEUE) this.#queue.push(text)
  }

  stop(): void {
    this.#stopped = true
    this.#ws?.close(1000, 'bye')
  }

  async #connect(): Promise<void> {
    if (this.#stopped) return
    let url: string
    try {
      url = await this.url()
    } catch {
      return this.#retry()
    }
    const ws = new WebSocket(url)
    this.#ws = ws
    const timeout = setTimeout(() => ws.readyState === WebSocket.CONNECTING && ws.close(), OPEN_TIMEOUT)

    ws.onopen = () => {
      clearTimeout(timeout)
      this.#uptimeTimer = window.setTimeout(() => (this.#retries = 0), MIN_UPTIME)
      for (const m of this.#queue.splice(0)) ws.send(m)
      this.on.open()
    }
    ws.onmessage = (e) => typeof e.data === 'string' && this.on.message(e.data)
    ws.onclose = (e) => {
      clearTimeout(timeout)
      clearTimeout(this.#uptimeTimer)
      if (this.#ws !== ws) return
      // Refusals are final: retrying won't sign anyone in.
      const final = this.#stopped || e.code === CLOSE.Refused || e.code === CLOSE.Protocol || e.code === CLOSE.Superseded
      this.on.close(e.code, e.reason, !final)
      if (!final) this.#retry()
    }
  }

  #retry(): void {
    const base = Math.min(MAX_DELAY, MIN_DELAY * GROW ** this.#retries++)
    setTimeout(() => void this.#connect(), base * (0.5 + Math.random() * 0.5))
  }
}
