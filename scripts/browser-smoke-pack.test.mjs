import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { expectLubecPackArt } from './browser-smoke.mjs'

const dom = new JSDOM()
const { document } = dom.window

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})
afterAll(() => dom.window.close())

describe('waiting for the chosen backpack picture in the browser smoke', () => {
  it.each([
    ['', false],
    ['<span class="pack-art"></span>', false],
    ['<span class="pack-art" style="background-image: url(/assets/navy-stripe.webp)"></span>', false],
    ['<span class="pack-art" style="background-image: url(/assets/tealish.webp)"></span>', false],
    ['<span class="pack-art" style="background-image: url(/assets/teal.webp)"></span>', true],
    ['<span class="pack-art" style="background-image: url(/assets/teal-Ab123.webp)"></span>', true],
  ])('reads %s as the selected teal picture: %s', async (markup, expected) => {
    document.body.innerHTML = `<div class="shell-root" data-theme="lubec"><div class="lubec-sheet"><div class="lubec-gear">${markup}</div></div></div>`
    vi.stubGlobal('document', document)
    const page = { waitForFunction: async (read, _options, ...args) => read(...args) }

    await expect(expectLubecPackArt(page, 'teal')).resolves.toBe(expected)
  })
})
