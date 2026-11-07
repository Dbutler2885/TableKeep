// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getDocument: vi.fn(), getPage: vi.fn(), destroy: vi.fn(), cancel: vi.fn() }))
vi.mock('pdfjs-dist', () => ({ getDocument: mocks.getDocument, GlobalWorkerOptions: {} }))
import HandoutPdf from './HandoutPdf'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  mocks.getPage.mockResolvedValue({ getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }), render: () => ({ promise: Promise.resolve(), cancel: mocks.cancel }) })
  mocks.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage: mocks.getPage }), destroy: mocks.destroy })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('PDF handout pages', () => {
  it('renders one readable page at a time, navigates, and changes zoom', async () => {
    const view = render(<HandoutPdf url="blob:pdf" />)
    expect(screen.getByRole('status').textContent).toBe('Loading PDF...')
    await screen.findByText('Page 1 of 2')
    expect((screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled).toBe(true)
    await waitFor(() => expect(Number(screen.getByLabelText('PDF page 1').getAttribute('width'))).toBeGreaterThan(770))
    fireEvent.change(screen.getByLabelText('Zoom'), { target: { value: '2' } })
    await waitFor(() => expect(screen.getByLabelText('PDF page 1').getAttribute('width')).toBe('1200'))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await screen.findByText('Page 2 of 2')
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    await screen.findByText('Page 1 of 2')
    view.unmount()
    expect(mocks.destroy).toHaveBeenCalled()
    expect(mocks.cancel).toHaveBeenCalled()
  })
  it('reports an unreadable PDF', async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.reject(new Error('Invalid PDF')), destroy: mocks.destroy })
    render(<HandoutPdf url="blob:bad-pdf" />)
    expect((await screen.findByRole('alert')).textContent).toContain('Invalid PDF')
  })
  it('reports a page rendering failure', async () => {
    mocks.getPage.mockRejectedValue(new Error('Damaged page'))
    render(<HandoutPdf url="blob:damaged" />)
    expect((await screen.findByRole('alert')).textContent).toContain('Damaged page')
  })
})
