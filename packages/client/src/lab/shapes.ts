// Look lab: soft-edged shapes from three.js core (no addons). Everything is
// an extruded rounded rectangle with a bevel, so edges catch the light instead
// of meeting at a hard 90°.

import { BufferGeometry, Color, ExtrudeGeometry, Float32BufferAttribute, Shape } from 'three'

/** A rounded rectangle of w × d centred on the origin, in the XY plane. */
export function roundedRect(w: number, d: number, r: number): Shape {
  r = Math.min(r, w / 2 - 0.001, d / 2 - 0.001)
  const s = new Shape()
  const x0 = -w / 2, x1 = w / 2, y0 = -d / 2, y1 = d / 2
  // Arcs too small to see make degenerate bevels; use a plain corner.
  if (r < 0.004) {
    s.moveTo(x0, y0)
    s.lineTo(x1, y0)
    s.lineTo(x1, y1)
    s.lineTo(x0, y1)
    s.lineTo(x0, y0)
    return s
  }
  s.moveTo(x0 + r, y0)
  s.lineTo(x1 - r, y0)
  s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false)
  s.lineTo(x1, y1 - r)
  s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false)
  s.lineTo(x0 + r, y1)
  s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x0, y0 + r)
  s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}

/**
 * A footprint of w × d extruded to height h, standing on y = 0. `corner` rounds
 * the plan, `bevel` softens the top and bottom edges.
 */
export function slab(w: number, d: number, h: number, corner: number, bevel: number, segments = 5): BufferGeometry {
  bevel = Math.max(0, Math.min(bevel, h / 2 - 0.0001, w / 2 - 0.004, d / 2 - 0.004))
  const shape = roundedRect(w - 2 * bevel, d - 2 * bevel, Math.max(0.0001, corner - bevel))
  const g = new ExtrudeGeometry(shape, {
    depth: Math.max(0.0001, h - 2 * bevel),
    bevelEnabled: bevel > 0.0005,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: segments,
  })
  // Extrusion runs along +Z; stand it up so it runs along +Y from the ground.
  g.rotateX(-Math.PI / 2)
  g.translate(0, bevel, 0)
  return g
}

/** A rounded box centred on the origin. */
export function roundedBox(w: number, h: number, d: number, r: number): BufferGeometry {
  return slab(w, d, h, r * 1.5, r, 4).translate(0, -h / 2, 0)
}

/**
 * Many small static meshes as one geometry, so they cost one draw call. Each
 * piece is placed in world space, painted one colour, and remembers its own
 * origin in `aLot` and its index in `aPiece`, for shaders that move pieces
 * one by one (the cutaway).
 */
export class Merger {
  #pos: number[] = []
  #nor: number[] = []
  #col: number[] = []
  #lot: number[] = []
  #piece: number[] = []

  get empty(): boolean {
    return this.#pos.length === 0
  }

  add(geo: BufferGeometry, x: number, y: number, z: number, rotY = 0, color: Color = WHITE, piece = 0): void {
    const g = geo.index ? geo.toNonIndexed() : geo
    const p = g.getAttribute('position'), n = g.getAttribute('normal')
    const c = Math.cos(rotY), s = Math.sin(rotY)
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), pz = p.getZ(i), nx = n.getX(i), nz = n.getZ(i)
      this.#pos.push(x + px * c + pz * s, y + p.getY(i), z - px * s + pz * c)
      this.#nor.push(nx * c + nz * s, n.getY(i), -nx * s + nz * c)
      this.#col.push(color.r, color.g, color.b)
      this.#lot.push(x, y, z)
      this.#piece.push(piece)
    }
    if (g !== geo) g.dispose()
  }

  build(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.#pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.#nor, 3))
    g.setAttribute('color', new Float32BufferAttribute(this.#col, 3))
    g.setAttribute('aLot', new Float32BufferAttribute(this.#lot, 3))
    g.setAttribute('aPiece', new Float32BufferAttribute(this.#piece, 1))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}
const WHITE = new Color(1, 1, 1)
