// @vitest-environment jsdom
/** The NPC detail strip lands on the Character sheet when the Combat tab sends the GM to an NPC's hands. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { NpcRecord } from '../../../types/app'
import { requestOpen } from '../../navigation/openRequest'
import { NpcDetailTabs } from './NpcDetailTabs'

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

const roy = { id: 'roy', name: 'Roy Carver' } as NpcRecord
const show = () => render(<NpcDetailTabs npc={roy} story={<p>The story text</p>} sheetTab={() => <p>The sheet text</p>} />)

describe('NpcDetailTabs', () => {
  it('opens on the story by default', () => {
    show()
    expect(screen.getByText('The story text')).toBeTruthy()
  })

  it('opens on the Character sheet when a request names a page of this NPC\'s sheet', () => {
    requestOpen('npc', 'roy', 'gear')
    show()
    expect(screen.getByText('The sheet text')).toBeTruthy()
  })
})
