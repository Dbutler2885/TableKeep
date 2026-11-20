// @vitest-environment jsdom
import { useCallback, useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HandoutLightbox } from './HandoutLightbox'

function Host({ resetKey = 'image', hideTrigger = false }: { resetKey?: string; hideTrigger?: boolean }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return <>{hideTrigger ? null : <button type="button" onClick={() => setOpen(true)}>Open clue</button>}
    {open ? <HandoutLightbox title="Old map" width={2000} height={1600} onClose={close} resetKey={resetKey}>{() => <img src="blob:clue" alt="Old map" />}</HandoutLightbox> : null}</>
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe() { this.callback([{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
    disconnect() {}
  })
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number
    constructor(type: string, options: PointerEventInit) { super(type, options); this.pointerId = options.pointerId ?? 1 }
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Open clue' }))
  const dialog = screen.getByRole('dialog', { name: 'Old map' })
  const stage = within(dialog).getByRole('region', { name: 'Pan and zoom handout' })
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) })
  return { dialog, stage, controls: within(dialog), media: dialog.querySelector('.handout-lightbox-media') as HTMLDivElement }
}

describe('full-size handout viewer', () => {
  it('closes safely when its original trigger has disappeared', () => {
    const view = render(<Host />)
    const trigger = screen.getByRole('button', { name: 'Open clue' })
    trigger.focus()
    const { controls } = open()
    view.rerender(<Host hideTrigger />)
    expect(trigger.isConnected).toBe(false)
    const restoreFocus = vi.spyOn(trigger, 'focus')
    fireEvent.click(controls.getByRole('button', { name: 'Close full-size viewer' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(restoreFocus).not.toHaveBeenCalled()
    expect(document.body.inert).not.toBe(true)
  })

  it('opens at original size, zooms with buttons, resets, and restores focus on close', () => {
    render(<Host />)
    const trigger = screen.getByRole('button', { name: 'Open clue' })
    trigger.focus()
    const { controls } = open()
    expect(controls.getByLabelText('Zoom level').textContent).toBe('100%')
    expect(document.activeElement).toBe(controls.getByRole('button', { name: 'Close full-size viewer' }))
    fireEvent.click(controls.getByRole('button', { name: 'Zoom in' }))
    expect(controls.getByLabelText('Zoom level').textContent).toBe('125%')
    fireEvent.click(controls.getByRole('button', { name: 'Zoom out' }))
    expect(controls.getByLabelText('Zoom level').textContent).toBe('100%')
    fireEvent.click(controls.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(controls.getByRole('button', { name: 'Reset zoom' }))
    expect(controls.getByLabelText('Zoom level').textContent).toBe('100%')
    fireEvent.click(controls.getByRole('button', { name: 'Close full-size viewer' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
  it('zooms with the wheel and trackpad pinch while enforcing zoom limits', () => {
    render(<Host />)
    const { controls, stage } = open()
    fireEvent.wheel(stage, { deltaY: -100, clientX: 400, clientY: 300 })
    expect(Number(controls.getByLabelText('Zoom level').textContent?.replace('%', ''))).toBeGreaterThan(100)
    fireEvent.wheel(stage, { deltaY: -1000, ctrlKey: true, clientX: 400, clientY: 300 })
    expect(controls.getByLabelText('Zoom level').textContent).toBe('800%')
    expect((controls.getByRole('button', { name: 'Zoom in' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.wheel(stage, { deltaY: 1000, ctrlKey: true, clientX: 400, clientY: 300 })
    expect(controls.getByLabelText('Zoom level').textContent).toBe('10%')
    expect((controls.getByRole('button', { name: 'Zoom out' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('pans with mouse drag and continues smoothly after a two-finger pinch', () => {
    render(<Host />)
    const { stage, media, controls } = open()
    fireEvent.pointerDown(stage, { pointerId: 9, clientX: 400, clientY: 300, button: 2 })
    fireEvent.pointerMove(stage, { pointerId: 9, clientX: 500, clientY: 350 })
    expect(media.style.transform).toContain('translate(0px, 0px)')
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 400, clientY: 300, button: 0 })
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 480, clientY: 350 })
    expect(media.style.transform).toContain('translate(80px, 50px)')
    fireEvent.pointerUp(stage, { pointerId: 1 })
    fireEvent.click(controls.getByRole('button', { name: 'Reset zoom' }))
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 350, clientY: 300, button: 0 })
    fireEvent.pointerDown(stage, { pointerId: 2, clientX: 450, clientY: 300, button: 0 })
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 300, clientY: 300 })
    fireEvent.pointerMove(stage, { pointerId: 2, clientX: 500, clientY: 300 })
    expect(controls.getByLabelText('Zoom level').textContent).toBe('200%')
    fireEvent.pointerCancel(stage, { pointerId: 1 })
    fireEvent.pointerMove(stage, { pointerId: 2, clientX: 520, clientY: 300 })
    expect(media.style.transform).toContain('translate(20px, 0px)')
  })
  it('supports keyboard zoom, traps focus, and closes with Escape or the backdrop', () => {
    render(<Host />)
    const { controls, stage } = open()
    fireEvent.keyDown(stage, { key: '+' })
    expect(controls.getByLabelText('Zoom level').textContent).toBe('125%')
    fireEvent.keyDown(stage, { key: '-' })
    fireEvent.keyDown(stage, { key: '0' })
    expect(controls.getByLabelText('Zoom level').textContent).toBe('100%')
    stage.focus()
    fireEvent.keyDown(stage, { key: 'Tab' })
    expect(document.activeElement).toBe(controls.getByRole('button', { name: 'Zoom out' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(stage)
    fireEvent.keyDown(stage, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    open()
    fireEvent.click(document.querySelector('.handout-lightbox-overlay')!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('resets the transform for a different PDF page without losing the dialog', () => {
    const view = render(<Host resetKey="page-1" />)
    const { controls, dialog } = open()
    fireEvent.click(controls.getByRole('button', { name: 'Zoom in' }))
    view.rerender(<Host resetKey="page-2" />)
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(controls.getByLabelText('Zoom level').textContent).toBe('100%')
  })
})
