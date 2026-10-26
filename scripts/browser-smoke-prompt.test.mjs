import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { emptyRevolverPromptProblems, readLubecGearPrompt } from './browser-smoke.mjs'

// Keep the smoke module in Node, with its real file URLs, and give only the prompt reader a DOM.
const dom = new JSDOM()
const { document } = dom.window

afterEach(() => document.body.replaceChildren())
afterAll(() => dom.window.close())

describe('reading the empty-weapon prompt in the browser smoke', () => {
  it('reads its rendered title, refusal and red action with its dispensation line', () => {
    document.body.innerHTML = `<div role="dialog">
      <h2>.38 revolver isn't loaded</h2>
      <p class="prompt-text">Your other hand holds Flashlight. It needs to hold the .38 rounds, or be empty to fetch them.</p>
      <div class="actions">
        <button class="btn line">Cancel</button><button class="btn">Reload</button>
        <button class="btn dispensation">Reload &amp; fire<small>Requires special dispensation</small></button>
      </div>
    </div>`
    const shown = readLubecGearPrompt(document.querySelector('[role="dialog"]'))
    expect(shown).toEqual({
      title: ".38 revolver isn't loaded",
      text: 'Your other hand holds Flashlight. It needs to hold the .38 rounds, or be empty to fetch them.',
      buttons: ['Cancel', 'Reload', 'Reload & fireRequires special dispensation (red)'],
    })
    expect(emptyRevolverPromptProblems(shown)).toEqual([])
  })

  it('reports incomplete prompt markup as a smoke failure instead of crashing the reader', () => {
    document.body.innerHTML = '<div role="dialog"><button>Close</button></div>'
    const shown = readLubecGearPrompt(document.querySelector('[role="dialog"]'))
    expect(shown).toEqual({ title: undefined, text: undefined, buttons: [] })
    expect(emptyRevolverPromptProblems(shown)).toEqual(['the empty-weapon prompt shows {"buttons":[]}'])
  })
})
