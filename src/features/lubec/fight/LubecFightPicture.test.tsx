// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { LubecFightPicture } from './LubecFightPicture'

vi.mock('../gear/useLubecPictureUrl', () => ({ useLubecPictureUrl: (path: string | undefined) => path ? 'https://example.test/custom-ball.png' : null }))

afterEach(cleanup)

const ball: LubecItem = { id: 'ball', name: 'Dodgeball', kind: 'weapon', carrier: 'hands', slot: 0, size: 1, qty: 1, weight: 'normal', note: '', mode: 'thrown', table: 'dodgeball' }

describe('shared fight item artwork', () => {
  it.each([undefined, 'weapon'])('shows the mock-up Dodgeball instead of the default weapon glyph for art=%s', (art) => {
    const { container } = render(<LubecFightPicture item={{ ...ball, art }} />)
    expect(container.querySelector('svg.ball')?.getAttribute('viewBox')).toBe('0 0 40 40')
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#a34229')
    expect(container.querySelector('.pic.none')).toBeNull()
  })

  it('keeps another item\'s ordinary fallback rather than giving it Dodgeball art', () => {
    const { container } = render(<LubecFightPicture item={{ ...ball, table: 'thrown' }} />)
    expect(container.querySelector('svg.ball')).toBeNull()
    expect(container.querySelector('.pic.none svg')).toBeTruthy()
  })

  it('preserves an explicitly chosen stock drawing', () => {
    const { container } = render(<LubecFightPicture item={{ ...ball, art: 'bat' }} />)
    expect(container.querySelector('.lubec-art')?.getAttribute('viewBox')).toBe('0 0 120 80')
    expect(container.querySelector('svg.ball')).toBeNull()
  })

  it('preserves an uploaded picture ahead of the fallback', () => {
    const { container } = render(<LubecFightPicture item={{ ...ball, picturePath: 'custom/ball.png' }} />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.test/custom-ball.png')
    expect(container.querySelector('svg.ball')).toBeNull()
  })
})
