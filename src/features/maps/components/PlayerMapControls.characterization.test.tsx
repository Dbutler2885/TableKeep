// @vitest-environment jsdom
/**
 * What the player's map controls show and do, driven only through their props:
 * the camera lock button and the panel for the NPC the GM is presenting.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { NpcSummary } from '../lib/types'
import { anNpc } from '../test/mapFixtures'
import { PlayerMapControls } from './PlayerMapControls'

const presentedNpc: NpcSummary = anNpc({
  id: 'gerda',
  name: 'Gerda Vane',
  title: 'Harbourmaster',
  portraitUrl: 'https://media.test/gerda.png',
  portraitFocusX: 20,
  portraitFocusY: 75,
  playerDescription: 'Weathered and watchful.',
  playerNotes: '<b>Owes</b> the party<script>alert(1)</script>',
})

function renderControls(overrides: Partial<ComponentProps<typeof PlayerMapControls>> = {}) {
  const onToggleCameraLock = vi.fn()
  const view = render(
    <PlayerMapControls cameraLock={false} onToggleCameraLock={onToggleCameraLock} {...overrides} />,
  )
  return { ...view, onToggleCameraLock }
}

const cameraLockButton = () => screen.getByRole('button', { name: 'Toggle camera lock' })
const presentedPanel = (container: HTMLElement) => container.querySelector('.map-npc-presented-panel')

afterEach(cleanup)

describe('the controls wrapper', () => {
  it('is the plain body by default', () => {
    const { container } = renderControls()
    expect(container.firstElementChild?.className).toBe('map-controls-body')
  })

  it('takes the dark class when dark', () => {
    const { container } = renderControls({ dark: true })
    expect(container.firstElementChild?.className).toBe('map-controls-body dark')
  })
})

describe('the camera lock button', () => {
  it('is a plain button carrying its tooltip and icon inside the icon grid', () => {
    renderControls()
    const button = cameraLockButton()
    expect(button.getAttribute('type')).toBe('button')
    expect(button.getAttribute('data-tooltip')).toBe('Camera lock')
    expect(button.parentElement?.className).toBe('map-icon-grid')
    expect(button.querySelector('svg.lucide-crosshair')?.getAttribute('width')).toBe('16')
  })

  it('is not marked active while the camera is unlocked', () => {
    renderControls({ cameraLock: false })
    expect(cameraLockButton().className).toBe('map-icon-btn fast-tooltip')
  })

  it('is marked active while the camera is locked', () => {
    renderControls({ cameraLock: true })
    expect(cameraLockButton().className).toBe('map-icon-btn fast-tooltip active')
  })

  it('asks for the toggle once per click', () => {
    const { onToggleCameraLock } = renderControls()
    fireEvent.click(cameraLockButton())
    expect(onToggleCameraLock).toHaveBeenCalledTimes(1)
  })
})

describe('the presented NPC panel', () => {
  it.each([
    ['left out', undefined],
    ['null', null],
  ])('is absent when the presented NPC is %s', (_label, npc) => {
    const { container } = renderControls({ presentedNpc: npc })
    expect(presentedPanel(container)).toBeNull()
  })

  it('renders every field of a full NPC as the exact markup, with its notes sanitised', () => {
    const { container } = renderControls({ presentedNpc })
    expect(presentedPanel(container)?.outerHTML).toBe(
      '<section class="map-npc-presented-panel">'
      + '<div class="map-npc-presented-card">'
      + '<div class="map-npc-presented-portrait">'
      + '<img alt="Gerda Vane portrait" class="map-npc-presented-image" style="object-position: 20% 75%;" src="https://media.test/gerda.png">'
      + '</div>'
      + '<div class="map-npc-presented-copy">'
      + '<h4>Gerda Vane</h4>'
      + '<p class="map-npc-presented-title">Harbourmaster</p>'
      + '<p>Weathered and watchful.</p>'
      + '<div class="map-npc-presented-notes npc-richtext-preview"><strong>Owes</strong> the partyalert(1)</div>'
      + '</div>'
      + '</div>'
      + '</section>',
    )
  })

  it('sits after the icon grid in the controls body', () => {
    const { container } = renderControls({ presentedNpc })
    const body = container.firstElementChild
    expect(Array.from(body?.children ?? []).map((child) => child.className)).toEqual([
      'map-icon-grid',
      'map-npc-presented-panel',
    ])
  })

  it('keeps the empty portrait frame and only the name for an NPC with nothing else', () => {
    const { container } = renderControls({
      presentedNpc: anNpc({ id: 'unknown', name: 'Unknown Figure' }),
    })
    expect(presentedPanel(container)?.outerHTML).toBe(
      '<section class="map-npc-presented-panel">'
      + '<div class="map-npc-presented-card">'
      + '<div class="map-npc-presented-portrait"></div>'
      + '<div class="map-npc-presented-copy"><h4>Unknown Figure</h4></div>'
      + '</div>'
      + '</section>',
    )
  })
})
