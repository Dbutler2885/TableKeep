const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'UL', 'OL', 'LI', 'P', 'BR'])

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

export function sanitizeRichText(input: string): string {
  if (!input.trim()) return ''
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return escapeHtml(input)
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${input}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return ''

  const sanitizeNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml(node.textContent ?? '')
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const element = node as HTMLElement
    const tagName = element.tagName.toUpperCase()
    const children = Array.from(element.childNodes).map(sanitizeNode).join('')

    if (!ALLOWED_TAGS.has(tagName)) return children
    if (tagName === 'BR') return '<br />'
    const normalizedTag = tagName.toLowerCase() === 'b' ? 'strong' : tagName.toLowerCase() === 'i' ? 'em' : tagName.toLowerCase()
    return `<${normalizedTag}>${children}</${normalizedTag}>`
  }

  return Array.from(root.childNodes).map(sanitizeNode).join('')
}

export function richTextToPlainText(input: string): string {
  if (!input.trim()) return ''
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return input
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${input}</div>`, 'text/html')
  return doc.body.textContent ?? ''
}
