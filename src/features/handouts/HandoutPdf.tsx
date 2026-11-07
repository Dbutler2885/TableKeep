import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export default function HandoutPdf({ url }: { url: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState('fit')
  useEffect(() => {
    let active = true
    const task = getDocument({ url })
    void task.promise.then((loaded) => { if (active) setDocument(loaded) }, (reason: Error) => { if (active) setError(reason.message) })
    return () => { active = false; void task.destroy() }
  }, [url])
  if (error) return <p role="alert">Unable to display this PDF: {error}</p>
  if (!document) return <p role="status">Loading PDF...</p>
  return <div className="handout-pdf">
    <div className="handout-view-controls">
      <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous page</button>
      <span>Page {page} of {document.numPages}</span>
      <button type="button" disabled={page >= document.numPages} onClick={() => setPage(page + 1)}>Next page</button>
      <label>Zoom<select value={zoom} onChange={(event) => setZoom(event.target.value)}><option value="fit">Fit width</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option></select></label>
    </div>
    <PdfPage key={`${page}/${zoom}`} document={document} page={page} zoom={zoom} />
  </div>
}

function PdfPage({ document, page, zoom }: { document: PDFDocumentProxy; page: number; zoom: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [rendered, setRendered] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined
    void document.getPage(page).then(async (pdfPage) => {
      if (cancelled) return
      const base = pdfPage.getViewport({ scale: 1 })
      const scale = zoom === 'fit' ? Math.max(0.1, (width - 24) / base.width) : Number(zoom)
      const viewport = pdfPage.getViewport({ scale })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      renderTask = pdfPage.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
      await renderTask.promise
      if (!cancelled) setRendered(true)
    }).catch((reason: Error) => { if (!cancelled) setError(reason.message) })
    return () => { cancelled = true; renderTask?.cancel() }
  }, [document, page, width, zoom])
  return <div ref={containerRef} className="handout-page-scroll">{error ? <p role="alert">{error}</p> : null}<canvas ref={canvasRef} aria-label={`PDF page ${page}`} aria-busy={!rendered} /></div>
}
