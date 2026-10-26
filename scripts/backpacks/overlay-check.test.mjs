// Pins the overlay check page to the slots the Gear tab ships, and its tiles to the prepare report.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import slots from '../../src/features/lubec/gear/backpackSlots.json'
import { CROPS, lubecPackLayout } from '../../src/features/lubec/gear/backpackSlots'
import { MARGIN_FLAG, boxesHtml, marginFlagged, packLayout, pageHtml, tileHtml, writeOverlayCheck } from './overlay-check.mjs'

const row = (short, left, right) => ({ short, file: `${short}.png`, original: '1122x1402', box: '1080x1120+21+111', scale: 0.975, width: 1053, left, right })

describe('the overlay check page', () => {
  it('places the boxes exactly where the Gear tab does, for both crops', () => {
    expect(packLayout(slots, slots.crops.wide)).toEqual(lubecPackLayout(CROPS.wide))
    expect(packLayout(slots, slots.crops.phone)).toEqual(lubecPackLayout(CROPS.phone))
  })

  it('draws five main boxes, two front boxes, the small-stuff pill and both zone labels', () => {
    const html = boxesHtml(packLayout(slots, slots.crops.wide))
    expect(html.match(/class="slot item"/g)).toHaveLength(5)
    expect(html.match(/class="slot item pocket"/g)).toHaveLength(2)
    expect(html.match(/class="small-stuff"/g)).toHaveLength(1)
    expect(html.match(/class="zone-label"/g)).toHaveLength(2)
    expect(html).toContain('Box of .38 rounds')
  })

  it('flags a pack with less than 10 pixels of canvas on either side', () => {
    expect(MARGIN_FLAG).toBe(10)
    expect(marginFlagged(row('a', 10, 10))).toBe(false)
    expect(marginFlagged(row('b', 9, 30))).toBe(true)
    expect(marginFlagged(row('c', 30, 6))).toBe(true)
  })

  it('shows the file, short name, sizes, scale and margins under each tile, the low margin marked', () => {
    const html = tileHtml(row('blue-red', 6, 9), 'data:image/webp;base64,AA', packLayout(slots, slots.crops.wide))
    expect(html).toContain('class="panel rust flagged"')
    expect(html).toContain('Margin under 10 px')
    for (const text of ['blue-red.png', '1122x1402', '1080x1120+21+111', '0.975, 1053 px wide', '<b class="low">6 px</b>']) expect(html).toContain(text)
    expect(html).toContain('background-image: url(data:image/webp;base64,AA)')
  })

  it('makes one tile per pack, with both switches, and names any flagged pack in the summary', () => {
    const rows = [row('navy-stripe', 20, 24), row('blue-red', 6, 9), row('teal', 36, 40)]
    const urls = Object.fromEntries(rows.map((r) => [r.short, `data:,${r.short}`]))
    const html = pageHtml(rows, urls, slots)
    expect(html.match(/<figure /g)).toHaveLength(3)
    expect(html).toContain('Margin under 10 px: blue-red.')
    expect(html.match(/data-switch="boxes"/g)).toHaveLength(2)
    expect(html.match(/data-switch="backdrop"/g)).toHaveLength(2)
    expect(html).toContain('<body class="boxes-outline backdrop-paper">')
  })

  it('escapes what it writes into the page', () => {
    const html = tileHtml({ ...row('x', 20, 20), file: 'A <b> & "c".png' }, '', packLayout(slots, slots.crops.wide))
    expect(html).toContain('A &lt;b&gt; &amp; &quot;c&quot;.png')
  })

  it('writes one self-contained page from the report and the pictures', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'overlay-check-'))
    try {
      writeFileSync(path.join(dir, 'report.json'), JSON.stringify([row('teal', 36, 40)]))
      writeFileSync(path.join(dir, 'teal.webp'), Buffer.from('RIFF'))
      const out = path.join(dir, 'page', 'check.html')
      expect(writeOverlayCheck(['--packs', dir, '--report', path.join(dir, 'report.json'), '--out', out])).toEqual({ out, tiles: 1 })
      expect(readFileSync(out, 'utf8')).toContain(`url(data:image/webp;base64,${Buffer.from('RIFF').toString('base64')})`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
