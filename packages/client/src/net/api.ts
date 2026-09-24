// Sign-in against the cyberspace API, trimmed from the API client in
// cyberspace-terminal. The API returns Firebase tokens; the ID token proves
// who we are to the game server, and the refresh token keeps the session
// across visits.

const STORAGE_KEY = 'sprawl.refreshToken'

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message)
  }
}

interface Envelope<T> {
  data?: T
  error?: { code?: string; message?: string }
}

export class Auth {
  #idToken: string | null = null
  #refreshToken: string | null = null

  constructor(private base: string) {
    try { this.#refreshToken = localStorage.getItem(STORAGE_KEY) } catch { /* private mode */ }
  }

  get hasSavedSession(): boolean {
    return this.#refreshToken !== null
  }

  async login(email: string, password: string): Promise<void> {
    const r = await this.#post<{ idToken: string; refreshToken: string }>('/v1/auth/login', { email, password })
    this.#set(r.idToken, r.refreshToken)
  }

  /** Silent resume from a saved refresh token. Returns false if there is none or it has lapsed. */
  async resume(): Promise<boolean> {
    if (!this.#refreshToken) return false
    try {
      await this.#refresh()
      return true
    } catch {
      this.logout()
      return false
    }
  }

  /** A current ID token. `renew` forces a refresh, e.g. after the server said it expired. */
  async token(renew = false): Promise<string | null> {
    if ((renew || !this.#idToken) && this.#refreshToken) await this.#refresh().catch(() => this.logout())
    return this.#idToken
  }

  logout(): void {
    this.#idToken = null
    this.#refreshToken = null
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* private mode */ }
  }

  async #refresh(): Promise<void> {
    const r = await this.#post<{ idToken: string; refreshToken?: string }>('/v1/auth/refresh', { refreshToken: this.#refreshToken })
    this.#set(r.idToken, r.refreshToken ?? this.#refreshToken!)
  }

  #set(idToken: string, refreshToken: string): void {
    this.#idToken = idToken
    this.#refreshToken = refreshToken
    try { localStorage.setItem(STORAGE_KEY, refreshToken) } catch { /* private mode */ }
  }

  async #post<T>(path: string, body: unknown): Promise<T> {
    let res: Response
    try {
      res = await fetch(this.base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new ApiError('OFFLINE', 'no carrier', 0)
    }
    const json = (await res.json().catch(() => null)) as Envelope<T> | null
    if (!res.ok || !json?.data) {
      throw new ApiError(json?.error?.code ?? 'ERROR', json?.error?.message ?? `${res.status} ${res.statusText}`, res.status)
    }
    return json.data
  }
}
