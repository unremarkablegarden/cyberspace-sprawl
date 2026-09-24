import { expect, test } from 'bun:test'
import { parseClientMsg } from './protocol.ts'
import { clampAvatar, DEFAULT_AVATAR } from './avatar.ts'

test('rejects junk', () => {
  for (const raw of ['', 'nope', '{}', '{"t":"fly"}', '{"t":"move","to":[1]}', '{"t":"move","to":[-1,2]}', '{"t":"chat","text":"   "}'])
    expect(parseClientMsg(raw)).toBeNull()
  expect(parseClientMsg('x'.repeat(5000))).toBeNull()
})

test('cleans chat', () => {
  expect(parseClientMsg('{"t":"chat","text":" hi\\u0007 there "}')).toEqual({ t: 'chat', text: 'hi there' })
})

test('clamps avatars', () => {
  expect(clampAvatar({ build: 99, skin: 2, evil: true })).toEqual({ ...DEFAULT_AVATAR, skin: 2 })
  expect(clampAvatar(null)).toEqual(DEFAULT_AVATAR)
})
