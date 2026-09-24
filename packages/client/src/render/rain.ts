// Rain: short falling streaks in a box that follows the camera. One draw call.

import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three'

const COUNT = 900
const SPREAD = 26
const HEIGHT = 14
const LENGTH = 0.35
const SPEED = 16

export class Rain {
  readonly mesh: LineSegments
  #pos: Float32Array
  #seeds: Float32Array

  constructor() {
    this.#pos = new Float32Array(COUNT * 6)
    this.#seeds = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      this.#seeds[i * 3] = Math.random()
      this.#seeds[i * 3 + 1] = Math.random()
      this.#seeds[i * 3 + 2] = Math.random()
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(this.#pos, 3))
    this.mesh = new LineSegments(geo, new LineBasicMaterial({ color: 0x8fa8d8, transparent: true, opacity: 0.35 }))
    this.mesh.frustumCulled = false
  }

  update(time: number, cx: number, cz: number): void {
    const p = this.#pos, s = this.#seeds
    for (let i = 0; i < COUNT; i++) {
      // Wrap each drop into a box around the camera so rain never runs out.
      const x = cx + (((s[i * 3]! * SPREAD - cx) % SPREAD) + SPREAD) % SPREAD - SPREAD / 2
      const z = cz + (((s[i * 3 + 1]! * SPREAD - cz) % SPREAD) + SPREAD) % SPREAD - SPREAD / 2
      const y = HEIGHT - ((s[i * 3 + 2]! * HEIGHT + time * SPEED) % HEIGHT)
      p.set([x, y, z, x + 0.04, y + LENGTH, z + 0.04], i * 6)
    }
    ;(this.mesh.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
  }
}
