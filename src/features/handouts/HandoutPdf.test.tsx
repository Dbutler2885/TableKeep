// @vitest-environment jsdom
import { StrictMode } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getDocument: vi.fn(), getPage: vi.fn(), destroy: vi.fn(), cancel: vi.fn(), render: vi.fn() }))
vi.mock('pdfjs-dist', () => ({ getDocument: mocks.getDocument, GlobalWorkerOptions: {} }))
import HandoutPdf from './HandoutPdf'
import { HandoutPdfCanvas } from './HandoutPdfCanvas'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe() { this.callback([{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
    disconnect() {}
  })
  mocks.render.mockImplementation(() => ({ promise: Promise.resolve(), cancel: mocks.cancel }))
  mocks.getPage.mockImplementation(async (number: number) => ({ pageNumber: number, getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }), render: mocks.render }))
  mocks.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage: mocks.getPage }), destroy: mocks.destroy })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('PDF handout pages', () => {
  it('cancels pending renders and ignores late results from previous pages', async () => {
    const tasks = [Promise.withResolvers<void>(), Promise.withResolvers<void>(), Promise.withResolvers<void>()]
    const cancels = [vi.fn(), vi.fn(), vi.fn()]
    tasks.forEach((task, index) => mocks.render.mockImplementationOnce(() => ({ promise: task.promise, cancel: cancels[index] })))
    const pages = await Promise.all([1, 2, 3].map((number) => mocks.getPage(number) as Promise<PDFPageProxy>))
    const view = render(<HandoutPdfCanvas page={pages[0]} displayScale={1} />)
    await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1))
    view.rerender(<HandoutPdfCanvas page={pages[1]} displayScale={1} />)
    await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(2))
    expect(cancels[0]).toHaveBeenCalledTimes(1)
    view.rerender(<HandoutPdfCanvas page={pages[2]} displayScale={1} />)
    await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(3))
    expect(cancels[1]).toHaveBeenCalledTimes(1)
    await act(async () => { tasks[0].resolve(); tasks[1].reject(new Error('Rendering cancelled')) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('PDF page 3').getAttribute('aria-busy')).toBe('true')
    await act(async () => tasks[2].resolve())
    expect(screen.getByLabelText('PDF page 3').getAttribute('aria-busy')).toBe('false')
    view.unmount()
    expect(cancels[2]).toHaveBeenCalledTimes(1)
  })

  it('does not start queued rendering after the viewer closes, including StrictMode cleanup', async () => {
    const page = await mocks.getPage(1) as PDFPageProxy
    const view = render(<StrictMode><HandoutPdfCanvas page={page} displayScale={1} /></StrictMode>)
    view.unmount()
    await act(async () => { await Promise.resolve() })
    expect(mocks.render).not.toHaveBeenCalled()
  })

  it('fits both dimensions, navigates pages, and zooms in a full-size viewer without fetching another document', async () => {
    const view = render(<HandoutPdf url="blob:pdf" title="Harbour records" />)
    expect(screen.getByRole('status').textContent).toBe('Loading PDF...')
    await screen.findByText('Page 1 of 2')
    await waitFor(() => expect(screen.getByLabelText('PDF page 1').getAttribute('aria-busy')).toBe('false'))
    const preview = screen.getByLabelText('PDF page 1')
    expect(Number(preview.getAttribute('width'))).toBeLessThanOrEqual(800)
    expect(Number(preview.getAttribute('height'))).toBeLessThanOrEqual(600)
    expect((screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await screen.findByText('Page 2 of 2')
    await waitFor(() => expect(screen.getByLabelText('PDF page 2').getAttribute('aria-busy')).toBe('false'))
    fireEvent.click(screen.getByRole('button', { name: 'Open Harbour records full size' }))
    const dialog = screen.getByRole('dialog', { name: 'Harbour records' })
    const controls = within(dialog)
    expect(controls.getByLabelText('Zoom level').textContent).toBe('100%')
    await waitFor(() => expect(controls.getByLabelText('PDF page 2').getAttribute('width')).toBe('600'))
    fireEvent.click(controls.getByRole('button', { name: 'Zoom in' }))
    await waitFor(() => expect(Number(controls.getByLabelText('PDF page 2').getAttribute('width'))).toBeGreaterThan(600))
    fireEvent.click(controls.getByRole('button', { name: 'Previous page' }))
    await waitFor(() => expect(controls.getByLabelText('PDF page 1').getAttribute('aria-busy')).toBe('false'))
    expect(controls.getByLabelText('Zoom level').textContent).toBe('100%')
    fireEvent.click(controls.getByRole('button', { name: 'Close full-size viewer' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.getDocument).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(mocks.destroy).toHaveBeenCalled()
    expect(mocks.cancel).toHaveBeenCalled()
  })
  it('reports an unreadable PDF', async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.reject(new Error('Invalid PDF')), destroy: mocks.destroy })
    render(<HandoutPdf url="blob:bad-pdf" />)
    expect((await screen.findByRole('alert')).textContent).toContain('Invalid PDF')
  })
  it('reports a page loading failure', async () => {
    mocks.getPage.mockRejectedValue(new Error('Damaged page'))
    render(<HandoutPdf url="blob:damaged" />)
    expect((await screen.findByRole('alert')).textContent).toContain('Damaged page')
  })
  it('reports a canvas rendering failure', async () => {
    mocks.render.mockImplementation(() => ({ promise: Promise.reject(new Error('Render failed')), cancel: mocks.cancel }))
    render(<HandoutPdf url="blob:render-failure" />)
    expect((await screen.findByRole('alert')).textContent).toContain('Render failed')
  })
})
