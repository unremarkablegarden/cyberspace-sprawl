// Entry point: sign in (or resume), then enter the starting district.
// `?guest=<name>` skips sign-in, and works only against a local dev server.

import './ui/style.css'
import { API_URL } from './config.ts'
import { Auth } from './net/api.ts'
import { Game, type Session } from './game.ts'
import { showLogin } from './ui/login.ts'

const root = document.getElementById('app')!
const guest = new URLSearchParams(location.search).get('guest')
const auth = new Auth(API_URL)
let game: Game | null = null

function enter(session: Session): void {
  game?.stop()
  game = new Game(root, session)
}

const signedIn: Session = {
  async credentials(renew) {
    const token = await auth.token(renew)
    if (!token) throw new Error('signed out')
    return `token=${encodeURIComponent(token)}`
  },
  signOut(reason) {
    auth.logout()
    game?.stop()
    game = null
    login(reason)
  },
}

function login(notice = ''): void {
  const close = showLogin(root, async (email, password) => {
    await auth.login(email, password)
    close()
    enter(signedIn)
  }, notice)
}

if (guest !== null) {
  enter({
    credentials: async () => `guest=${encodeURIComponent(guest)}`,
    signOut: (reason) => {
      game?.stop()
      root.textContent = reason ?? 'signed out'
    },
  })
} else if (await auth.resume()) {
  enter(signedIn)
} else {
  login()
}
