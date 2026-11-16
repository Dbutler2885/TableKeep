/**
 * A map token is a <button>, drawn as nothing but its cut-out image. The Lubec
 * skin paints every button in a Lubec campaign cream, and that rule outranks
 * `.map-token { background: transparent }`, so a token without this exclusion
 * shows as a cream tile on a Lubec map while the same image is cut out on an
 * OSE or VtM map.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(resolve(__dirname, '../../App.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// Every rule whose selector list styles a bare button under the Lubec theme:
// `button` followed by nothing or a pseudo-class, not `button.some-class`.
const lubecBareButtonRules = () =>
  [...appCss.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .map(([, selectors, body]) => ({ selectors: selectors.trim(), body }))
    .filter(({ selectors }) =>
      selectors.split(',').some((selector) => /\.shell-root\[data-theme="lubec"\]\s+button(?![-\w.#[])/.test(selector.trim())),
    )

describe('the Lubec skin and map tokens', () => {
  it('finds the skin rules it guards', () => {
    expect(lubecBareButtonRules().length).toBeGreaterThan(0)
  })

  it('never gives a map token a background', () => {
    const offending = lubecBareButtonRules()
      .filter(({ body }) => /\bbackground(-color)?\s*:/.test(body))
      .filter(({ selectors }) => !selectors.includes(':not(.map-token)'))
      .map(({ selectors }) => selectors)
    expect(offending).toEqual([])
  })
})
