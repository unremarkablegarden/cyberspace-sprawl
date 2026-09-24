import { expect, test } from 'bun:test'
import { findPath, isAdjacent, positionAt, type Walkable } from './grid.ts'

const open = (w: number, h: number, walls: string[] = []): Walkable => ({
  width: w, height: h,
  walkable: (x, y) => x >= 0 && y >= 0 && x < w && y < h && !walls.includes(`${x},${y}`),
})

test('straight path', () => {
  expect(findPath(open(5, 1), [0, 0], [3, 0])).toEqual([[1, 0], [2, 0], [3, 0]])
})

test('path goes round a wall and every step is adjacent', () => {
  const path = findPath(open(3, 3, ['1,0', '1,1']), [0, 0], [2, 0])!
  expect(path.at(-1)).toEqual([2, 0])
  let prev: readonly [number, number] = [0, 0]
  for (const t of path) { expect(isAdjacent(prev, t)).toBe(true); prev = t }
})

test('unreachable and blocked targets give null', () => {
  expect(findPath(open(3, 1, ['1,0']), [0, 0], [2, 0])).toBeNull()
  expect(findPath(open(3, 1, ['2,0']), [0, 0], [2, 0])).toBeNull()
})

test('maxLen caps the search', () => {
  expect(findPath(open(50, 1), [0, 0], [40, 0], 10)).toBeNull()
})

test('positionAt interpolates and stops at the end', () => {
  const path: [number, number][] = [[1, 0], [2, 0]]
  expect(positionAt([0, 0], path, 0, 2, 250)).toEqual([0.5, 0, true])
  expect(positionAt([0, 0], path, 0, 2, 5000)).toEqual([2, 0, false])
})
