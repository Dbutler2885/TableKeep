// @vitest-environment jsdom
/**
 * What the GM map controls do, driven only through their props. Firestore is
 * replaced so the presented NPC's GM notes can be fed in, and the scene NPC
 * editor is a stub that records which NPC it was opened for.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { SetStateAction } from 'react'
import { getTokenPlacementDisplay, startMonsterTokenPlacement, startWholePartyTokenPlacement } from '../lib/tokenPlacementQueue'
import type { GenericTokenPlacementSource, MonsterTokenPlacementSource, NpcTokenPlacementSource, PartyCharacterTokenPlacementSource } from '../lib/tokenPlacementQueue'
import { aToken, aTokenAsset, anNpc } from '../test/mapFixtures'
import { gmMapControlsProps, type GmMapControlsProps } from '../test/gmMapControlsProps'

const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, (snap: unknown) => void>,
  sceneNpcModal: null as { npcId: string; allTags: string[]; onClose: () => void } | null,
}))

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: (_db: unknown, path: string) => ({ path }),
  onSnapshot: (ref: { path: string }, next: (snap: unknown) => void) => {
    mocks.listeners[ref.path] = next
    return () => { delete mocks.listeners[ref.path] }
  },
}))
vi.mock('./SceneNpcEditorModal', () => ({
  SceneNpcEditorModal: (props: { npcId: string; allTags: string[]; onClose: () => void }) => {
    mocks.sceneNpcModal = props
    return (
      <div data-testid="scene-npc-modal">
        {props.npcId}
        <button type="button" onClick={props.onClose}>Close editor</button>
      </div>
    )
  },
}))

const { GmMapControls } = await import('./GmMapControls')

function renderControls(overrides: Partial<GmMapControlsProps> = {}) {
  const props = gmMapControlsProps(overrides)
  const view = render(<GmMapControls {...props} />)
  const rerender = (next: Partial<GmMapControlsProps>) => {
    Object.assign(props, next)
    view.rerender(<GmMapControls {...props} />)
  }
  return { props, view, rerender }
}

function button(label: string) {
  return screen.getByRole('button', { name: label })
}

// Applies the last selection update the controls asked for to `current`.
function lastSelection(props: GmMapControlsProps, current: string[]) {
  const calls = vi.mocked(props.onSelectedTokenIdsChange).mock.calls
  const update = calls[calls.length - 1][0] as SetStateAction<string[]>
  return typeof update === 'function' ? update(current) : update
}

const party: PartyCharacterTokenPlacementSource[] = [
  { kind: 'partyCharacter', id: 'pc-1', name: 'Mirelda', tokenIcon: { icon: 'custom', color: '#123456', size: 30, customImageUrl: 'https://img.test/mirelda.png' } },
  { kind: 'partyCharacter', id: 'pc-2', name: 'Osric', tokenIcon: null },
]
const goblin: MonsterTokenPlacementSource = { kind: 'monster', id: 'm-1', name: 'Goblin', tokenIcon: { icon: 'pawn', color: '#00aa00', size: 30 } }
const ogre: MonsterTokenPlacementSource = { kind: 'monster', id: 'm-2', name: 'Ogre' }
const barkeep: NpcTokenPlacementSource = { kind: 'npc', id: 'n-1', name: 'Barkeep', tokenIcon: { icon: 'custom', color: '#990000', size: 30 } }
const crate: GenericTokenPlacementSource = { kind: 'genericToken', id: 'a-1', name: 'Crate', imagePath: 'assets/a-1.png', imageUrl: 'https://img.test/a-1.png' }

beforeEach(() => {
  mocks.sceneNpcModal = null
})

afterEach(() => {
  cleanup()
  for (const key of Object.keys(mocks.listeners)) delete mocks.listeners[key]
})

describe('the frame', () => {
  it('uses the dark body class only when asked', () => {
    const { view, rerender } = renderControls()
    expect(view.container.firstElementChild?.className).toBe('map-controls-body')
    rerender({ dark: true })
    expect(view.container.firstElementChild?.className).toBe('map-controls-body dark')
  })

  it('shows the top tools unless told not to', () => {
    const { rerender } = renderControls()
    expect(document.querySelector('.map-tools-panel')).toBeTruthy()
    rerender({ showTopTools: false })
    expect(document.querySelector('.map-tools-panel')).toBeNull()
  })
})

describe('the fog and vision tools', () => {
  it('turns a fog tool on, dropping box select and any vision tool, and off again', () => {
    const { props, rerender } = renderControls()
    fireEvent.click(button('Add fog'))
    expect(props.setTokenSelectMode).toHaveBeenCalledWith(false)
    expect(props.setVisionTool).toHaveBeenCalledWith(null)
    expect(props.setFogTool).toHaveBeenLastCalledWith('hide')
    fireEvent.click(button('Remove fog'))
    expect(props.setFogTool).toHaveBeenLastCalledWith('reveal')

    rerender({ fogTool: 'hide' })
    expect(button('Add fog').className).toContain('active')
    expect(button('Remove fog').className).not.toContain('active')
    fireEvent.click(button('Add fog'))
    expect(props.setFogTool).toHaveBeenLastCalledWith(null)
    rerender({ fogTool: 'reveal' })
    fireEvent.click(button('Remove fog'))
    expect(props.setFogTool).toHaveBeenLastCalledWith(null)
  })

  it('hides or unhides the whole map, and only when a preset can apply', () => {
    const { props, rerender } = renderControls()
    fireEvent.click(button('Hide all'))
    expect(props.applyFogPreset).toHaveBeenLastCalledWith('hide-all')
    rerender({ fullyHidden: true })
    expect(button('Unhide all').className).toContain('active')
    expect(button('Unhide all').getAttribute('data-tooltip')).toBe('Unhide all')
    fireEvent.click(button('Unhide all'))
    expect(props.applyFogPreset).toHaveBeenLastCalledWith('unhide-all')
    rerender({ canApplyPreset: false })
    expect((button('Unhide all') as HTMLButtonElement).disabled).toBe(true)
  })

  it('turns each vision tool on, dropping box select and any fog tool, and off again', () => {
    const { props, rerender } = renderControls()
    for (const [label, tool] of [['Hard vision block', 'drawFull'], ['Soft vision block', 'draw'], ['Erase vision blocks', 'erase']] as const) {
      fireEvent.click(button(label))
      expect(props.setFogTool).toHaveBeenLastCalledWith(null)
      expect(props.setVisionTool).toHaveBeenLastCalledWith(tool)
      rerender({ visionTool: tool })
      expect(button(label).className).toContain('active')
      fireEvent.click(button(label))
      expect(props.setVisionTool).toHaveBeenLastCalledWith(null)
      rerender({ visionTool: null })
      expect(button(label).className).not.toContain('active')
    }
    expect(props.setTokenSelectMode).toHaveBeenCalledWith(false)
  })
})

describe('the annotation, token and view tools', () => {
  it('turns GM note placement on, dropping box select and label placement, and off alone', () => {
    const { props, rerender } = renderControls()
    fireEvent.click(button('Toggle GM notes placement'))
    expect(props.setAnnotationPlaceMode).toHaveBeenLastCalledWith(true)
    expect(props.setTokenSelectMode).toHaveBeenCalledWith(false)
    expect(props.setPlayerLabelPlaceMode).toHaveBeenCalledWith(false)
    vi.mocked(props.setTokenSelectMode).mockClear()
    rerender({ annotationPlaceMode: true })
    expect(button('Toggle GM notes placement').className).toContain('active')
    fireEvent.click(button('Toggle GM notes placement'))
    expect(props.setAnnotationPlaceMode).toHaveBeenLastCalledWith(false)
    expect(props.setTokenSelectMode).not.toHaveBeenCalled()
  })

  it('turns player label placement on, dropping box select and note placement, and off alone', () => {
    const { props, rerender } = renderControls()
    fireEvent.click(button('Toggle player label placement mode'))
    expect(props.setPlayerLabelPlaceMode).toHaveBeenLastCalledWith(true)
    expect(props.setTokenSelectMode).toHaveBeenCalledWith(false)
    expect(props.setAnnotationPlaceMode).toHaveBeenCalledWith(false)
    vi.mocked(props.setAnnotationPlaceMode).mockClear()
    rerender({ playerLabelPlaceMode: true })
    expect(button('Toggle player label placement mode').className).toContain('active')
    fireEvent.click(button('Toggle player label placement mode'))
    expect(props.setPlayerLabelPlaceMode).toHaveBeenLastCalledWith(false)
    expect(props.setAnnotationPlaceMode).not.toHaveBeenCalled()
  })

  it('flips label hiding in the GM view', () => {
    const { props, rerender } = renderControls()
    fireEvent.click(button('Hide labels in GM view'))
    expect(props.setGmHideLabels).toHaveBeenLastCalledWith(true)
    rerender({ gmHideLabels: true })
    expect(button('Show labels in GM view').className).toContain('active')
    fireEvent.click(button('Show labels in GM view'))
    expect(props.setGmHideLabels).toHaveBeenLastCalledWith(false)
  })

  it('turns box select on, dropping every brush and placement tool, and off alone', () => {
    const { props, rerender } = renderControls()
    fireEvent.click(button('Toggle token drag-select mode'))
    expect(props.setTokenSelectMode).toHaveBeenLastCalledWith(true)
    expect(props.setFogTool).toHaveBeenCalledWith(null)
    expect(props.setVisionTool).toHaveBeenCalledWith(null)
    expect(props.setAnnotationPlaceMode).toHaveBeenCalledWith(false)
    expect(props.setPlayerLabelPlaceMode).toHaveBeenCalledWith(false)
    vi.mocked(props.setFogTool).mockClear()
    rerender({ tokenSelectMode: true })
    expect(button('Toggle token drag-select mode').className).toContain('active')
    fireEvent.click(button('Toggle token drag-select mode'))
    expect(props.setTokenSelectMode).toHaveBeenLastCalledWith(false)
    expect(props.setFogTool).not.toHaveBeenCalled()
  })

  it('flips the hand tool, the scene NPC panel and the player view preview', () => {
    const { props, rerender } = renderControls()
    fireEvent.click(button('Toggle hand pan tool'))
    fireEvent.click(button('Toggle scene NPC panel'))
    fireEvent.click(button('Toggle player view preview'))
    expect(props.setHandToolActive).toHaveBeenLastCalledWith(true)
    expect(props.setNpcSceneMode).toHaveBeenLastCalledWith(true)
    expect(props.setPlayerViewPreview).toHaveBeenLastCalledWith(true)
    rerender({ handToolActive: true, npcSceneMode: true, playerViewPreview: true })
    for (const label of ['Toggle hand pan tool', 'Toggle scene NPC panel', 'Toggle player view preview']) {
      expect(button(label).className).toContain('active')
      fireEvent.click(button(label))
    }
    expect(props.setHandToolActive).toHaveBeenLastCalledWith(false)
    expect(props.setNpcSceneMode).toHaveBeenLastCalledWith(false)
    expect(props.setPlayerViewPreview).toHaveBeenLastCalledWith(false)
  })

  it('passes the brush size control and the distance tracker their values', () => {
    const { props } = renderControls({ fogBrushSize: 90, distanceTrackerFeet: 40, distanceTrackerMode: 'roll', distanceTrackerRoll: 3 })
    expect(button('Reset movement distance tracker').getAttribute('data-tooltip')).toBe('d6: 3')
    fireEvent.click(button('Reset movement distance tracker'))
    expect(props.onResetDistanceTracker).toHaveBeenCalled()
  })
})

describe('the grid tools', () => {
  it('picks each grid type, marking the one being adjusted', () => {
    const { props, rerender } = renderControls()
    fireEvent.click(button('Square grid overlay'))
    fireEvent.click(button('Hex grid pointy-top orientation'))
    fireEvent.click(button('Hex grid flat-top orientation'))
    expect(vi.mocked(props.onSetGridType).mock.calls).toEqual([['square'], ['hex-pointy'], ['hex-flat']])
    expect(button('Square grid overlay').getAttribute('data-tooltip')).toBe('Square grid')
    rerender({ gridAdjustMode: true, gridType: 'square' })
    expect(button('Square grid overlay').className).toContain('active')
    expect(button('Square grid overlay').getAttribute('data-tooltip')).toBe('Cancel square grid')
    rerender({ gridType: 'hex-pointy' })
    expect(button('Hex grid pointy-top orientation').className).toContain('active')
    expect(button('Square grid overlay').className).not.toContain('active')
    rerender({ gridType: 'hex-flat' })
    expect(button('Hex grid flat-top orientation').className).toContain('active')
  })

  it('disables the hex buttons and shows a spinner while detecting', () => {
    const { rerender } = renderControls()
    expect(document.querySelector('.map-hex-flat-icon')).toBeTruthy()
    rerender({ hexDetecting: true })
    const pointy = button('Hex grid pointy-top orientation') as HTMLButtonElement
    expect(pointy.disabled).toBe(true)
    expect(pointy.getAttribute('data-tooltip')).toBe('Detecting hex...')
    expect(button('Hex grid flat-top orientation').getAttribute('data-tooltip')).toBe('Detecting hex...')
    expect(document.querySelectorAll('.map-icon-spin')).toHaveLength(2)
  })

  it('toggles grid visibility, marking a hidden grid', () => {
    const { props, rerender } = renderControls()
    const visibility = button('Toggle grid visibility')
    expect(visibility.className).not.toContain('active')
    expect(visibility.getAttribute('data-tooltip')).toBe('Hide grid')
    fireEvent.click(visibility)
    expect(props.onToggleGridVisible).toHaveBeenCalled()
    rerender({ gridVisible: false })
    expect(button('Toggle grid visibility').className).toContain('active')
    expect(button('Toggle grid visibility').getAttribute('data-tooltip')).toBe('Show grid')
  })

  it('toggles calibration and measurement, measurement only once a grid exists', () => {
    const { props, rerender } = renderControls()
    const measure = button('Measure map distance') as HTMLButtonElement
    expect(measure.disabled).toBe(true)
    expect(measure.getAttribute('data-tooltip')).toBe('Lay or calibrate grid first')
    fireEvent.click(button('Calibrate grid scale'))
    expect(props.onToggleGridCalibrate).toHaveBeenCalled()
    expect(button('Calibrate grid scale').getAttribute('data-tooltip')).toBe("Calibrate 10'")
    rerender({ measurementToolEnabled: true, gridCalibrateMode: true })
    expect(button('Calibrate grid scale').className).toContain('active')
    expect(button('Calibrate grid scale').getAttribute('data-tooltip')).toBe('Measuring')
    expect(button('Measure map distance').getAttribute('data-tooltip')).toBe('Measure distance')
    fireEvent.click(button('Measure map distance'))
    expect(props.onToggleGridMeasure).toHaveBeenCalled()
    rerender({ gridCalibrateMode: false, gridMeasureMode: true })
    expect(button('Measure map distance').className).toContain('active')
    expect(button('Measure map distance').getAttribute('data-tooltip')).toBe('Clear measurement')
  })

  it('shows the grid adjust panel with its confidence and apply button', () => {
    const { props, rerender } = renderControls({ gridAdjustMode: true })
    const panel = document.querySelector('.map-grid-adjust-panel') as HTMLElement
    expect(panel.textContent).toContain('Adjusting grid')
    expect(panel.textContent).not.toContain('confidence')
    expect((within(panel).getByRole('button', { name: 'Apply grid' }) as HTMLButtonElement).disabled).toBe(true)
    rerender({ hexDetectConfidence: 0.876, gridAdjustReady: true })
    expect(panel.textContent).toContain('Hex detect confidence: 88%.')
    fireEvent.click(within(panel).getByRole('button', { name: 'Apply grid' }))
    expect(props.onApplyGrid).toHaveBeenCalled()
  })

  it('shows the calibration panel and the measurement readout in their modes', () => {
    const { props, rerender } = renderControls({ gridCalibrateMode: true, gridCalibrateReady: true })
    expect(screen.getByText(/Click two points across one square side/)).toBeTruthy()
    fireEvent.click(button('Apply calibration'))
    expect(props.onApplyGridCalibration).toHaveBeenCalled()
    rerender({ gridCalibrateMode: false, gridMeasureMode: true, measurementFeetLabel: '35 ft' })
    expect(screen.queryByText(/Click two points across one square side/)).toBeNull()
    expect(screen.getByText('Distance: 35 ft')).toBeTruthy()
  })
})

describe('placing tokens', () => {
  it('shows what is being placed, how many are left, and cancels', () => {
    const queue = startMonsterTokenPlacement(goblin, 3)
    const { props, rerender } = renderControls({ placementDisplay: getTokenPlacementDisplay(queue) })
    const block = document.querySelector('.map-placement-active') as HTMLElement
    expect(block.textContent).toContain('Goblin')
    expect(block.textContent).toContain('3 left')
    expect((block.querySelector('.token-row-icon') as HTMLElement).style.color).toBe('rgb(0, 170, 0)')
    fireEvent.click(within(block).getByText('Cancel'))
    expect(props.onCancelPlacement).toHaveBeenCalled()

    rerender({ placementDisplay: getTokenPlacementDisplay(startWholePartyTokenPlacement(party)) })
    expect(document.querySelector('.map-placement-active img')?.getAttribute('src')).toBe('https://img.test/mirelda.png')
    expect(document.querySelector('.map-placement-active-meta')?.textContent).toBe('2 left')

    rerender({ placementDisplay: { ...getTokenPlacementDisplay(queue), current: null, remaining: 1 } })
    expect(document.querySelector('.map-placement-active-name')?.textContent).toBe('Token')
    expect(document.querySelector('.map-placement-active-meta')).toBeNull()
  })

  it('places the whole party or one character, from a collapsible list', () => {
    const { props, rerender } = renderControls({ partyPlacementSources: party })
    expect(screen.queryByText('Mirelda')).toBeNull()
    fireEvent.click(button('Whole Party'))
    expect(props.onStartWholePartyPlacement).toHaveBeenCalled()
    fireEvent.click(button('Show party token sources'))
    const rows = document.querySelectorAll('.map-placement-row')
    expect(Array.from(rows).map((row) => row.querySelector('.map-placement-source-name')?.textContent)).toEqual(['Mirelda', 'Osric'])
    expect((rows[1].querySelector('.token-row-icon') as HTMLElement).style.color).toBe('rgb(180, 83, 9)')
    fireEvent.click(within(rows[1] as HTMLElement).getByText('Place'))
    expect(props.onStartSinglePlacement).toHaveBeenCalledWith(party[1])
    fireEvent.click(button('Hide party token sources'))
    expect(screen.queryByText('Mirelda')).toBeNull()

    rerender({ partyPlacementSources: [] })
    expect((button('Whole Party') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button('Show party token sources'))
    expect(screen.getByText('No party characters.')).toBeTruthy()
  })
})

describe('placing non-party tokens', () => {
  function openNonParty(overrides: Partial<GmMapControlsProps> = {}) {
    const rendered = renderControls({
      monsterPlacementSources: [goblin, ogre],
      npcPlacementSources: [barkeep],
      genericPlacementSources: [crate],
      ...overrides,
    })
    fireEvent.click(button('Show non-party token sources'))
    return rendered
  }

  function picker() {
    return screen.getByLabelText('Select non-party token source') as HTMLSelectElement
  }

  function optionLabels() {
    return Array.from(picker().querySelectorAll('option')).map((option) => option.textContent)
  }

  it('lists every source grouped by kind, and collapses again', () => {
    openNonParty()
    expect(Array.from(picker().querySelectorAll('optgroup')).map((group) => group.label)).toEqual(['Monsters', 'NPCs', 'Generic assets'])
    expect(optionLabels()).toEqual(['Choose a source', 'Goblin', 'Ogre', 'Barkeep', 'Generic asset...', 'Crate'])
    expect(screen.getByText('Choose a monster, NPC, or generic asset.')).toBeTruthy()
    fireEvent.click(button('Hide non-party token sources'))
    expect(screen.queryByLabelText('Select non-party token source')).toBeNull()
  })

  it('filters sources by name or kind', () => {
    openNonParty()
    const search = screen.getByLabelText('Search non-party token sources')
    fireEvent.change(search, { target: { value: '  OGRE ' } })
    expect(optionLabels()).toEqual(['Choose a source', 'Ogre'])
    fireEvent.change(search, { target: { value: 'npc' } })
    expect(optionLabels()).toEqual(['Choose a source', 'Barkeep'])
    fireEvent.change(search, { target: { value: 'generic' } })
    expect(optionLabels()).toEqual(['Choose a source', 'Generic asset...', 'Crate'])
    fireEvent.change(search, { target: { value: 'upload' } })
    expect(optionLabels()).toEqual(['Choose a source', 'Generic asset...'])
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(optionLabels()).toEqual(['Choose a source'])
  })

  it('keeps the chosen source in the list while a search hides it', () => {
    openNonParty()
    fireEvent.change(picker(), { target: { value: 'monster:m-1' } })
    fireEvent.change(screen.getByLabelText('Search non-party token sources'), { target: { value: 'ogre' } })
    expect(optionLabels()).toEqual(['Choose a source', 'Goblin', 'Ogre'])
    expect(picker().value).toBe('monster:m-1')
  })

  it('places a monster with a clamped count', () => {
    const { props } = openNonParty()
    fireEvent.change(picker(), { target: { value: 'monster:m-1' } })
    const row = document.querySelector('.map-placement-stage .map-placement-row') as HTMLElement
    expect(row.className).toBe('token-row map-placement-row')
    const count = screen.getByLabelText('Goblin placement count') as HTMLInputElement
    expect(count.value).toBe('1')
    fireEvent.click(button('Decrease count'))
    expect(count.value).toBe('1')
    fireEvent.click(button('Increase count'))
    fireEvent.click(button('Increase count'))
    expect(count.value).toBe('3')
    fireEvent.change(count, { target: { value: '250' } })
    expect(count.value).toBe('99')
    fireEvent.change(count, { target: { value: 'abc' } })
    expect(count.value).toBe('1')
    fireEvent.change(count, { target: { value: '7' } })
    fireEvent.click(within(row).getByText('Place'))
    expect(props.onStartMonsterPlacement).toHaveBeenCalledWith(goblin, 7)
    expect(row.querySelector('.map-placement-delete-source-btn')).toBeNull()
  })

  it('places an NPC as a single token', () => {
    const { props } = openNonParty()
    fireEvent.change(picker(), { target: { value: 'npc:n-1' } })
    const row = document.querySelector('.map-placement-stage .map-placement-row') as HTMLElement
    expect(row.className).toBe('token-row map-placement-row map-placement-row-simple')
    expect(row.querySelector('img')).toBeNull()
    expect(row.querySelector('.map-placement-stepper')).toBeNull()
    fireEvent.click(within(row).getByText('Place'))
    expect(props.onStartSinglePlacement).toHaveBeenCalledWith(barkeep)
  })

  it('selects a generic asset as the token image, and offers to delete it', () => {
    const { props } = openNonParty()
    fireEvent.change(picker(), { target: { value: 'genericToken:a-1' } })
    expect(props.setSelectedTokenAssetId).toHaveBeenCalledWith('a-1')
    const row = document.querySelector('.map-placement-stage .map-placement-row') as HTMLElement
    expect(row.className).toBe('token-row map-placement-row map-placement-row-manage')
    expect(row.querySelector('img')?.getAttribute('src')).toBe('https://img.test/a-1.png')
    fireEvent.click(button('Delete Crate'))
    expect(props.onRequestDeleteTokenAsset).toHaveBeenCalledWith('a-1')
    fireEvent.click(within(row).getByText('Place'))
    expect(props.onStartSinglePlacement).toHaveBeenCalledWith(crate)
  })

  it('clears the chosen source', () => {
    openNonParty()
    expect(screen.queryByLabelText('Clear non-party token source')).toBeNull()
    fireEvent.change(picker(), { target: { value: 'npc:n-1' } })
    fireEvent.click(button('Clear non-party token source'))
    expect(picker().value).toBe('')
    expect(screen.getByText('Choose a monster, NPC, or generic asset.')).toBeTruthy()
  })

  it('forgets a chosen source that disappears, but not the new token creator', () => {
    const { rerender } = openNonParty()
    fireEvent.change(picker(), { target: { value: 'monster:m-2' } })
    rerender({ monsterPlacementSources: [goblin] })
    expect(picker().value).toBe('')
    fireEvent.change(picker(), { target: { value: 'monster:m-1' } })
    rerender({ monsterPlacementSources: [goblin], npcPlacementSources: [] })
    expect(picker().value).toBe('monster:m-1')
    fireEvent.click(screen.getByText('New token'))
    rerender({ monsterPlacementSources: [] })
    expect(picker().value).toBe('generic:create')
  })

  it('stages a new pawn token from the creator, named from the name field', () => {
    const { props } = openNonParty({ genericPlacementSources: [] })
    expect(optionLabels()).toEqual(['Choose a source', 'Goblin', 'Ogre', 'Barkeep', 'Generic asset...'])
    fireEvent.click(screen.getByText('New token'))
    expect(screen.getByText('New token').closest('button')?.className).toBe('map-nonparty-upload-btn active')
    expect(props.setSelectedTokenAssetId).not.toHaveBeenCalled()
    expect(document.querySelector('.map-token-icon-editor')).toBeTruthy()
    const staged = document.querySelector('.map-generic-asset-stage .map-placement-row') as HTMLElement
    expect(staged.querySelector('.map-placement-source-name')?.textContent).toBe('Token')
    fireEvent.click(within(staged).getByText('Place'))
    expect(props.onStartSinglePlacement).toHaveBeenLastCalledWith({
      kind: 'genericToken',
      id: '',
      name: 'Token',
      tokenIcon: { icon: 'pawn', color: '#b45309', size: 28 },
    })
    fireEvent.change(screen.getByLabelText('Token name'), { target: { value: '   ' } })
    fireEvent.click(within(staged).getByText('Place'))
    expect(vi.mocked(props.onStartSinglePlacement).mock.calls.at(-1)?.[0].name).toBe('Token')
  })

  it('stages the selected asset from the creator under the typed name', () => {
    const { props } = openNonParty({
      selectedTokenAssetId: 'a-1',
      selectedTokenImageUrl: 'https://img.test/a-1.png',
      tokenAssets: [aTokenAsset({ id: 'a-1', name: 'Crate' })],
    })
    fireEvent.click(screen.getByText('New token'))
    const staged = document.querySelector('.map-generic-asset-stage .map-placement-row') as HTMLElement
    expect(staged.querySelector('img')?.getAttribute('src')).toBe('https://img.test/a-1.png')
    fireEvent.change(screen.getByLabelText('Token name'), { target: { value: ' Box ' } })
    fireEvent.click(within(staged).getByText('Place'))
    expect(props.onStartSinglePlacement).toHaveBeenLastCalledWith({
      ...crate,
      name: 'Box',
      tokenIcon: {
        icon: 'custom',
        color: '#b45309',
        size: 28,
        customImagePath: 'assets/a-1.png',
        customImageUrl: 'https://img.test/a-1.png',
        customImageName: 'Crate',
      },
    })
    fireEvent.change(screen.getByLabelText('Token name'), { target: { value: '' } })
    fireEvent.click(within(staged).getByText('Place'))
    expect(vi.mocked(props.onStartSinglePlacement).mock.calls.at(-1)?.[0].name).toBe('Crate')
  })

  it('selecting the creator from the list does not change the token image', () => {
    const { props } = openNonParty()
    fireEvent.change(picker(), { target: { value: 'generic:create' } })
    expect(props.setSelectedTokenAssetId).not.toHaveBeenCalled()
    expect(document.querySelector('.map-generic-asset-stage')).toBeTruthy()
  })
})

describe('scene NPCs', () => {
  const ada = anNpc({ id: 'ada', name: 'Ada', title: 'Sage', tags: ['wise', 'old'], portraitUrl: 'https://img.test/ada.png' })
  const bo = anNpc({ id: 'bo', name: 'Bo', tags: ['old', 'brave'] })
  const cy = anNpc({ id: 'cy', name: 'Cy' })

  it('shows the panel only in scene NPC mode', () => {
    const { rerender } = renderControls()
    expect(screen.queryByLabelText('Scene NPCs')).toBeNull()
    rerender({ npcSceneMode: true })
    expect(screen.getByLabelText('Scene NPCs')).toBeTruthy()
  })

  it('preloads an NPC that is not in the scene yet', () => {
    const { props, rerender } = renderControls({ npcSceneMode: true, mapNpcs: [ada, bo, cy], selectedMapSceneNpcIds: ['ada'], sceneNpcs: [ada] })
    const select = screen.getByLabelText('Select NPC to preload') as HTMLSelectElement
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['Bo', 'Cy'])
    fireEvent.click(button('Preload'))
    expect(props.onToggleSceneNpc).toHaveBeenLastCalledWith('bo', true)
    fireEvent.change(select, { target: { value: 'cy' } })
    fireEvent.click(button('Preload'))
    expect(props.onToggleSceneNpc).toHaveBeenLastCalledWith('cy', true)
    rerender({ selectedMapSceneNpcIds: ['ada', 'cy'] })
    expect(select.value).toBe('bo')

    rerender({ selectedMapSceneNpcIds: ['ada', 'bo', 'cy'] })
    expect(select.disabled).toBe(true)
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['All NPCs already preloaded'])
    expect((button('Preload') as HTMLButtonElement).disabled).toBe(true)
    vi.mocked(props.onToggleSceneNpc).mockClear()
    fireEvent.click(button('Preload'))
    expect(props.onToggleSceneNpc).not.toHaveBeenCalled()
  })

  it('lists titles in the picker', () => {
    renderControls({ npcSceneMode: true, mapNpcs: [ada] })
    expect((screen.getByLabelText('Select NPC to preload') as HTMLSelectElement).options[0].textContent).toBe('Ada - Sage')
  })

  it('presents, hides and removes scene NPCs', () => {
    const { props, rerender } = renderControls({ npcSceneMode: true, mapNpcs: [ada, bo], sceneNpcs: [ada, bo] })
    const rows = document.querySelectorAll<HTMLElement>('.scene-npc-row')
    expect(rows[0].querySelector('img')?.getAttribute('src')).toBe('https://img.test/ada.png')
    expect(rows[0].querySelector('small')?.textContent).toBe('Sage')
    expect(rows[1].querySelector('small')).toBeNull()
    expect(screen.queryByLabelText('Clear presented NPC')).toBeNull()
    fireEvent.click(within(rows[1]).getByLabelText('Present NPC'))
    expect(props.onPresentNpc).toHaveBeenCalledWith('bo')
    expect(props.setNpcSceneMode).toHaveBeenCalledWith(false)
    expect(mocks.sceneNpcModal).toBeNull()

    rerender({ presentedNpc: bo })
    const boRow = document.querySelectorAll<HTMLElement>('.scene-npc-row')[1]
    expect(boRow.className).toBe('token-row selected scene-npc-row')
    fireEvent.click(within(boRow).getByLabelText('Hide presented NPC'))
    expect(props.onClearPresentedNpc).toHaveBeenCalledTimes(1)
    fireEvent.click(button('Clear presented NPC'))
    expect(props.onClearPresentedNpc).toHaveBeenCalledTimes(2)
    fireEvent.click(within(boRow).getByLabelText('Remove from scene NPCs'))
    expect(props.onToggleSceneNpc).toHaveBeenCalledWith('bo', false)
    expect(mocks.sceneNpcModal).toBeNull()
  })

  it('opens the scene NPC editor from a row, with every NPC tag, and closes it', () => {
    renderControls({ npcSceneMode: true, mapNpcs: [ada, bo], sceneNpcs: [ada, bo] })
    fireEvent.click(document.querySelectorAll<HTMLElement>('.scene-npc-row')[0])
    expect(mocks.sceneNpcModal?.npcId).toBe('ada')
    expect(mocks.sceneNpcModal?.allTags).toEqual(['brave', 'old', 'wise'])
    fireEvent.click(button('Close editor'))
    expect(screen.queryByTestId('scene-npc-modal')).toBeNull()
  })

  it('says when no NPCs are preloaded', () => {
    renderControls({ npcSceneMode: true })
    expect(screen.getByText('No NPCs preloaded for this map.')).toBeTruthy()
  })
})

describe('the presented NPC', () => {
  const ada = anNpc({ id: 'ada', name: 'Ada', title: 'Sage', portraitUrl: 'https://img.test/ada.png', portraitFocusX: 20, portraitFocusY: 70 })
  const notesPath = 'groups/group-1/campaigns/campaign-1/npcPrivate/ada'

  it('shows the portrait, title and GM notes that arrive for that NPC', () => {
    renderControls({ presentedNpc: ada })
    const image = screen.getByAltText('Ada portrait') as HTMLImageElement
    expect(image.style.objectPosition).toBe('20% 70%')
    expect(document.querySelector('.map-npc-presented-copy')?.textContent).toContain('Sage')
    expect(screen.getByText('No GM notes.')).toBeTruthy()
    act(() => mocks.listeners[notesPath]({ data: () => ({ gmNotes: '<p>Knows <b>the</b> way<script>x</script></p>' }) }))
    expect(document.querySelector('.map-npc-presented-notes')?.innerHTML).toContain('Knows <strong>the</strong> way')
    expect(document.querySelector('.map-npc-presented-notes script')).toBeNull()
  })

  it('drops the notes of a previous NPC and stops listening when none is presented', () => {
    const { rerender } = renderControls({ presentedNpc: ada })
    act(() => mocks.listeners[notesPath]({ data: () => ({ gmNotes: 'Secret' }) }))
    rerender({ presentedNpc: anNpc({ id: 'bo', name: 'Bo' }) })
    expect(screen.getByText('No GM notes.')).toBeTruthy()
    expect(document.querySelector('.map-npc-presented-portrait img')).toBeNull()
    expect(document.querySelector('.map-npc-presented-title')?.textContent).toBe('No GM notes.')
    act(() => mocks.listeners['groups/group-1/campaigns/campaign-1/npcPrivate/bo']({ data: () => undefined }))
    expect(screen.getByText('No GM notes.')).toBeTruthy()
    rerender({ presentedNpc: null })
    expect(Object.keys(mocks.listeners)).toEqual([])
    expect(document.querySelector('.map-npc-presented-panel')).toBeNull()
  })
})

describe('the selected token controls', () => {
  const tokens = [
    aToken({ id: 't1', name: 'Mirelda', party: true, characterId: 'pc-1', color: '#112233', size: 40, rotationDeg: 370 }),
    aToken({ id: 't2', name: 'Osric', party: true, characterId: 'pc-2', revealName: true, hidden: true, flipHorizontal: true, flipVertical: true }),
    aToken({ id: 't3', name: 'Goblin', monsterId: 'm-1' }),
  ]

  it('disables every bulk control while nothing is selected', () => {
    renderControls({ tokens })
    const controls = screen.getByLabelText('Selected token controls')
    expect(controls.querySelector('.token-global-count')?.textContent).toBe('0')
    for (const label of ['Delete selected tokens', 'Toggle selected horizontal mirror', 'Toggle selected party tokens']) {
      expect((within(controls).getByLabelText(label) as HTMLButtonElement).disabled).toBe(true)
    }
    expect((within(controls).getByLabelText('Selected token color') as HTMLInputElement).value).toBe('#b45309')
    expect((within(controls).getByLabelText('Selected token size') as HTMLInputElement).value).toBe('8')
    expect(within(controls).queryByLabelText('Group selected tokens')).toBeNull()
    expect(within(controls).queryByLabelText('Selected token view distance')).toBeNull()
  })

  it('reads its values from the first selected token and edits every selected one', () => {
    const { props } = renderControls({ tokens, selectedTokenIds: ['t1', 't3'] })
    const controls = screen.getByLabelText('Selected token controls')
    expect(controls.querySelector('.token-global-count')?.textContent).toBe('2')
    expect((within(controls).getByLabelText('Selected token color') as HTMLInputElement).value).toBe('#112233')
    expect((within(controls).getByLabelText('Selected token size') as HTMLInputElement).value).toBe('40')
    expect((within(controls).getByLabelText('Selected token rotation') as HTMLInputElement).value).toBe('10')

    fireEvent.click(within(controls).getByLabelText('Delete selected tokens'))
    expect(props.onRequestDeleteTokens).toHaveBeenCalledWith(['t1', 't3'])
    fireEvent.change(within(controls).getByLabelText('Selected token color'), { target: { value: '#ff0000' } })
    expect(props.onUpdateToken).toHaveBeenCalledWith('t1', { color: '#ff0000' })
    expect(props.onUpdateToken).toHaveBeenCalledWith('t3', { color: '#ff0000' })
    fireEvent.change(within(controls).getByLabelText('Selected token size'), { target: { value: '50' } })
    expect(vi.mocked(props.onUpdateTokenSize).mock.calls).toEqual([['t1', 50], ['t3', 50]])
    fireEvent.change(within(controls).getByLabelText('Selected token rotation'), { target: { value: '90' } })
    expect(props.onUpdateToken).toHaveBeenCalledWith('t3', { rotationDeg: 90 })
  })

  it('turns each flag on unless every selected token already has it', () => {
    const { props } = renderControls({ tokens, selectedTokenIds: ['t1', 't3'] })
    const controls = screen.getByLabelText('Selected token controls')
    fireEvent.click(within(controls).getByLabelText('Toggle selected horizontal mirror'))
    fireEvent.click(within(controls).getByLabelText('Toggle selected vertical mirror'))
    fireEvent.click(within(controls).getByLabelText('Toggle selected reveal names'))
    fireEvent.click(within(controls).getByLabelText('Toggle selected hidden tokens'))
    fireEvent.click(within(controls).getByLabelText('Toggle selected party tokens'))
    expect(props.onUpdateToken).toHaveBeenCalledWith('t3', { flipHorizontal: true })
    expect(props.onUpdateToken).toHaveBeenCalledWith('t3', { flipVertical: true })
    expect(props.onUpdateToken).toHaveBeenCalledWith('t3', { revealName: true })
    expect(props.onUpdateToken).toHaveBeenCalledWith('t3', { hidden: true })
    expect(props.onUpdateToken).toHaveBeenCalledWith('t3', { party: true, viewDistance: 120 })
    expect(props.tokenViewDistanceSliderValue).toHaveBeenCalledWith(tokens[2])
  })

  it('turns each flag off when every selected token has it', () => {
    const { props } = renderControls({ tokens, selectedTokenIds: ['t2'] })
    const controls = screen.getByLabelText('Selected token controls')
    for (const label of ['Toggle selected horizontal mirror', 'Toggle selected vertical mirror', 'Toggle selected reveal names', 'Toggle selected hidden tokens', 'Toggle selected party tokens']) {
      expect(within(controls).getByLabelText(label).className).toContain('active')
      fireEvent.click(within(controls).getByLabelText(label))
    }
    expect(vi.mocked(props.onUpdateToken).mock.calls).toEqual([
      ['t2', { flipHorizontal: false }],
      ['t2', { flipVertical: false }],
      ['t2', { revealName: false }],
      ['t2', { hidden: false }],
      ['t2', { party: false }],
    ])
  })

  it('sets the view distance of the selected party tokens only', () => {
    const { props } = renderControls({ tokens, selectedTokenIds: ['t1', 't2', 't3'] })
    const distance = screen.getByLabelText('Selected token view distance')
    expect(distance.querySelector('.token-view-distance-value')?.textContent).toBe('120')
    expect(props.tokenViewDistanceSliderValue).toHaveBeenCalledWith(tokens[0])
    fireEvent.change(distance.querySelector('input') as HTMLInputElement, { target: { value: '200' } })
    expect(vi.mocked(props.onUpdateTokenViewDistance).mock.calls).toEqual([['t1', 200], ['t2', 200]])
  })
})

describe('grouping tokens', () => {
  const tokens = [
    aToken({ id: 'g1', name: 'Gob A', monsterId: 'm-1', group: 'Patrol' }),
    aToken({ id: 'g2', name: 'Gob B', monsterId: 'm-1', group: ' Patrol ' }),
    aToken({ id: 'g3', name: 'Gob C', monsterId: 'm-1' }),
    aToken({ id: 'n1', name: 'Barkeep', npcId: 'n-1' }),
  ]

  it('offers to group a selection only when it shares one category', () => {
    const { rerender } = renderControls({ tokens, selectedTokenIds: ['g3', 'n1'] })
    expect(screen.queryByLabelText('Group selected tokens')).toBeNull()
    rerender({ selectedTokenIds: ['g3'] })
    expect(screen.getByLabelText('Group selected tokens')).toBeTruthy()
  })

  it('names a new group in a dialog and applies it to every selected token', () => {
    const { props } = renderControls({ tokens, selectedTokenIds: ['g3', 'g1'] })
    fireEvent.click(screen.getByLabelText('Group selected tokens'))
    const dialog = screen.getByRole('dialog', { name: 'Name token group' })
    expect(dialog.querySelector('.token-make-group-title')?.textContent).toBe('Group 2 tokens')
    expect(dialog.textContent).toContain('Nested under Monsters.')
    const create = within(dialog).getByText('Create group') as HTMLButtonElement
    expect(create.disabled).toBe(true)
    fireEvent.keyDown(within(dialog).getByRole('textbox'), { key: 'Enter' })
    expect(props.onUpdateToken).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: ' Raiders ' } })
    fireEvent.click(create)
    expect(vi.mocked(props.onUpdateToken).mock.calls).toEqual([['g1', { group: 'Raiders' }], ['g3', { group: 'Raiders' }]])
    expect(screen.queryByRole('dialog', { name: 'Name token group' })).toBeNull()
  })

  it('creates the group on Enter and abandons it on Escape, Cancel or a click outside', () => {
    const { props } = renderControls({ tokens, selectedTokenIds: ['n1'] })
    const open = () => fireEvent.click(screen.getByLabelText('Group selected tokens'))
    open()
    const dialog = screen.getByRole('dialog', { name: 'Name token group' })
    expect(dialog.querySelector('.token-make-group-title')?.textContent).toBe('Group 1 token')
    expect(dialog.textContent).toContain('Nested under NPCs.')
    fireEvent.keyDown(within(dialog).getByRole('textbox'), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Name token group' })).toBeNull()
    open()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByRole('dialog', { name: 'Name token group' })).toBeNull()
    open()
    fireEvent.click(screen.getByText('Create group').closest('.confirm-modal') as HTMLElement)
    expect(screen.getByRole('dialog', { name: 'Name token group' })).toBeTruthy()
    fireEvent.click(screen.getByRole('dialog', { name: 'Name token group' }))
    expect(screen.queryByRole('dialog', { name: 'Name token group' })).toBeNull()
    open()
    fireEvent.change(screen.getByPlaceholderText('Group name (e.g. Goblin Patrol)'), { target: { value: 'Locals' } })
    fireEvent.keyDown(screen.getByPlaceholderText('Group name (e.g. Goblin Patrol)'), { key: 'a' })
    expect(props.onUpdateToken).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByPlaceholderText('Group name (e.g. Goblin Patrol)'), { key: 'Enter' })
    expect(props.onUpdateToken).toHaveBeenCalledWith('n1', { group: 'Locals' })
    open()
    expect((screen.getByPlaceholderText('Group name (e.g. Goblin Patrol)') as HTMLInputElement).value).toBe('')
  })

  it('disbands a named group after confirming', () => {
    const { props } = renderControls({ tokens })
    fireEvent.click(screen.getByLabelText('Disband Patrol group'))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Ungroup the 2 tokens in "Patrol"?')
    fireEvent.click(within(dialog).getByText('Cancel'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(props.onUpdateToken).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Disband Patrol group'))
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Disband'))
    expect(vi.mocked(props.onUpdateToken).mock.calls).toEqual([['g1', { group: '' }], ['g2', { group: '' }]])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says "token" for a group of one', () => {
    renderControls({ tokens: [aToken({ id: 'solo', monsterId: 'm', group: 'Solo' })] })
    fireEvent.click(screen.getByLabelText('Disband Solo group'))
    expect(screen.getByRole('dialog').textContent).toContain('Ungroup the 1 token in "Solo"?')
  })
})

describe('the token list', () => {
  const tokens = [
    aToken({ id: 'p1', name: 'Mirelda', party: true, tokenImageUrl: 'https://img.test/p1.png' }),
    aToken({ id: 'c1', name: 'Hireling', characterId: 'pc-9' }),
    aToken({ id: 'm1', name: 'Gob A', monsterId: 'm-1', group: 'Patrol' }),
    aToken({ id: 'm2', name: 'Gob B', monsterId: 'm-1', group: 'Patrol' }),
    aToken({ id: 'm3', name: '', monsterId: 'm-1' }),
    aToken({ id: 'n1', name: 'Barkeep', npcId: 'n-1' }),
    aToken({ id: 'o1', name: 'Crate' }),
  ]

  function block(label: string) {
    return screen.getByRole('region', { name: label })
  }

  function nameInput(label: string) {
    return screen.getByLabelText(label) as HTMLInputElement
  }

  it('groups tokens by category and shows only the categories in use', () => {
    const { rerender } = renderControls({ tokens })
    expect(Array.from(document.querySelectorAll('.token-group-title')).map((title) => title.textContent)).toEqual(['Party', 'Characters', 'Monsters', 'NPCs', 'Other'])
    expect(block('Monsters').querySelector('.token-group-count')?.textContent).toBe('3')
    expect(block('Party').querySelector('img')?.getAttribute('src')).toBe('https://img.test/p1.png')
    expect(nameInput('Monsters token 3 name').placeholder).toBe('Monsters 3')
    expect(nameInput('Monsters token 1 name').value).toBe('Gob A')
    expect(block('Monsters').querySelector('.token-subgroup-title')?.textContent).toBe('Patrol')
    rerender({ tokens: [tokens[5]] })
    expect(Array.from(document.querySelectorAll('.token-group-title')).map((title) => title.textContent)).toEqual(['NPCs'])
  })

  it('collapses the whole panel, a category and a named group', () => {
    renderControls({ tokens })
    fireEvent.click(button('Minimize Monsters tokens'))
    expect(screen.queryByLabelText('Monsters token 1 name')).toBeNull()
    expect(button('Expand Monsters tokens').getAttribute('data-tooltip')).toBe('Expand category')
    fireEvent.click(button('Expand Monsters tokens'))
    fireEvent.click(button('Minimize Patrol group'))
    expect(screen.queryByLabelText('Monsters token 1 name')).toBeNull()
    expect(screen.getByLabelText('Monsters token 3 name')).toBeTruthy()
    fireEvent.click(button('Expand Patrol group'))
    expect(screen.getByLabelText('Monsters token 1 name')).toBeTruthy()
    fireEvent.click(button('Collapse tokens'))
    expect(document.querySelector('.token-group-list')).toBeNull()
    expect(button('Expand tokens').textContent).toBe('+')
    fireEvent.click(button('Expand tokens'))
    expect(document.querySelector('.token-group-list')).toBeTruthy()
  })

  it('forgets a collapsed category that empties and comes back', () => {
    const { rerender } = renderControls({ tokens })
    fireEvent.click(button('Minimize NPCs tokens'))
    rerender({ tokens: tokens.filter((token) => token.id !== 'n1') })
    rerender({ tokens })
    expect(screen.getByLabelText('NPCs token 1 name')).toBeTruthy()
  })

  it('selects and deselects a whole category or named group', () => {
    const { props, rerender } = renderControls({ tokens, selectedTokenIds: ['n1'] })
    fireEvent.click(screen.getByLabelText('Select all Monsters tokens'))
    expect(lastSelection(props, ['n1', 'm2'])).toEqual(['n1', 'm2', 'm1', 'm3'])
    fireEvent.click(screen.getByLabelText('Select all Patrol tokens'))
    expect(lastSelection(props, ['m1'])).toEqual(['m1', 'm2'])
    rerender({ selectedTokenIds: ['n1', 'm1', 'm2', 'm3'] })
    expect((screen.getByLabelText('Deselect all Monsters tokens') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByLabelText('Deselect all Patrol tokens'))
    expect(lastSelection(props, ['n1', 'm1', 'm2', 'm3'])).toEqual(['n1', 'm3'])
    fireEvent.click(screen.getByLabelText('Deselect all Monsters tokens'))
    expect(lastSelection(props, ['n1', 'm1', 'm2', 'm3'])).toEqual(['n1'])
  })

  it('toggles a token from its row, and selects a range with Shift', () => {
    const { props, rerender } = renderControls({ tokens })
    const row = (label: string) => nameInput(label).closest('.token-row') as HTMLElement
    fireEvent.click(row('Characters token 1 name'))
    expect(lastSelection(props, [])).toEqual(['c1'])
    rerender({ selectedTokenIds: ['c1'] })
    expect(row('Characters token 1 name').className).toBe('token-row selected')
    fireEvent.click(row('NPCs token 1 name'), { shiftKey: true })
    expect(lastSelection(props, ['c1'])).toEqual(['c1', 'm1', 'm2', 'm3', 'n1'])
    fireEvent.click(row('Party token 1 name'), { shiftKey: true })
    expect(lastSelection(props, ['x'])).toEqual(['x', 'p1', 'c1', 'm1', 'm2', 'm3', 'n1'])
    fireEvent.click(row('Party token 1 name'))
    expect(lastSelection(props, ['p1', 'c1'])).toEqual(['c1'])
  })

  it('toggles a single token when Shift is held without an anchor', () => {
    const { props } = renderControls({ tokens })
    const row = (label: string) => nameInput(label).closest('.token-row') as HTMLElement
    fireEvent.click(row('Other token 1 name'), { shiftKey: true })
    expect(lastSelection(props, [])).toEqual(['o1'])
  })

  it('toggles a single token when the Shift anchor has left the list', () => {
    const { props, rerender } = renderControls({ tokens })
    const row = (label: string) => nameInput(label).closest('.token-row') as HTMLElement
    fireEvent.click(row('Other token 1 name'))
    rerender({ tokens: tokens.filter((token) => token.id !== 'o1') })
    fireEvent.click(row('NPCs token 1 name'), { shiftKey: true })
    expect(lastSelection(props, ['o1'])).toEqual(['o1', 'n1'])
  })

  it('ignores clicks on the controls inside a row', () => {
    const { props } = renderControls({ tokens })
    fireEvent.click(nameInput('Other token 1 name'))
    expect(props.onSelectedTokenIdsChange).not.toHaveBeenCalled()
  })

  it('renames a token on blur or Enter, only when the name changed', async () => {
    const { props } = renderControls({ tokens })
    const input = nameInput('NPCs token 1 name')
    fireEvent.focus(input)
    expect(lastSelection(props, [])).toEqual(['n1'])
    expect(lastSelection(props, ['n1'])).toEqual(['n1'])
    fireEvent.change(input, { target: { value: 'Innkeeper ' } })
    expect(input.value).toBe('Innkeeper ')
    fireEvent.keyDown(input, { key: 'a' })
    fireEvent.keyDown(input, { key: 'Enter' })
    await act(async () => {
      fireEvent.blur(input, { target: { value: 'Innkeeper ' } })
    })
    expect(props.onUpdateToken).toHaveBeenCalledWith('n1', { name: 'Innkeeper' })
    expect(input.value).toBe('Barkeep')

    vi.mocked(props.onUpdateToken).mockClear()
    fireEvent.focus(input)
    await act(async () => {
      fireEvent.blur(input, { target: { value: ' Barkeep' } })
    })
    expect(props.onUpdateToken).not.toHaveBeenCalled()
  })

  it('blurs the name field on Enter', () => {
    renderControls({ tokens })
    const input = nameInput('NPCs token 1 name')
    input.focus()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(document.activeElement).not.toBe(input)
  })

  it('hides the token cards in the player view preview', () => {
    renderControls({ tokens, playerViewPreview: true })
    expect(screen.queryByLabelText('Token cards')).toBeNull()
  })
})
