import { VERSION } from '../config.ts'
import { h } from './dom.ts'

export class Hud {
  readonly el: HTMLElement
  #place = h('span.place')
  #count = h('span.dim')
  #status = h('div.status')

  constructor(actions: { customise: () => void; signOut: () => void }) {
    this.el = h(
      'div.hud',
      {},
      h('div.left', {}, this.#place, ' ', this.#count),
      h(
        'div.right',
        {},
        h('button.ghost', { type: 'button', onclick: actions.customise }, 'look'),
        h('button.ghost', { type: 'button', onclick: actions.signOut }, 'sign out'),
        h('span.dim.small', {}, `v${VERSION}`),
      ),
      this.#status,
    )
  }

  place(name: string): void {
    this.#place.textContent = name
  }
  count(n: number): void {
    this.#count.textContent = n === 1 ? '· just you' : `· ${n} here`
  }
  status(text: string): void {
    this.#status.textContent = text
    this.#status.style.display = text ? '' : 'none'
  }
}
