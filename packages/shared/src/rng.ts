// Seeded randomness for world generation. Everything that builds the base
// world must draw from here, never from Math.random, so a district's layout is
// a pure function of its seed and genVersion.

/** 32-bit FNV-1a over a string. Stable across runtimes. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Mulberry32: tiny, fast, good enough for level layout. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rand = ReturnType<typeof rng>

export const randInt = (r: Rand, min: number, max: number): number =>
  min + Math.floor(r() * (max - min + 1))

export function pick<T>(r: Rand, list: readonly T[]): T {
  const v = list[Math.floor(r() * list.length)]
  if (v === undefined) throw new Error('pick from empty list')
  return v
}
