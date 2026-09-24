// Who is connecting. Cyberspace accounts are Firebase accounts, so a client
// proves itself with a Firebase ID token (from the cyberspace sign-in). We
// check its signature against Google's public keys, then read the user's own
// profile document with that same token to learn their username and whether
// they are banned or staff. No service-account key is involved: Firestore's
// rules let every signed-in user read their own document.
//
// Everything fails closed: any error means "not signed in".

import { createRemoteJWKSet, jwtVerify } from 'jose'
import { cleanText, NAME_MAX_LEN } from '@sprawl/shared'
import { FIREBASE_PROJECT_ID, type Env } from './env.ts'
import type { Identity } from './room.ts'

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`

export async function verifyFirebaseToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
      algorithms: ['RS256'],
    })
    // Cyberspace refuses unverified addresses everywhere else too.
    if (!payload.sub || payload.email_verified !== true) return null
    return payload.sub
  } catch {
    return null
  }
}

type Fields = Record<string, { stringValue?: string; booleanValue?: boolean }>

/** The user's own `users/{uid}` document, or null if it can't be read. */
async function readProfile(uid: string, token: string): Promise<Fields | null> {
  try {
    const res = await fetch(`${FIRESTORE}/users/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return ((await res.json()) as { fields?: Fields }).fields ?? {}
  } catch {
    return null
  }
}

export type AuthResult = { ok: true; identity: Identity } | { ok: false; reason: string }

export async function authenticate(request: Request, env: Env): Promise<AuthResult> {
  const url = new URL(request.url)

  const guest = url.searchParams.get('guest')
  if (guest !== null) return guestIdentity(guest, url, env)

  const token = url.searchParams.get('token')
  if (!token) return { ok: false, reason: 'sign in required' }
  const uid = await verifyFirebaseToken(token)
  if (!uid) return { ok: false, reason: 'session expired' }

  const f = await readProfile(uid, token)
  if (!f) return { ok: false, reason: 'profile unavailable' }
  if (f.isBanned?.booleanValue === true) return { ok: false, reason: 'account suspended' }
  const username = f.username?.stringValue
  if (!username) return { ok: false, reason: 'profile unavailable' }

  return {
    ok: true,
    identity: {
      uid,
      name: cleanText(username, NAME_MAX_LEN),
      staff: f.isSiteAdmin?.booleanValue === true || f.isModerator?.booleanValue === true,
    },
  }
}

/**
 * Local development only: `?guest=<name>` signs in without an account, so the
 * game can be run and tested offline. Needs DEV_GUEST=1 (set only in
 * .dev.vars, never in wrangler.jsonc) AND a localhost request.
 */
function guestIdentity(raw: string, url: URL, env: Env): AuthResult {
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (env.DEV_GUEST !== '1' || !local) return { ok: false, reason: 'guests are not allowed here' }
  const name = cleanText(raw, 20).replace(/[^\w-]/g, '') || 'guest'
  return { ok: true, identity: { uid: `guest-${name}`, name, staff: false } }
}
