# Operations

## Permanence

The world is meant to last forever, so:

- **Each room's SQLite is the source of truth.** Changes are written before
  they're acknowledged. Memory is a cache rebuilt when a room wakes, so a
  crash, an eviction or a redeploy loses nothing that was confirmed.
- **Schema changes are append-only**, through `migrate()` in
  `packages/server/src/sql.ts`. Add a step; never edit, remove or reorder one;
  never drop a table that holds player data.
- **Durable Object classes are never renamed or deleted** (see deploy.md).
- **Released world generation is frozen.** `packages/shared/src/world/gen.test.ts`
  pins each `genVersion` with a hash. If it fails, you changed a live city.
  Revert and add a new version instead.

## Backups

1. Cloudflare stores Durable Object SQLite durably and replicated.
2. **Point-in-time recovery**: any Durable Object can be restored to any moment
   in the last 30 days (`ctx.storage.getBookmarkForTime()` and
   `onNextSessionRestoreBookmark()`). Nothing to switch on.
3. **Our own exports** (planned, see ROADMAP): a nightly job writing every room's
   state to R2 as gzipped JSON. Rooms already expose `exportState()` for this.
   It guards against our own mistakes, lets the world move between accounts,
   and gives self-hosters something to start from.

## Sleeping costs nothing

Rooms use WebSocket hibernation: when nothing is happening they are unloaded
from memory even with players connected, and billing stops. Keep it that way:

- **No `setInterval` or `setTimeout` loops in Durable Objects.** A running timer
  keeps a room awake and billed around the clock. Timed work goes through a
  Durable Object alarm (one alarm per object, so multiplex through one helper).
- Movement is sent as paths, not per frame. Positions are stored when a player
  leaves, not as they walk.
- A future physics tick must run only while someone is in the room.

## Limits and cost

Figures from Cloudflare's docs as of September 2026; check the current pricing
pages before relying on them.

**Workers Free** (per account, shared with anything else on it, resets 00:00 UTC):

| | Per day |
| --- | --- |
| Durable Object requests | 100,000 (incoming WebSocket messages count 20:1; outgoing are free) |
| Durable Object awake time | 13,000 GB-s (about 29 room-hours) |
| SQLite rows written / read | 100,000 / 5,000,000 |
| Storage | 5 GB total |
| Worker CPU | 10 ms per request (Durable Objects get 30 s) |

On the free plan, going over a limit makes calls **fail** until midnight UTC.
Nothing is billed, but the game stops. Watch usage under Workers & Pages →
the Worker → Metrics, and under Durable Objects in the dashboard.

**Workers Paid** is $5/month and includes 1M requests, 400,000 GB-s and 5 GB
storage a month, then $0.15 per million requests, $12.50 per million GB-s and
$0.20 per GB-month. Move to Paid when an ordinary day passes about half of any
free limit. It's a plan change, not a code change.
