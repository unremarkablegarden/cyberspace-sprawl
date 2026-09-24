type TagOf<S extends string> = S extends `${infer T}.${string}` ? T : S
type ElementOf<S extends string> = TagOf<S> extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[TagOf<S>] : HTMLElement

/** Tiny element builder: h('div.panel', { onclick }, 'text', child). */
export function h<S extends string>(
  tagAndClass: S,
  props: Partial<Record<string, unknown>> = {},
  ...children: (Node | string | null | undefined | false)[]
): ElementOf<S> {
  const [tag, ...classes] = tagAndClass.split('.') as [string, ...string[]]
  const el = document.createElement(tag)
  if (classes.length) el.className = classes.join(' ')
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener)
    else if (v === true) el.setAttribute(k, '')
    else if (v !== undefined && v !== false) el.setAttribute(k, String(v))
  }
  for (const c of children) if (c) el.append(c)
  return el as ElementOf<S>
}
