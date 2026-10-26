/** The backpack pictures on disk are exactly the short names, each with a thumbnail. */
import { readdirSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LUBEC_DEFAULT_BACKPACK_ART } from '../../ruleSets/lubec/gear/gearRecord'
import { LUBEC_BACKPACK_ARTS } from './backpackArt'

const folder = new URL('./assets/backpacks/', import.meta.url)
const files = readdirSync(folder).sort()

describe('the backpack pictures', () => {
  it('start with the default and name 18 different packs', () => {
    expect(LUBEC_BACKPACK_ARTS[0]).toBe(LUBEC_DEFAULT_BACKPACK_ART)
    expect(new Set(LUBEC_BACKPACK_ARTS).size).toBe(18)
  })

  it('are a picture and a thumbnail for each short name, and nothing else', () => {
    const expected = LUBEC_BACKPACK_ARTS.flatMap((name) => [`${name}.webp`, `${name}.thumb.webp`]).sort()
    expect(files).toEqual(expected)
  })

  it('stay small: a pack picture under 250 KB, a thumbnail under 12 KB', () => {
    for (const name of LUBEC_BACKPACK_ARTS) {
      expect(statSync(new URL(`${name}.webp`, folder)).size, name).toBeLessThan(250 * 1024)
      expect(statSync(new URL(`${name}.thumb.webp`, folder)).size, name).toBeLessThan(12 * 1024)
    }
  })
})
