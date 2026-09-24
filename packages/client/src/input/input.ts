// Mouse/touch: click a tile to walk there. Keyboard: WASD or arrows walk in
// that direction. Keys are ignored while typing in a text field.

import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three'
import type { XY } from '@sprawl/shared'

const KEY_DIRS: Record<string, XY> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
}

export class Input {
  /** The tile under the pointer, or null. */
  hover: XY | null = null
  /** Direction of the held movement key, or null. */
  held: XY | null = null
  onClickTile: (t: XY) => void = () => {}
  #keys: string[] = []
  #ray = new Raycaster()
  #ground = new Plane(new Vector3(0, 1, 0), 0)

  constructor(private canvas: HTMLCanvasElement, private camera: () => Camera) {
    canvas.addEventListener('pointermove', (e) => (this.hover = this.tileAt(e.clientX, e.clientY)))
    canvas.addEventListener('pointerleave', () => (this.hover = null))
    canvas.addEventListener('click', (e) => {
      const t = this.tileAt(e.clientX, e.clientY)
      if (t) this.onClickTile(t)
    })
    addEventListener('keydown', (e) => {
      if (isTyping() || !(e.code in KEY_DIRS)) return
      e.preventDefault()
      if (!this.#keys.includes(e.code)) this.#keys.push(e.code)
      this.#sync()
    })
    addEventListener('keyup', (e) => {
      this.#keys = this.#keys.filter((k) => k !== e.code)
      this.#sync()
    })
    addEventListener('blur', () => {
      this.#keys = []
      this.#sync()
    })
  }

  #sync(): void {
    const k = this.#keys.at(-1)
    this.held = k ? KEY_DIRS[k]! : null
  }

  tileAt(clientX: number, clientY: number): XY | null {
    const r = this.canvas.getBoundingClientRect()
    const ndc = new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    this.#ray.setFromCamera(ndc, this.camera())
    const hit = this.#ray.ray.intersectPlane(this.#ground, new Vector3())
    return hit ? [Math.round(hit.x), Math.round(hit.z)] : null
  }
}

export const isTyping = (): boolean => {
  const el = document.activeElement
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
}
