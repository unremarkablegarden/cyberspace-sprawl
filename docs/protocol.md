# Protocol

WebSocket at `/rooms/district/<district-id>?v=<PROTOCOL_VERSION>&token=<firebase-id-token>`.
JSON text frames, one message each, discriminated by `t`. The types live in
`packages/shared/src/protocol.ts`; this page explains them.

## Client → server

| `t` | Fields | |
| --- | --- | --- |
| `move` | `to: [x, y]` | Walk to a tile. Ignored if unreachable or sent faster than every 90 ms. |
| `chat` | `text` | Up to 160 characters, at most one every 700 ms. |
| `avatar` | `avatar` | Replace your character. Saved before it's broadcast. |
| `ping` | `c` | Echoed back with the server time, for clock sync. |

## Server → client

| `t` | Fields | |
| --- | --- | --- |
| `welcome` | `you, district, players, chat, now` | First message: everyone here, recent chat, server time. |
| `join` / `leave` | `p` / `id` | Someone arrived or went. |
| `path` | `id, from, path, t0` | Someone set off walking (you included). |
| `chat` | `line` | Someone spoke. |
| `avatar` | `id, avatar` | Someone changed their look. |
| `pong` | `c, now` | Reply to `ping`. |
| `error` | `code, msg` | Something went wrong server-side. |

## Close codes

| Code | Meaning | Client does |
| --- | --- | --- |
| 4001 | Signed in elsewhere | Stops; offers reload |
| 4003 | Refused (not signed in, banned, unknown room) | Back to sign-in, showing the reason |
| 4004 | Protocol version mismatch | Asks for a reload |
| other | Network trouble | Reconnects with backoff |

## Position

A player's position at server time `t` is `positionAt(from, path, t0, WALK_SPEED, t)`
from `packages/shared/src/grid.ts`. Clients keep a clock offset from `welcome`
and `pong` so they agree with the server.
