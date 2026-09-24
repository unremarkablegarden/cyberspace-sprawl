// One session in one district: the scene, the connection, the people, the UI.

import { Clock, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three'
import {
  CLOSE, PROTOCOL_VERSION, generateDistrict, type AvatarSpec, type ClientMsg, type DistrictMap, type ServerMsg, type XY,
} from '@sprawl/shared'
import { districtById, START_DISTRICT, type DistrictDef } from '@sprawl/content'
import { Renderer } from './render/renderer.ts'
import { buildCity, type City } from './render/city.ts'
import { Rain } from './render/rain.ts'
import { Players } from './world/players.ts'
import { Input } from './input/input.ts'
import { ReconnectingSocket } from './net/socket.ts'
import { Chat } from './ui/chat.ts'
import { Hud } from './ui/hud.ts'
import { Customiser } from './ui/customiser.ts'
import { h } from './ui/dom.ts'

export interface Session {
  /** Query string that proves who we are: `token=…` or `guest=…`. */
  credentials(renew: boolean): Promise<string>
  signOut(reason?: string): void
}

const PING_EVERY_MS = 30_000

export class Game {
  readonly def: DistrictDef
  readonly map: DistrictMap
  readonly renderer: Renderer
  readonly players: Players
  readonly city: City
  #rain = new Rain()
  #input: Input
  #socket: ReconnectingSocket
  #chat: Chat
  #hud: Hud
  #cursor: Mesh
  #panel: Customiser | null = null
  #lastMoveSent = 0
  #renewed = false
  #focus = new Vector3()
  #stopped = false
  ready = false

  constructor(private root: HTMLElement, private session: Session, districtId = START_DISTRICT) {
    const def = districtById(districtId)
    if (!def) throw new Error(`unknown district ${districtId}`)
    this.def = def
    this.map = generateDistrict(def)

    const canvas = h('canvas.view')
    const overlay = h('div.overlay')
    root.append(canvas, overlay)

    this.renderer = new Renderer(canvas)
    this.renderer.setSky(def.sky, def.fog)
    this.city = buildCity(this.map)
    this.players = new Players(overlay)
    this.renderer.scene.add(this.city.group, this.players.group, this.#rain.mesh)

    this.#cursor = new Mesh(
      new PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0x2ef2ff, transparent: true, opacity: 0.25 }),
    )
    this.#cursor.position.y = 0.01
    this.renderer.scene.add(this.#cursor)

    this.#input = new Input(canvas, () => this.renderer.camera)
    this.#input.onClickTile = (t) => this.walkTo(t)
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      this.renderer.viewHeight = Math.min(30, Math.max(8, this.renderer.viewHeight * (e.deltaY > 0 ? 1.1 : 0.9)))
      this.renderer.resize()
    }, { passive: false })

    this.#chat = new Chat((text) => this.send({ t: 'chat', text }))
    this.#hud = new Hud({ customise: () => this.toggleCustomiser(), signOut: () => this.session.signOut() })
    this.#hud.place(def.name)
    this.#hud.status('connecting…')
    overlay.append(this.#hud.el, this.#chat.el)

    this.#socket = this.#openSocket()

    const timer = setInterval(() => this.send({ t: 'ping', c: Date.now() }), PING_EVERY_MS)
    const clock = new Clock()
    const frame = () => {
      if (this.#stopped) return clearInterval(timer)
      this.#tick(clock.getDelta(), clock.elapsedTime)
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    this.#exposeForTests()
  }

  send(msg: ClientMsg): void {
    this.#socket.send(msg)
  }

  walkTo(tile: XY): void {
    if (!this.map.walkable(tile[0], tile[1])) return
    this.#lastMoveSent = performance.now()
    this.send({ t: 'move', to: tile })
  }

  toggleCustomiser(): void {
    const me = this.players.me
    if (this.#panel || !me) return this.#closeCustomiser()
    const saved = me.avatar
    this.#panel = new Customiser(
      saved,
      (spec) => this.players.setAvatar(me.id, spec),
      (spec) => {
        this.send({ t: 'avatar', avatar: spec })
        this.#closeCustomiser(spec)
      },
      () => this.#closeCustomiser(saved),
    )
    this.root.append(this.#panel.el)
  }

  #closeCustomiser(restore?: AvatarSpec): void {
    if (restore && this.players.me) this.players.setAvatar(this.players.meId, restore)
    this.#panel?.el.remove()
    this.#panel = null
  }

  stop(): void {
    this.#stopped = true
    this.#socket.stop()
    this.root.replaceChildren()
  }

  #onMessage(m: ServerMsg): void {
    switch (m.t) {
      case 'welcome':
        this.players.clear()
        this.#chat.clear()
        this.players.meId = m.you
        this.players.clockOffset = m.now - Date.now()
        for (const p of m.players) this.players.upsert(p)
        for (const line of m.chat) this.#chat.add(line, line.id === m.you)
        this.#hud.count(this.players.all.size)
        this.#snapCamera()
        this.ready = true
        return
      case 'join':
        this.players.upsert(m.p)
        this.#chat.system(`${m.p.name} is here`)
        this.#hud.count(this.players.all.size)
        return
      case 'leave': {
        const name = this.players.all.get(m.id)?.name
        this.players.remove(m.id)
        if (name) this.#chat.system(`${name} left`)
        this.#hud.count(this.players.all.size)
        return
      }
      case 'path':
        this.players.setPath(m.id, m.from, m.path, m.t0)
        return
      case 'chat':
        this.players.say(m.line.id, m.line.text)
        this.#chat.add(m.line, m.line.id === this.players.meId)
        return
      case 'avatar':
        if (!(m.id === this.players.meId && this.#panel)) this.players.setAvatar(m.id, m.avatar)
        return
      case 'pong': {
        // Half the round trip is the best guess for the server's clock now.
        const rtt = Date.now() - m.c
        this.players.clockOffset = m.now + rtt / 2 - Date.now()
        return
      }
      case 'error':
        this.#chat.system(m.msg)
        return
    }
  }

  #onClose(code: number, reason: string, retrying: boolean): void {
    this.ready = false
    if (code === CLOSE.Refused && reason === 'session expired' && !this.#renewed) {
      // One retry with a fresh token before giving up on the session.
      this.#renewed = true
      this.#socket.stop()
      this.#socket = this.#openSocket()
      return
    }
    if (code === CLOSE.Refused) return this.session.signOut(reason)
    if (code === CLOSE.Superseded) return this.#hud.status('Open in another window. Reload to play here.')
    if (code === CLOSE.Protocol) return this.#hud.status('The Sprawl has been updated. Reload to continue.')
    if (retrying) this.#hud.status('no carrier, redialling…')
  }

  #openSocket(): ReconnectingSocket {
    return new ReconnectingSocket(async () => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const creds = await this.session.credentials(this.#renewed)
      return `${proto}//${location.host}/rooms/district/${this.def.id}?v=${PROTOCOL_VERSION}&${creds}`
    }, {
      open: () => this.#hud.status(''),
      message: (data) => this.#onMessage(JSON.parse(data) as ServerMsg),
      close: (code, reason, retrying) => this.#onClose(code, reason, retrying),
    })
  }

  #snapCamera(): void {
    const me = this.players.me
    if (!me) return
    this.#focus.set(me.from[0], 0, me.from[1])
  }

  #tick(dt: number, time: number): void {
    const me = this.players.me
    // Held keys: keep a short walk queued ahead so movement is continuous
    // without a message per tile.
    const dir = this.#input.held
    if (me && dir && this.players.remaining(me.id) < 0.6 && performance.now() - this.#lastMoveSent > 120) {
      let [x, y] = this.players.destination(me.id)!
      for (let i = 0; i < 3 && this.map.walkable(x + dir[0], y + dir[1]); i++) {
        x += dir[0]
        y += dir[1]
      }
      const dest = this.players.destination(me.id)!
      if (x !== dest[0] || y !== dest[1]) this.walkTo([x, y])
    }

    if (me) {
      const p = me.char.root.position
      this.#focus.lerp(new Vector3(p.x, 0, p.z), Math.min(1, dt * 6))
    }
    this.renderer.lookAt(this.#focus.x, 0, this.#focus.z)

    const hover = this.#input.hover
    this.#cursor.visible = !!hover && this.map.walkable(hover[0], hover[1])
    if (hover) this.#cursor.position.set(hover[0], 0.01, hover[1])

    this.city.animate(time, this.#focus.x, this.#focus.z)
    this.#rain.update(time, this.#focus.x, this.#focus.z)
    const cam = this.renderer.camera
    this.players.update(dt, (v) => {
      v.project(cam)
      return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, visible: Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 }
    })
    this.renderer.render(time)
  }

  /** Hooks for the headless bot script (tools/bots.ts). Harmless in production. */
  #exposeForTests(): void {
    ;(window as unknown as { __sprawl: unknown }).__sprawl = {
      game: this,
      isReady: () => this.ready,
      me: () => this.players.me && { id: this.players.me.id, from: this.players.me.from, path: this.players.me.path },
      players: () => [...this.players.all.values()].map((e) => ({ id: e.id, name: e.name, avatar: e.avatar })),
      walkTo: (x: number, y: number) => this.walkTo([x, y]),
      say: (text: string) => this.send({ t: 'chat', text }),
      setAvatar: (avatar: AvatarSpec) => this.send({ t: 'avatar', avatar }),
      openCustomiser: () => this.toggleCustomiser(),
      spawn: () => this.map.spawn,
      walkable: (x: number, y: number) => this.map.walkable(x, y),
      zoom: (viewHeight: number) => { this.renderer.viewHeight = viewHeight; this.renderer.resize() },
    }
  }
}
