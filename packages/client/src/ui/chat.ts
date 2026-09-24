// Chat: a short log of recent lines and an input. Enter to talk, Esc to stop.

import { CHAT_MAX_LEN, type ChatLine } from '@sprawl/shared'
import { h } from './dom.ts'

const MAX_LINES = 8

export class Chat {
  readonly el: HTMLElement
  #log: HTMLElement
  #input: HTMLInputElement

  constructor(send: (text: string) => void) {
    this.#log = h('div.log')
    this.#input = h('input.say', { maxlength: CHAT_MAX_LEN, placeholder: 'Enter to talk', 'aria-label': 'chat' })
    this.el = h('div.chat', {}, this.#log, this.#input)
    this.#input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = this.#input.value.trim()
        if (text) send(text)
        this.#input.value = ''
        this.#input.blur()
      } else if (e.key === 'Escape') this.#input.blur()
      e.stopPropagation()
    })
    addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.activeElement !== this.#input && !(document.activeElement instanceof HTMLInputElement)) {
        e.preventDefault()
        this.#input.focus()
      }
    })
  }

  add(line: ChatLine, mine: boolean): void {
    const row = h('div.line', {}, h(`span.who${mine ? '.me' : ''}`, {}, line.name), ' ', line.text)
    this.#log.append(row)
    while (this.#log.children.length > MAX_LINES) this.#log.firstChild!.remove()
  }

  system(text: string): void {
    this.#log.append(h('div.line.sys', {}, text))
    while (this.#log.children.length > MAX_LINES) this.#log.firstChild!.remove()
  }

  clear(): void {
    this.#log.replaceChildren()
  }
}
