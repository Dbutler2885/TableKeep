// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { characterFixture } from '../characterTestFixtures'
import { CharacterDetailPane } from './CharacterDetailPane'

afterEach(cleanup)

function renderPane(overrides: Partial<Parameters<typeof CharacterDetailPane>[0]> = {}) {
  const props = {
    character: characterFixture(),
    embeddedMode: false,
    grantMode: false,
    activePage: 'core' as const,
    finalizeError: null,
    renderNavigation: vi.fn((position: 'top' | 'bottom') => <nav>{`${position} navigation`}</nav>),
    renderGrantTools: vi.fn(() => <section>grant tools</section>),
    renderCorePage: vi.fn(() => <section>core page</section>),
    renderItemsPage: vi.fn(() => <section>items page</section>),
    ...overrides,
  }
  const view = render(<CharacterDetailPane {...props} />)
  return { props, view }
}

const texts = (container: HTMLElement) => [...container.querySelectorAll('nav, section, p')].map((node) => node.textContent)

describe('character detail pane', () => {
  it('shows the selected page for the character between the top and bottom navigation', () => {
    const { props, view } = renderPane()
    expect(texts(view.container)).toEqual(['top navigation', 'core page', 'bottom navigation'])
    expect(props.renderCorePage).toHaveBeenCalledWith(props.character)
    expect(view.container.querySelector('.character-editor-grid')?.textContent).toBe('core pagebottom navigation')
    view.rerender(<CharacterDetailPane {...props} activePage="encumbrance" />)
    expect(texts(view.container)).toEqual(['top navigation', 'items page', 'bottom navigation'])
    expect(props.renderItemsPage).toHaveBeenCalledWith(props.character)
  })

  it('shows a finalize error under the top navigation', () => {
    const { view } = renderPane({ finalizeError: 'Roll hit points before finalizing.' })
    expect(texts(view.container)).toEqual(['top navigation', 'Roll hit points before finalizing.', 'core page', 'bottom navigation'])
    expect(screen.getByText('Roll hit points before finalizing.').className).toBe('error')
  })

  it('shows the grant tools instead of the sheet in grant mode, even without a character', () => {
    const { props, view } = renderPane({ grantMode: true, character: null })
    expect(texts(view.container)).toEqual(['top navigation', 'grant tools'])
    expect(props.renderCorePage).not.toHaveBeenCalled()
  })

  it('asks for a selection without a character, or says an embedded player has none', () => {
    const { props, view } = renderPane({ character: null })
    expect(texts(view.container)).toEqual(['top navigation', 'Select a character from the list.'])
    view.rerender(<CharacterDetailPane {...props} character={null} embeddedMode />)
    expect(texts(view.container)).toEqual(['top navigation', "You don't have a character, yet."])
  })
})
