// @vitest-environment jsdom
/** The pictures: the twelve drawings that ship, each in its shape and B's stroke, and the kinds' icons for the rest. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { LubecItemKind } from '../../ruleSets/lubec/gear/gearRecord'
import { isLubecArt, LUBEC_ART_SHAPES, lubecPictureShape } from './gearArt'
import { LubecArt, LubecCardPicture, LubecPicture, LubecTilePicture } from './LubecGearArt'

afterEach(cleanup)

const BOXES = { tall: '0 0 80 120', wide: '0 0 120 80', square: '0 0 100 100' }

describe('the drawings', () => {
  it('ships the twelve the spec names, each drawn to its shape in B\'s stroke', () => {
    expect(Object.keys(LUBEC_ART_SHAPES)).toEqual(['flashlight', 'rope', 'compass', 'knife', 'bat', 'revolver', 'shotgun', 'helmet', 'gloves', 'rounds38', 'dcell', 'canteen'])
    for (const [art, shape] of Object.entries(LUBEC_ART_SHAPES)) {
      const svg = render(<LubecArt art={art} />).container.querySelector('svg') as SVGElement
      expect(svg.getAttribute('viewBox'), art).toBe(BOXES[shape])
      const stroke = svg.querySelector('g') as SVGGElement
      expect([stroke.getAttribute('stroke-width'), stroke.getAttribute('stroke-linecap'), stroke.getAttribute('fill')]).toEqual(['2.6', 'round', 'none'])
      expect(stroke.children.length, art).toBeGreaterThan(2)
      cleanup()
    }
  })

  it('knows which keys ship, and frames a picture in its own shape, its drawing\'s, or square', () => {
    expect([isLubecArt('rope'), isLubecArt('walkie'), isLubecArt(undefined), isLubecArt('toString')]).toEqual([true, false, false, false])
    expect([lubecPictureShape({ art: 'bat', shape: 'square' }), lubecPictureShape({ art: 'bat' }), lubecPictureShape({ art: 'walkie' })]).toEqual(['square', 'wide', 'square'])
  })
})

describe('the frames', () => {
  const kinds: LubecItemKind[] = ['thing', 'weapon', 'armor', 'consumable', 'holder']

  it('shows the kind\'s icon for an item with no drawing, or one that does not ship', () => {
    for (const kind of kinds) {
      const { container } = render(<><LubecPicture item={{ kind, art: 'walkie' }} frame="thumb" /><LubecTilePicture item={{ kind }} /><LubecCardPicture item={{ kind }} name="x" /></>)
      expect([...container.querySelectorAll('.none')].map((el) => el.className)).toEqual(['thumb none', 'thumb none', 'card-pic none'])
      expect(container.querySelectorAll('svg:not(.lubec-art)')).toHaveLength(3)
      cleanup()
    }
  })

  it('frames a drawing in its shape on a slot, a tile and the card', () => {
    const { container } = render(<><LubecPicture item={{ kind: 'weapon', art: 'bat' }} frame="slot-pic" /><LubecTilePicture item={{ kind: 'holder', art: 'canteen' }} /><LubecCardPicture item={{ kind: 'thing', art: 'rope' }} name="Coil of rope" /></>)
    expect([...container.children].map((el) => el.className)).toEqual(['slot-pic wide', 'tile-pic tall', 'card-pic square'])
    expect(container.querySelector('figure')?.getAttribute('aria-label')).toBe('Coil of rope')
  })
})
