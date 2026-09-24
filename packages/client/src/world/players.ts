// Everyone in the district, as seen by this client: their character mesh,
// the walk they are on, and the DOM name tag and chat bubble floating above.

import { Group, Vector3 } from 'three'
import { positionAt, WALK_SPEED, type AvatarSpec, type PublicPlayer, type XY } from '@sprawl/shared'
import { animateWalk, buildCharacter, type Character } from '../render/character.ts'

const BUBBLE_MS = 6000

export interface Entity {
  id: string
  name: string
  avatar: AvatarSpec
  from: XY
  path: XY[]
  t0: number
  char: Character
  phase: number
  walk: number
  facing: number
  tag: HTMLElement
  bubble: HTMLElement
  bubbleUntil: number
}

export class Players {
  readonly group = new Group()
  readonly all = new Map<string, Entity>()
  /** Server clock minus ours, so walks line up with the server's timestamps. */
  clockOffset = 0
  meId = ''

  constructor(private overlay: HTMLElement) {}

  get me(): Entity | undefined {
    return this.all.get(this.meId)
  }

  serverNow(): number {
    return Date.now() + this.clockOffset
  }

  upsert(p: PublicPlayer): void {
    const existing = this.all.get(p.id)
    if (existing) {
      this.setPath(p.id, p.from, p.path, p.t0)
      if (JSON.stringify(existing.avatar) !== JSON.stringify(p.avatar)) this.setAvatar(p.id, p.avatar)
      return
    }
    const char = buildCharacter(p.avatar)
    this.group.add(char.root)
    const tag = document.createElement('div')
    tag.className = `tag${p.id === this.meId ? ' me' : ''}`
    tag.textContent = p.name
    const bubble = document.createElement('div')
    bubble.className = 'bubble'
    this.overlay.append(tag, bubble)
    this.all.set(p.id, {
      id: p.id, name: p.name, avatar: p.avatar, from: p.from, path: p.path, t0: p.t0,
      char, phase: 0, walk: 0, facing: 0, tag, bubble, bubbleUntil: 0,
    })
  }

  remove(id: string): void {
    const e = this.all.get(id)
    if (!e) return
    this.group.remove(e.char.root)
    e.tag.remove()
    e.bubble.remove()
    this.all.delete(id)
  }

  clear(): void {
    for (const id of [...this.all.keys()]) this.remove(id)
  }

  setPath(id: string, from: XY, path: XY[], t0: number): void {
    const e = this.all.get(id)
    if (!e) return
    Object.assign(e, { from, path, t0 })
  }

  setAvatar(id: string, avatar: AvatarSpec): void {
    const e = this.all.get(id)
    if (!e) return
    const pos = e.char.root.position.clone()
    const rot = e.char.root.rotation.y
    this.group.remove(e.char.root)
    e.char = buildCharacter(avatar)
    e.char.root.position.copy(pos)
    e.char.root.rotation.y = rot
    e.avatar = avatar
    this.group.add(e.char.root)
  }

  say(id: string, text: string): void {
    const e = this.all.get(id)
    if (!e) return
    e.bubble.textContent = text
    e.bubbleUntil = Date.now() + BUBBLE_MS
  }

  /** The tile a player is heading for (the end of their walk). */
  destination(id: string): XY | null {
    const e = this.all.get(id)
    if (!e) return null
    return e.path.length ? e.path[e.path.length - 1]! : e.from
  }

  /** Walk steps left for a player. */
  remaining(id: string): number {
    const e = this.all.get(id)
    if (!e || !e.path.length) return 0
    return Math.max(0, e.path.length - ((this.serverNow() - e.t0) / 1000) * WALK_SPEED)
  }

  update(dt: number, project: (v: Vector3) => { x: number; y: number; visible: boolean }): void {
    const now = this.serverNow()
    const v = new Vector3()
    for (const e of this.all.values()) {
      const [x, z, moving] = positionAt(e.from, e.path, e.t0, WALK_SPEED, now)
      const root = e.char.root
      const dx = x - root.position.x, dz = z - root.position.z
      if (moving && dx * dx + dz * dz > 1e-6) e.facing = Math.atan2(dx, dz)
      root.position.set(x, 0, z)
      // Turn smoothly towards the direction of travel.
      let d = e.facing - root.rotation.y
      d = Math.atan2(Math.sin(d), Math.cos(d))
      root.rotation.y += d * Math.min(1, dt * 14)
      e.walk += ((moving ? 1 : 0) - e.walk) * Math.min(1, dt * 10)
      if (moving) e.phase += dt * WALK_SPEED * Math.PI
      animateWalk(e.char, e.phase, e.walk)

      const s = project(v.set(x, e.char.top + 0.12, z))
      e.tag.style.display = s.visible ? '' : 'none'
      e.tag.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`
      const showBubble = s.visible && Date.now() < e.bubbleUntil
      e.bubble.style.display = showBubble ? '' : 'none'
      if (showBubble) e.bubble.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y - 22)}px) translate(-50%, -100%)`
    }
  }
}
