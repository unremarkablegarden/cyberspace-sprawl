# The Sprawl

A multiplayer city for [cyberspace](https://cyberspace.online) members. Walk the
wet streets of Chiba, talk to whoever is out, dress your character. Soon:
scavenge, craft, trade and build a home, in a world that never resets.

Think Animal Crossing's daily rhythm, set in William Gibson's Sprawl, drawn as
chunky low-res 3D pixel art.

Live at **sprawl.cyberspace.online** (sign in with your cyberspace account).

- [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md)
- [Game design](docs/design.md) · [Architecture](docs/architecture.md) · [Protocol](docs/protocol.md)
- [Contributing](docs/contributing.md) · [Deploying](docs/deploy.md) · [Operations](docs/operations.md) · [Self-hosting](docs/self-hosting.md)

## Layout

| Path | What |
| --- | --- |
| `packages/shared` | Protocol, pathfinding, seeded world generation, character spec. Used by both sides. |
| `packages/content` | Districts, palettes, tile looks. Data you can add to without touching engine code. |
| `packages/server` | Cloudflare Worker and Durable Objects: sign-in, rooms, storage. |
| `packages/client` | The game in the browser: three.js, vanilla TypeScript, no UI framework. |
| `tools` | Dev server launcher and headless bot players for testing. |

## Development

Needs [Bun](https://bun.sh).

```sh
bun install
cp packages/server/.dev.vars.example packages/server/.dev.vars
bun run dev          # client on :5173, server on :8787
```

Open <http://localhost:5173/?guest=yourname> to play without an account (local
only). Open it in a second window with another name to see multiplayer.

```sh
bun run test         # unit tests, including frozen world-generation hashes
bun run typecheck
bun run content:check
bun run bots         # builds, starts a local server, runs 3 headless players, saves screenshots
```

## Licence

MIT. See [LICENSE](LICENSE).
