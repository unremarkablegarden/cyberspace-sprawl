// The character panel: step through each option or pick a colour, see the
// change on your character at once, and save it for everyone to see.

import { AVATAR_FIELDS, avatarLimit, randomAvatar, type AvatarSpec } from '@sprawl/shared'
import { CLOTH, HAIR, NEON, SKIN } from '@sprawl/content'
import { OPTION_LABELS } from '../render/character.ts'
import { h } from './dom.ts'

const LABELS: Record<keyof AvatarSpec, string> = {
  build: 'build', height: 'height', skin: 'skin', hair: 'hair', hairColor: 'hair colour',
  top: 'top', topColor: 'top colour', legsColor: 'trousers', accessory: 'wearing', accent: 'neon trim',
}

const PALETTES: Partial<Record<keyof AvatarSpec, readonly number[]>> = {
  skin: SKIN, hairColor: HAIR, topColor: CLOTH, legsColor: CLOTH, accent: NEON,
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

export class Customiser {
  readonly el: HTMLElement
  #spec: AvatarSpec
  #rows = new Map<keyof AvatarSpec, HTMLElement>()

  constructor(
    initial: AvatarSpec,
    private preview: (spec: AvatarSpec) => void,
    private save: (spec: AvatarSpec) => void,
    private close: () => void,
  ) {
    this.#spec = { ...initial }
    const body = h('div.fields')
    for (const field of AVATAR_FIELDS) {
      const row = h('div.field')
      this.#rows.set(field, row)
      body.append(h('div.row', {}, h('label', {}, LABELS[field]), row))
    }
    this.el = h(
      'div.panel.customiser',
      {},
      h('h2', {}, 'your look'),
      body,
      h(
        'div.actions',
        {},
        h('button.ghost', { type: 'button', onclick: () => this.#set(randomAvatar(Math.random)) }, 'random'),
        h('button.ghost', { type: 'button', onclick: () => this.close() }, 'cancel'),
        h('button', { type: 'button', onclick: () => this.save({ ...this.#spec }) }, 'save'),
      ),
    )
    this.#render()
  }

  #set(spec: AvatarSpec): void {
    this.#spec = spec
    this.preview({ ...spec })
    this.#render()
  }

  #render(): void {
    for (const [field, row] of this.#rows) {
      const palette = PALETTES[field]
      const value = this.#spec[field]
      if (palette) {
        row.replaceChildren(
          ...palette.map((c, i) =>
            h(`button.swatch${i === value ? '.on' : ''}`, {
              type: 'button', style: `background:${hex(c)}`, 'aria-label': `${LABELS[field]} ${i + 1}`,
              onclick: () => this.#set({ ...this.#spec, [field]: i }),
            }),
          ),
        )
      } else {
        const names = OPTION_LABELS[field as keyof typeof OPTION_LABELS]
        const n = avatarLimit(field)
        const step = (d: number) => this.#set({ ...this.#spec, [field]: (value + d + n) % n })
        row.replaceChildren(
          h('button.step', { type: 'button', onclick: () => step(-1), 'aria-label': 'previous' }, '‹'),
          h('span.value', {}, names?.[value] ?? String(value)),
          h('button.step', { type: 'button', onclick: () => step(1), 'aria-label': 'next' }, '›'),
        )
      }
    }
  }
}
