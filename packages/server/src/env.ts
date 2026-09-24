import type { District } from './rooms/district.ts'
import type { Player } from './rooms/player.ts'

export interface Env {
  DISTRICT: DurableObjectNamespace<District>
  PLAYER: DurableObjectNamespace<Player>
  ASSETS: Fetcher
  /** "1" enables guest sign-in from localhost. Only ever set in .dev.vars. */
  DEV_GUEST?: string
}

/** Public, and also in every cyberspace client bundle. */
export const FIREBASE_PROJECT_ID = 'cyberspace-cyberspace'
export const CYBERSPACE_API = 'https://api.cyberspace.online'
