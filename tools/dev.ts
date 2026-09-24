// `bun run dev`: the server (wrangler, :8787) and the client (Vite, :5173)
// together. Vite forwards /rooms and /api to wrangler. Ctrl-C stops both.
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'

const root = new URL('..', import.meta.url).pathname
const server = `${root}packages/server`

// wrangler refuses to start without the assets folder; an empty one is fine in dev.
mkdirSync(`${root}packages/client/dist`, { recursive: true })
if (!existsSync(`${server}/.dev.vars`)) {
  copyFileSync(`${server}/.dev.vars.example`, `${server}/.dev.vars`)
  console.log('dev: created packages/server/.dev.vars from the example')
}

const procs = [
  Bun.spawn(['bun', 'run', 'dev', '--port', '8787'], { cwd: server, stdout: 'inherit', stderr: 'inherit' }),
  Bun.spawn(['bun', 'run', 'dev'], { cwd: `${root}packages/client`, stdout: 'inherit', stderr: 'inherit' }),
]
const stop = () => { for (const p of procs) p.kill(); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
console.log('dev: open http://localhost:5173/?guest=yourname')
await Promise.race(procs.map((p) => p.exited))
stop()
