import changelog from '../../../CHANGELOG.md?raw'

/** The cyberspace API, where sign-in happens. */
export const API_URL = 'https://api.cyberspace.online'

/** The last `## vX.Y` heading in CHANGELOG.md is the release. */
export const VERSION = [...changelog.matchAll(/^## v([\d.]+)/gm)].at(-1)?.[1] ?? '0.0'

/** Low-resolution render scale: 3 means each game pixel is 3×3 screen pixels. */
export const PIXEL_SCALE = 3
