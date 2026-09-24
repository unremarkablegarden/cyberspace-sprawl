# Architecture

```
browser ──https──▶ Worker ──static──▶ built client (packages/client/dist)
   │                  │
   └──wss /rooms/district/<id>──▶ Worker checks sign-in ──▶ District (Durable Object)
                                                                   │ RPC
                                                                   ▼
                                                            Player (Durable Object, one per account)
```

## Pieces

- **Worker** (`packages/server/src/index.ts`) serves the client, checks who is
  connecting, and forwards WebSockets to rooms. It holds no state.
- **Room** (`packages/server/src/room.ts`) is the base class for Durable Objects
  that hold WebSockets. It uses Cloudflare's *hibernation* API: an idle room is
  unloaded from memory even while players are connected, and woken by the next
  message. Per-connection state rides along with each socket. The design follows
  partyserver by the PartyKit team, trimmed and written out in full.
- **District** (`rooms/district.ts`): one per district. Presence, walking, chat.
- **Player** (`rooms/player.ts`): one per account. Character, last position;
  later inventory, wallet, home. Only other rooms talk to it.

## The world is generated, not stored

`generateDistrict(spec)` in `packages/shared/src/world/gen.ts` builds the whole
base layout from a seed. Client and server both run it and get the same city.
Storage only ever holds changes players make. A released generator version is
frozen by a golden-hash test (`gen.test.ts`): changing it would move buildings
in a world that is meant to last. New generation ideas go in a new version.

## Movement

Tile-based and server-authoritative, with no game loop on the server. A client
asks to walk to a tile; the district finds a path from where the player is right
now and broadcasts the path with its start time. Every client animates it at the
shared `WALK_SPEED`. Anyone's position at any moment can be computed from
`(from, path, t0)`, so the server does nothing between messages and the room can
sleep.

## Storage

Each Durable Object has its own SQLite database. It is the source of truth:
changes are written before they are acknowledged, and memory is only a cache
rebuilt on wake. Schema changes go through `migrate()` in `sql.ts`, append-only.

## Sign-in

Cyberspace accounts are Firebase accounts. The browser signs in against the
cyberspace API and gets a Firebase ID token; the Worker verifies it against
Google's public keys, then reads the player's own profile document with that
token (rules allow self-reads) for their username, ban status and staff role.
No service-account key exists anywhere in this project.

## Client

Vanilla TypeScript and three.js. `render/` draws (camera, pixel pass, city,
characters, rain), `world/` tracks players, `input/` turns clicks and keys into
walks, `ui/` is plain DOM, `net/` is sign-in and a reconnecting socket.
`game.ts` wires one session together.
