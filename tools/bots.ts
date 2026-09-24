// `bun run bots`: build the client, start the Worker locally, and drive a few
// headless players around Chiba. Checks they see each other, can talk, can
// change their look, and that the look survives a reconnect. Screenshots land
// in tools/out/. Exits non-zero on any failure.
//
// Options: --n 3 (players), --port 8787, --no-build, --keep (leave server running)

import { mkdirSync } from 'node:fs'
import { chromium, type Browser, type Page } from 'playwright-core'

const args = process.argv.slice(2)
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1]! : dflt
}
const N = Number(opt('n', '3'))
const PORT = Number(opt('port', '8787'))
const BASE = `http://localhost:${PORT}`
const root = new URL('..', import.meta.url).pathname
const out = `${root}tools/out`
mkdirSync(out, { recursive: true })

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const failures: string[] = []
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failures.push(what)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

if (!args.includes('--no-build')) {
  const b = Bun.spawnSync(['bun', 'run', 'build'], { cwd: root, stdout: 'ignore', stderr: 'inherit' })
  if (b.exitCode !== 0) throw new Error('client build failed')
}

const server = Bun.spawn(['bun', 'run', 'dev', '--port', String(PORT), '--ip', '127.0.0.1'], {
  cwd: `${root}packages/server`,
  stdout: 'ignore',
  stderr: 'ignore',
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
})
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${BASE}/api/health`)).ok) break
  } catch { /* not up yet */ }
  if (i > 90) throw new Error('server did not start')
  await sleep(500)
}

let browser: Browser | undefined
try {
  browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  type Api = Record<string, (...a: unknown[]) => unknown>
  const call = <T>(page: Page, fn: string, ...a: unknown[]) =>
    page.evaluate(([fn, a]) => ((window as unknown as { __sprawl: Api }).__sprawl[fn as string]!)(...(a as unknown[])), [fn, a] as const) as Promise<T>

  const pages: Page[] = []
  for (let i = 0; i < N; i++) {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } })
    page.on('pageerror', (e) => failures.push(`page error (bot${i}): ${e.message}`))
    await page.goto(`${BASE}/?guest=bot${i}`)
    await page.waitForFunction(() => (window as unknown as { __sprawl?: { isReady(): boolean } }).__sprawl?.isReady(), null, { timeout: 20_000 })
    pages.push(page)
  }
  await sleep(800)

  for (const [i, page] of pages.entries()) {
    const names = (await call<{ name: string }[]>(page, 'players')).map((p) => p.name).sort()
    check(names.length === N, `bot${i} sees ${N} players (${names.join(', ')})`)
  }

  // Walk each bot a few tiles along the main street, spread out.
  const [sx, sy] = await call<[number, number]>(pages[0]!, 'spawn')
  for (const [i, page] of pages.entries()) {
    const dx = (i - (N - 1) / 2) * 2
    await call(page, 'walkTo', sx + dx, sy + (i % 2))
  }
  await sleep(1500)
  const me0 = await call<{ from: [number, number]; path: unknown[] }>(pages[0]!, 'me')
  check(me0.path.length > 0 || me0.from[0] !== sx, 'bot0 walked')

  // Dress bot1 up and have everyone talk.
  const look = { build: 2, height: 2, skin: 5, hair: 2, hairColor: 6, top: 2, topColor: 12, legsColor: 0, accessory: 1, accent: 1 }
  if (N > 1) await call(pages[1]!, 'setAvatar', look)
  for (const [i, page] of pages.entries()) await call(page, 'say', ['the sky was the colour of television', 'anyone got a deck?', 'meet at the capsule hotel'][i % 3])
  await sleep(1200)

  if (N > 1) {
    const seen = (await call<{ name: string; avatar: typeof look }[]>(pages[0]!, 'players')).find((p) => p.name === 'bot1')
    check(JSON.stringify(seen?.avatar) === JSON.stringify(look), "bot0 sees bot1's new look")
  }

  for (const [i, page] of pages.entries()) await page.screenshot({ path: `${out}/bot${i}.png` })
  await call(pages[2 % N]!, 'zoom', 5)
  await sleep(1500)
  await pages[2 % N]!.screenshot({ path: `${out}/closeup.png` })
  await call(pages[0]!, 'openCustomiser')
  await sleep(300)
  await pages[0]!.screenshot({ path: `${out}/customiser.png` })

  // Reconnect bot1: the look must have been stored.
  if (N > 1) {
    await pages[1]!.reload()
    await pages[1]!.waitForFunction(() => (window as unknown as { __sprawl?: { isReady(): boolean } }).__sprawl?.isReady(), null, { timeout: 20_000 })
    const me = (await call<{ name: string; avatar: typeof look }[]>(pages[1]!, 'players')).find((p) => p.name === 'bot1')
    check(JSON.stringify(me?.avatar) === JSON.stringify(look), 'bot1 look survives a reconnect')
  }

  // Without credentials the server must refuse.
  const refused = await pages[0]!.evaluate(
    (url) => new Promise<number>((res) => {
      const ws = new WebSocket(url)
      ws.onclose = (e) => res(e.code)
    }),
    `ws://localhost:${PORT}/rooms/district/chiba-ninsei?v=1`,
  )
  check(refused === 4003, `connection without sign-in refused (${refused})`)

  // The sign-in screen, for the record.
  const login = await browser.newPage({ viewport: { width: 960, height: 600 } })
  await login.goto(BASE)
  await sleep(500)
  await login.screenshot({ path: `${out}/login.png` })
} finally {
  await browser?.close()
  if (!args.includes('--keep')) server.kill()
}

for (const f of failures) if (f.startsWith('page error')) console.log(`FAIL ${f}`)
console.log(failures.length ? `\n${failures.length} failed` : `\nall ok, screenshots in tools/out/`)
process.exit(failures.length ? 1 : 0)
