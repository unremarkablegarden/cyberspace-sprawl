# Deploying

The whole game is one Cloudflare Worker (`packages/server`) that also serves the
built client. Durable Objects hold the world. The Workers **Free** plan is
enough to start (see [operations.md](operations.md) for the limits).

## One-time setup

1. **Connect the repo.** Cloudflare dashboard → Workers & Pages → Create →
   Import a repository → `cyberspace-sprawl`. Then under the Worker's Settings →
   Builds:
   - Root directory: `packages/server`
   - Build command: `cd ../.. && bun install && bun run build`
   - Deploy command: `npx wrangler deploy`
   - Production branch: `main`
   - Enable preview builds for other branches. The preview command
     (`npx wrangler preview`) gives every branch its own URL.
2. **Custom domain.** Already in `wrangler.jsonc` (`routes`, `custom_domain`):
   the first deploy creates the DNS record and certificate. The
   `cyberspace.online` zone must be on the same Cloudflare account, and there
   must be no existing `sprawl` DNS record.
3. **Check it.** `https://sprawl.cyberspace.online/api/health` should answer
   `{"ok":true,…}`, and the page should offer the cyberspace sign-in.

Without the dashboard: `cd packages/server && npx wrangler login && npx wrangler deploy`
after `bun run build` at the root.

## Branch previews

Each non-`main` branch gets a preview at `<branch>.sprawl.cyberspace.online`
(the Worker's Domains tab has `sprawl.cyberspace.online` enabled for
Production and Preview), so the `dev` branch is always at
`dev.sprawl.cyberspace.online`. Cloudflare issues the wildcard certificate
after the first preview build; until then the name fails with a TLS error. **Each preview has its own empty Durable Object
storage**, so testing a branch can never touch the live world.
Previews are public by default; put Cloudflare Access in front if that matters.
Guest sign-in doesn't work on previews (it is localhost-only), so sign in with
a real cyberspace account.

## What never to do

- Never add a `deleted_classes` or `renamed_classes` migration for `District`
  or `Player` in `wrangler.jsonc`. It deletes or moves stored world data.
- Never set `DEV_GUEST` anywhere but a local `.dev.vars`.
