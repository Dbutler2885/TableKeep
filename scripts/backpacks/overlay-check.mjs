// Writes the backpack overlay check page: every prepared backpack picture with
// the standard slot boxes drawn on it, so the captain can see each pack against
// the slots before the pictures are committed (spec 6.5).
//
// The boxes come from src/features/lubec/gear/backpackSlots.json, the file the
// Gear tab reads, so the page cannot drift from what ships. The page is one
// self-contained file with the pictures inlined, so it opens from the file
// system. It is a review tool, not part of the app: the sheet's colours and
// font stacks are copied in as literal values.
//
// Usage: node scripts/backpacks/overlay-check.mjs [--packs <folder>] [--report <json>] [--out <html>]
//   --packs   the prepared pictures, default src/features/lubec/gear/assets/backpacks
//   --report  what scripts/backpacks/prepare.sh wrote, default .scratch/backpack-prepare-report.json
//   --out     default .scratch/backpack-overlay-check.html

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SLOTS_FILE = path.join(ROOT, 'src/features/lubec/gear/backpackSlots.json')

/** Below this many pixels of canvas either side of the pack, a tile is flagged. */
export const MARGIN_FLAG = 10

// What the real boxes hold in the "real boxes" view: B's sample backpack (B 2052-2061).
const SAMPLE = {
  main: [
    ['Flashlight', 'Loaded 2 of 2'],
    ['Small anvil', null],
    ['Peanut butter sandwich', '×2'],
    ['D batteries', '×2'],
    ['Wool watch cap', null],
  ],
  small: { count: 3, names: 'Timex watch, House key +1 more' },
  front: [
    ['Box of .38 rounds', '12 of 50'],
    ['Photocopied 1898 map', null],
  ],
}

const pct = (v, from, of) => Math.round(((v - from) / of) * 10000) / 100

/** Every box and label in percent of the pack box, and the picture's place in it: B's setCrop, as lubecPackLayout does it. */
export function packLayout(slots, crop) {
  const [iw, ih] = slots.size
  const spot = ([x, y, w, h]) => ({ x: pct(x, crop.x, crop.w), y: pct(y, crop.y, crop.h), w: pct(w, 0, crop.w), h: pct(h, 0, crop.h) })
  const at = ([x, y]) => ({ x: pct(x, crop.x, crop.w), y: pct(y, crop.y, crop.h) })
  return {
    main: slots.main.map(spot),
    small: spot(slots.small),
    front: slots.front.map(spot),
    labels: { main: at(slots.mainLabel), front: at(slots.frontLabel) },
    style: {
      '--bag-ratio': `${crop.w} / ${crop.h}`,
      '--bag-size': `${pct(iw, 0, crop.w)}% auto`,
      '--bag-pos': `${pct(crop.x, 0, iw - crop.w)}% ${pct(crop.y, 0, ih - crop.h)}%`,
    },
  }
}

/** True when the pack comes within MARGIN_FLAG pixels of either side of the canvas. */
export const marginFlagged = (row) => Math.min(row.left, row.right) < MARGIN_FLAG

