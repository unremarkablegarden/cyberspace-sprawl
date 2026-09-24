# Contributing

Issues and pull requests welcome. Start with [architecture.md](architecture.md).

## Ground rules

- **Readable over clever.** Plain TypeScript, small modules, comments that say
  *why*. No UI framework in the client.
- **Nothing may break the permanent world.** Read [operations.md](operations.md)
  before touching storage, migrations or world generation.
- **British English** in docs and on screen.
- Before a PR: `bun run typecheck && bun run test && bun run content:check`, and
  ideally `bun run bots`.
- User-visible changes get a line in `CHANGELOG.md`, following
  [style/changelog.md](style/changelog.md).

## Easy first contributions

- **Colours**: palettes in `packages/content/src/palettes.ts`.
- **Tile looks**: `packages/content/src/tiles.ts`.
- **Character parts**: a hair style or accessory is a name in
  `packages/shared/src/avatar.ts` plus a few boxes in
  `packages/client/src/render/character.ts`.
- **A new district**: a file in `packages/content/src/districts/` and a line in
  its `index.ts`. Pick a new seed; run `bun run content:check`.

## Where things are

| Want to change | Look in |
| --- | --- |
| What's sent over the wire | `packages/shared/src/protocol.ts`, then `docs/protocol.md` |
| How a district is laid out | `packages/shared/src/world/gen.ts` (new genVersion only!) |
| Server behaviour in a district | `packages/server/src/rooms/district.ts` |
| What a player owns | `packages/server/src/rooms/player.ts` |
| How the city is drawn | `packages/client/src/render/` |
| Screens and panels | `packages/client/src/ui/` |
