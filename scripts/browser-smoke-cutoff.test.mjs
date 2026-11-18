import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { readPageCutOff } from './browser-smoke.mjs'

// Keep the smoke module in Node and give only the reader a DOM. JSDOM lays
// nothing out, so each element's right edge comes from its `data-right`.
const dom = new JSDOM()
const { document, HTMLElement } = dom.window
HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { right: Number(this.dataset.right ?? 0) }
}
HTMLElement.prototype.checkVisibility = function checkVisibility() {
  return !this.hidden
}

afterEach(() => document.body.replaceChildren())
afterAll(() => dom.window.close())

const panelWith = (html) => {
  document.body.innerHTML = `<section class="content-panel" data-right="1000">${html}</section>`
  return document.querySelector('.content-panel')
}

describe('finding what is cut off at the page edge in the browser smoke', () => {
  it('finds nothing when everything ends inside the page', () => {
    expect(readPageCutOff(panelWith('<div data-right="990"><p data-right="1001"></p></div>'))).toBeNull()
  })

  it('names the first shown element that runs past the page edge, and where', () => {
    const panel = panelWith('<div class="lubec-sheet core" data-right="1094"><button class="switch" data-right="1541"></button></div>')

    expect(readPageCutOff(panel)).toEqual({ element: 'div.lubec-sheet', right: 1094, edge: 1000 })
  })

  it('passes over hidden elements and anything inside a sideways scroller', () => {
    const panel = panelWith(`
      <p hidden data-right="1400"></p>
      <div style="overflow-x: auto" data-right="1000"><table data-right="1800"></table></div>
      <div data-right="1000"><span class="past" data-right="1020"></span></div>`)

    expect(readPageCutOff(panel)).toEqual({ element: 'span.past', right: 1020, edge: 1000 })
  })
})
