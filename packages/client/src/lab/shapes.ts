// Look lab: soft-edged shapes from three.js core (no addons). Everything is
// an extruded rounded rectangle with a bevel, so edges catch the light instead
// of meeting at a hard 90°.

import { ExtrudeGeometry, Shape, type BufferGeometry } from 'three'

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
export function slab(w: number, d: number, h: number, corner: number, bevel: number, segments = 6): BufferGeometry {
  bevel = Math.max(0, Math.min(bevel, h / 2 - 0.0001, w / 2 - 0.004, d / 2 - 0.004))
  const shape = roundedRect(w - 2 * bevel, d - 2 * bevel, Math.max(0.0001, corner - bevel))
  const g = new ExtrudeGeometry(shape, {
    depth: Math.max(0.0001, h - 2 * bevel),
    bevelEnabled: bevel > 0.0005,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
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
