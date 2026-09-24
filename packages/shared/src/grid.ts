// XY maths and pathfinding, shared so the client and the server walk the
// same grid. Movement is 4-directional on integer tiles.

export type XY = readonly [x: number, y: number]

export const tileKey = (x: number, y: number): number => (y << 16) | x

export const DIRS: readonly XY[] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

export const isAdjacent = (a: XY, b: XY): boolean =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1

export interface Walkable {
  width: number
  height: number
  walkable(x: number, y: number): boolean
}

/**
 * A* from `from` to `to`. Returns the tiles after `from`, ending at `to`, or
 * null when unreachable or longer than `maxLen`. The cap keeps a hostile
 * click from costing the server a whole-map search.
 */
export function findPath(map: Walkable, from: XY, to: XY, maxLen = 96): XY[] | null {
  const [tx, ty] = to
  if (!map.walkable(tx, ty)) return null
  if (from[0] === tx && from[1] === ty) return []
  const h = (x: number, y: number) => Math.abs(x - tx) + Math.abs(y - ty)
  if (h(from[0], from[1]) > maxLen) return null

  const startKey = tileKey(from[0], from[1])
  const came = new Map<number, number>()
  const g = new Map<number, number>([[startKey, 0]])
  // Binary heap of [f, key]. Small maps; this is plenty.
  const open: [number, number][] = [[h(from[0], from[1]), startKey]]
  const push = (f: number, k: number) => {
    open.push([f, k])
    let i = open.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (open[p]![0] <= open[i]![0]) break
      ;[open[p], open[i]] = [open[i]!, open[p]!]
      i = p
    }
  }
  const pop = (): [number, number] => {
    const top = open[0]!
    const last = open.pop()!
    if (open.length) {
      open[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1, r = l + 1
        let m = i
        if (l < open.length && open[l]![0] < open[m]![0]) m = l
        if (r < open.length && open[r]![0] < open[m]![0]) m = r
        if (m === i) break
        ;[open[m], open[i]] = [open[i]!, open[m]!]
        i = m
      }
    }
    return top
  }

  const goal = tileKey(tx, ty)
  while (open.length) {
    const [, k] = pop()
    if (k === goal) break
    const x = k & 0xffff, y = k >> 16
    const gk = g.get(k)!
    if (gk >= maxLen) continue
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy
      if (!map.walkable(nx, ny)) continue
      const nk = tileKey(nx, ny)
      const ng = gk + 1
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng)
        came.set(nk, k)
        push(ng + h(nx, ny), nk)
      }
    }
  }
  if (!came.has(goal)) return null
  const out: XY[] = []
  for (let k = goal; k !== startKey; k = came.get(k)!) out.push([k & 0xffff, k >> 16])
  return out.reverse()
}

/**
 * Where a walker is at time `t`, given the path it set off on at `t0`.
 * Returns fractional coordinates for rendering; floor them for the tile.
 */
export function positionAt(
  from: XY, path: readonly XY[], t0: number, speed: number, t: number,
): [x: number, y: number, moving: boolean] {
  const steps = Math.max(0, ((t - t0) / 1000) * speed)
  if (path.length === 0 || steps >= path.length) {
    const end = path.length ? path[path.length - 1]! : from
    return [end[0], end[1], false]
  }
  const i = Math.floor(steps)
  const a = i === 0 ? from : path[i - 1]!
  const b = path[i]!
  const f = steps - i
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, true]
}

/** The tile a walker occupies at time `t` (rounded to the nearer tile). */
export function tileAt(from: XY, path: readonly XY[], t0: number, speed: number, t: number): XY {
  const [x, y] = positionAt(from, path, t0, speed, t)
  return [Math.round(x), Math.round(y)]
}
