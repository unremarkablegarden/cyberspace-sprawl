import { expect, test } from 'bun:test'
import { generateDistrict } from './gen.ts'

// Golden fingerprints of released generator versions. If one of these fails,
// you changed what an existing version generates, which would move buildings
// in a live, permanent world. Revert, and put the change in a new genVersion.
// Only update a hash for a version that has never been deployed.
const GOLDEN: [seed: string, version: number, w: number, h: number, hash: string][] = [
  ['ninsei', 1, 48, 48, 'a0437152'],
]

for (const [seed, genVersion, width, height, hash] of GOLDEN) {
  test(`genVersion ${genVersion} "${seed}" is frozen`, () => {
    expect(generateDistrict({ id: 't', seed, genVersion, width, height }).fingerprint()).toBe(hash)
  })
}

test('generation is deterministic', () => {
  const spec = { id: 't', seed: 'anything', genVersion: 1, width: 40, height: 32 }
  expect(generateDistrict(spec).fingerprint()).toBe(generateDistrict(spec).fingerprint())
})

test('different seeds give different districts', () => {
  const a = generateDistrict({ id: 'a', seed: 'a', genVersion: 1, width: 40, height: 40 })
  const b = generateDistrict({ id: 'b', seed: 'b', genVersion: 1, width: 40, height: 40 })
  expect(a.fingerprint()).not.toBe(b.fingerprint())
})

test('unknown genVersion throws', () => {
  expect(() => generateDistrict({ id: 't', seed: 's', genVersion: 999, width: 8, height: 8 })).toThrow()
})
