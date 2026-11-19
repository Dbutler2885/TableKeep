import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { renderClassicFantasyCorpus } from '../src/rules/classicFantasy.ts'

const STAND_IN = readFileSync(new URL('./fixtures/classic-fantasy-stand-in.json', import.meta.url), 'utf8')
const CORPUS = readFileSync(new URL('../../docs/rules/ose-classic/corpus.json', import.meta.url), 'utf8')

type Section = { title: string; level: number; markdownLines: string[] }
type Page = { title: string; sections: Section[] }

test('each section is a heading that names the sections above it, with its body lines as they are, tables included', () => {
  const rendered = renderClassicFantasyCorpus(STAND_IN)
  const rules = rendered.slice(rendered.indexOf('\n## Cleric\n') + 1)
  assert.equal(
    rules,
    `## Cleric

Clerics are adventurers sworn to a deity.

### Cleric › Combat

Clerics may use only blunt weapons.

### Cleric › Cleric Level Progression

| Level | XP | HD |
| --- | --- | --- |
| 1 | 0 | 1d6 |
| 2 | 1,500 | 2d6 |

## Combat

### Combat › Initiative

Roll 1d6 for each side.

The side with the higher roll acts first.

#### Combat › Initiative › Slow Weapons

A slow weapon always acts last.

#### Combat › Initiative › Individual Initiative (Optional Rule)

Each character rolls 1d6.

### Combat › Melee

Roll 1d20 to hit.
`,
  )
})

test('the document opens by saying it is the pre-2026 Classic Fantasy text, what it leaves out, and that it is Open Game Content', () => {
  const rendered = renderClassicFantasyCorpus(STAND_IN)
  const opening = rendered.slice(0, rendered.indexOf('\n## Cleric\n'))
  assert.match(opening, /^# Classic Fantasy rules \(pre-2026 text\)\n/)
  assert.match(opening, /from the 2019 Classic Fantasy SRD as transcribed on 2024-08-13\./)
  assert.match(opening, /Nothing from the 2026 edition is in them\./)
  for (const left of ['spell lists', 'what any spell does', 'monster descriptions', 'treasure', 'equipment lists', 'Advanced classes']) {
    assert.ok(opening.includes(left), `says the rules leave out ${left}`)
  }
  assert.match(opening, /A question that needs any of them is not covered\./)
  assert.match(opening, /"\(Optional Rule\)" is an optional rule/)
  assert.match(opening, /All rules text and tables below are Open Game Content\. Use is permitted only under the Open Game License Version 1\.0a\.\n$/)
  assert.doesNotMatch(rendered, /\n\n\n/, 'one blank line between parts, never more')
})

test('the whole corpus renders with every section under its own heading and every table row and body line kept', () => {
  const rendered = renderClassicFantasyCorpus(CORPUS)
  const pages = (JSON.parse(CORPUS) as { pages: Page[] }).pages
  const headings = rendered.split('\n').filter((line) => /^#{2,6} /.test(line))
  assert.equal(headings.length, pages.reduce((sum, page) => sum + page.sections.length, 0))
  assert.equal(new Set(headings).size, headings.length, 'no two sections share a heading, so each can be cited')
  for (const page of pages) {
    for (const section of page.sections) {
      for (const line of section.markdownLines) assert.ok(rendered.includes(line), `keeps "${line.slice(0, 60)}" from ${section.title}`)
    }
  }
  assert.ok(headings.includes('### Combat › Initiative'))
  assert.ok(headings.includes('### Cleric › Turning the Undead'))
  assert.ok(rendered.includes('| 1 | 0 | 1d8 | 19 [0] | 12 | 13 | 14 | 15 | 16 |'), "the Fighter's first level is a table row")
  assert.doesNotMatch(rendered, /Old[- ]School Essentials|Necrotic Gnome/i, 'names no product identity')
  // About 38,700 tokens rendered; a guard against the whole corpus silently going missing or doubling.
  assert.ok(rendered.length > 120_000 && rendered.length < 220_000, `${rendered.length} characters`)
})

test('a corpus that is not one is refused, saying why', () => {
  const corpus = JSON.parse(STAND_IN) as Record<string, unknown> & { pages: Page[] }
  const without = (change: (copy: typeof corpus) => void) => {
    const copy = structuredClone(corpus)
    change(copy)
    return JSON.stringify(copy)
  }
  assert.throws(() => renderClassicFantasyCorpus('not json'), SyntaxError)
  assert.throws(() => renderClassicFantasyCorpus(without((copy) => (copy.pages = []))), /has no pages/)
  assert.throws(() => renderClassicFantasyCorpus(without((copy) => (copy.pages[1]!.sections[1]!.level = 0))), /Page 2 .* is not a page of sections/)
  assert.throws(() => renderClassicFantasyCorpus(without((copy) => (copy.pages[0]!.sections[0]!.level = 2))), /Page 1 .* is not a page of sections/)
  assert.throws(() => renderClassicFantasyCorpus(without((copy) => delete copy.license)), /carries no license notice/)
  assert.throws(() => renderClassicFantasyCorpus(without((copy) => delete copy.source)), /does not say where it is from/)
})