const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const css = (style) => Object.entries(style).map(([k, v]) => `${k}: ${v}`).join('; ')
const place = (s) => css({ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` })

function box(spot, [name, line], extra = '') {
  const qty = line ? `<span class="qty">${escape(line)}</span>` : ''
  return `<div class="slot item${extra}" style="${place(spot)}"><span class="slot-pic none"></span><span class="slot-text"><span class="name">${escape(name)}</span>${qty}</span></div>`
}

/** The boxes on one pack: five main, two front, the small-stuff pill and the two zone labels. */
export function boxesHtml(layout) {
  const { main, small, front, labels } = layout
  const pill = css({ left: `${small.x}%`, top: `${small.y}%`, width: `${small.w}%`, 'min-height': `${small.h}%` })
  return [
    `<span class="zone-label" style="left: ${labels.main.x}%; top: ${labels.main.y}%">Main pocket / 5 of 5</span>`,
    `<span class="zone-label" style="left: ${labels.front.x}%; top: ${labels.front.y}%">Front pockets</span>`,
    ...main.map((s, k) => box(s, SAMPLE.main[k])),
    ...front.map((s, k) => box(s, SAMPLE.front[k], ' pocket')),
    `<div class="small-stuff" style="${pill}"><span class="label">Small stuff / ${SAMPLE.small.count}</span><span class="names">${escape(SAMPLE.small.names)}</span></div>`,
  ].join('')
}

function captionHtml(row) {
  const margin = (side) => `<b class="${row[side] < MARGIN_FLAG ? 'low' : ''}">${row[side]} px</b>`
  return `<dl>
    <dt>File</dt><dd>${escape(row.file)}</dd>
    <dt>Short name</dt><dd>${escape(row.short)}</dd>
    <dt>Original</dt><dd>${escape(row.original)}</dd>
    <dt>Pack box</dt><dd>${escape(row.box)}</dd>
    <dt>Scale</dt><dd>${row.scale.toFixed(3)}, ${row.width} px wide</dd>
    <dt>Margins</dt><dd>left ${margin('left')}, right ${margin('right')}</dd>
  </dl>`
}

/** One pack: a Backpack panel with the picture and the boxes, and its numbers under it. */
export function tileHtml(row, imageUrl, layout) {
  const flag = marginFlagged(row) ? `<span class="tag">Margin under ${MARGIN_FLAG} px</span>` : ''
  return `<figure class="panel rust${marginFlagged(row) ? ' flagged' : ''}" id="${escape(row.short)}">
  <div class="section-head"><h2>${escape(row.short)}</h2>${flag}</div>
  <div class="pack" style="${css(layout.style)}"><span class="pack-art" role="img" aria-label="${escape(row.short)}" style="background-image: url(${imageUrl})"></span>${boxesHtml(layout)}</div>
  <figcaption>${captionHtml(row)}</figcaption>
</figure>`
}

const STYLE = readFileSync(new URL('./overlay-check.css', import.meta.url), 'utf8')

/** The whole page, from the prepare report's rows and each pack's picture as a URL. */
export function pageHtml(rows, imageUrls, slots) {
  const layout = packLayout(slots, slots.crops.wide)
  const flagged = rows.filter(marginFlagged).map((r) => r.short)
  const tiles = rows.map((row) => tileHtml(row, imageUrls[row.short], layout)).join('\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lubec backpack pictures against the standard slots</title>
<style>${STYLE}</style>
</head>
<body class="boxes-outline backdrop-paper">
<header>
  <h1>Backpack pictures against the standard slots</h1>
  <p>${rows.length} packs, each on the 1122x1402 canvas and shown in the pack box's wide crop, with the five main boxes, the small-stuff pill and the two front boxes where the Gear tab puts them. ${flagged.length ? `Margin under ${MARGIN_FLAG} px: ${flagged.map(escape).join(', ')}.` : `Every pack keeps at least ${MARGIN_FLAG} px of canvas either side.`}</p>
  <div class="switches">
    <fieldset><legend>Boxes</legend>
      <button type="button" class="btn small" data-switch="boxes" data-value="outline" aria-pressed="true">Outlines</button>
      <button type="button" class="btn small line" data-switch="boxes" data-value="real" aria-pressed="false">Real boxes</button>
    </fieldset>
    <fieldset><legend>Backdrop</legend>
      <button type="button" class="btn small" data-switch="backdrop" data-value="paper" aria-pressed="true">Sheet paper</button>
      <button type="button" class="btn small line" data-switch="backdrop" data-value="white" aria-pressed="false">White</button>
    </fieldset>
  </div>
</header>
<main class="tiles">
${tiles}
</main>
<script>
document.querySelectorAll('[data-switch]').forEach((button) => button.addEventListener('click', () => {
  const name = button.dataset.switch
  document.querySelectorAll('[data-switch="' + name + '"]').forEach((b) => {
    const on = b === button
    b.setAttribute('aria-pressed', String(on))
    b.classList.toggle('line', !on)
    document.body.classList.toggle(name + '-' + b.dataset.value, on)
  })
}))
</script>
</body>
</html>
`
}

function args(argv) {
  const value = (flag, fallback) => {
    const at = argv.indexOf(flag)
    return at === -1 ? fallback : path.resolve(argv[at + 1])
  }
  return {
    packs: value('--packs', path.join(ROOT, 'src/features/lubec/gear/assets/backpacks')),
    report: value('--report', path.join(ROOT, '.scratch/backpack-prepare-report.json')),
    out: value('--out', path.join(ROOT, '.scratch/backpack-overlay-check.html')),
  }
}

/** Reads the report and the pictures and writes the page; returns where it went. */
export function writeOverlayCheck(argv) {
  const { packs, report, out } = args(argv)
  const rows = JSON.parse(readFileSync(report, 'utf8'))
  const slots = JSON.parse(readFileSync(SLOTS_FILE, 'utf8'))
  const imageUrls = Object.fromEntries(rows.map((row) => [
    row.short,
    `data:image/webp;base64,${readFileSync(path.join(packs, `${row.short}.webp`)).toString('base64')}`,
  ]))
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(out, pageHtml(rows, imageUrls, slots))
  return { out, tiles: rows.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { out, tiles } = writeOverlayCheck(process.argv.slice(2))
  console.log(`wrote ${tiles} tiles to ${out}`)
}
