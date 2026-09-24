// The sign-in screen. Cyberspace accounts only; new accounts are made on the site.

import { VERSION } from '../config.ts'
import { h } from './dom.ts'

export function showLogin(
  root: HTMLElement,
  submit: (email: string, password: string) => Promise<void>,
  notice = '',
): () => void {
  const email = h('input', { type: 'email', name: 'email', autocomplete: 'username', placeholder: 'email', required: true })
  const password = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', placeholder: 'password', required: true })
  const status = h('p.status', {}, notice)
  const button = h('button', { type: 'submit' }, 'jack in')
  const form = h(
    'form.login',
    {},
    h('h1', {}, 'THE SPRAWL'),
    h('p.dim', {}, 'Sign in with your cyberspace account.'),
    email,
    password,
    button,
    status,
    h('p.dim.small', {}, 'No account? ', h('a', { href: 'https://cyberspace.online', target: '_blank', rel: 'noopener' }, 'cyberspace.online'), ` · v${VERSION}`),
  )
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    button.disabled = true
    status.textContent = 'connecting…'
    try {
      await submit(email.value.trim(), password.value)
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : 'sign-in failed'
      button.disabled = false
    }
  })
  const screen = h('div.screen', {}, form)
  root.append(screen)
  email.focus()
  return () => screen.remove()
}
