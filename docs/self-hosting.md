# Running your own Sprawl

Everything runs on Cloudflare's developer platform; a free account is enough.

1. Fork the repo, `bun install`, `bun run build`.
2. `cd packages/server && npx wrangler login && npx wrangler deploy`.
3. You get `https://cyberspace-sprawl.<you>.workers.dev`.

## Sign-in

As shipped, sign-in uses cyberspace accounts (`packages/server/src/auth.ts` and
`packages/client/src/net/api.ts`). To use your own Firebase project, change
`FIREBASE_PROJECT_ID` in `packages/server/src/env.ts`, point `API_URL` in
`packages/client/src/config.ts` at an endpoint that returns Firebase tokens, and
make sure each user can read their own `users/{uid}` document with a `username`
field. Other identity providers mean replacing `authenticate()`; the rest of
the server only sees an `Identity { uid, name, staff }`.

## Your own world

Change the district `seed` values in `packages/content/src/districts/` before
your first deploy, and your city will be different from ours.
