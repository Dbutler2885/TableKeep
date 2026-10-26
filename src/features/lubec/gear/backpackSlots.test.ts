/** The backpack's boxes on its picture, in percent of the pack box, as B's setCrop works them out. */
import { describe, expect, it } from 'vitest'
import { BAG, CROPS, lubecPackLayout, lubecSpotsRect } from './backpackSlots'

describe('the backpack slots', () => {
  it('keep B\'s boxes in the picture\'s own pixels', () => {
    expect(BAG.main).toEqual([[238, 318, 320, 132], [572, 318, 320, 132], [238, 462, 320, 132], [572, 462, 320, 132], [238, 606, 320, 132]])
    expect(BAG.front).toEqual([[226, 912, 290, 220], [606, 912, 300, 220]])
    expect(CROPS).toEqual({ wide: { x: 10, y: 110, w: 1100, h: 1120 }, phone: { x: 130, y: 230, w: 860, h: 990 } })
  })

  it('place the boxes and the picture for the wide crop', () => {
    const layout = lubecPackLayout(CROPS.wide)
    expect(layout.main[0]).toEqual({ x: 20.73, y: 18.57, w: 29.09, h: 11.79 })
    expect(layout.small).toEqual({ x: 51.82, y: 45, w: 27.64, h: 10.36 })
    expect(layout.front[1]).toEqual({ x: 54.18, y: 71.61, w: 27.27, h: 19.64 })
    expect(layout.labels).toEqual({ main: { x: 50.45, y: 16.25 }, front: { x: 50.55, y: 62.86 } })
    expect(layout.style).toEqual({ '--bag-ratio': '1100 / 1120', '--bag-size': '102% auto', '--bag-pos': '45.45% 39.01%' })
  })

  it('crop closer on a phone, so the boxes grow', () => {
    const layout = lubecPackLayout(CROPS.phone)
    expect(layout.main[0]).toEqual({ x: 12.56, y: 8.89, w: 37.21, h: 13.33 })
    expect(layout.style['--bag-ratio']).toBe('860 / 990')
  })

  it('cover several boxes with one rectangle', () => {
    const { main } = lubecPackLayout(CROPS.wide)
    expect(lubecSpotsRect([main[0], main[2]])).toEqual({ left: '20.73%', top: '18.57%', width: '29.09%', height: `${main[2].y + main[2].h - main[0].y}%` })
  })
})
