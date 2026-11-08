import { useCallback, useDeferredValue, useEffect, useRef, useState, type ReactNode } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { HandoutPdfCanvas } from './HandoutPdfCanvas'
import { HandoutLightbox } from './HandoutLightbox'
import { HandoutMediaActions } from './HandoutMediaActions'
import { useHandoutElementSize } from './useHandoutElementSize'
import { fitMediaScale } from './handoutViewport'

GlobalWorkerOptions.workerSrc = workerUrl

type Props = { url: string; title?: string; fileName?: string }
export default function HandoutPdf({ url, title = 'PDF handout', fileName = 'handout.pdf' }: Props) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const task = getDocument({ url })
    void task.promise.then((loaded) => { if (active) setDocument(loaded) }, (reason: Error) => { if (active) setError(reason.message) })
    return () => { active = false; void task.destroy() }
  }, [url])
  if (error) return <p role="alert">Unable to display this PDF: {error}</p>
  if (!document) return <p role="status">Loading PDF...</p>
  return <PdfReader document={document} url={url} title={title} fileName={fileName} />
}

function usePdfPage(document: PDFDocumentProxy, number: number) {
  const [result, setResult] = useState<{ number: number; page: PDFPageProxy | null; error: string }>({ number: 0, page: null, error: '' })
  useEffect(() => {
    let active = true
    void document.getPage(number).then(
      (page) => { if (active) setResult({ number, page, error: '' }) },
      (error: Error) => { if (active) setResult({ number, page: null, error: error.message }) },
    )
    return () => { active = false }
  }, [document, number])
  return result.number === number ? result : { number, page: null, error: '' }
}

function PdfReader({ document, url, title, fileName }: Required<Props> & { document: PDFDocumentProxy }) {
  const [number, setNumber] = useState(1)
  const [open, setOpen] = useState(false)
  const { page, error } = usePdfPage(document, number)
  const close = useCallback(() => setOpen(false), [])
  const navigation = <PdfNavigation number={number} count={document.numPages} onPage={setNumber} />
  return <div className="handout-media-reader handout-pdf">
    <HandoutMediaActions url={url} fileName={fileName} onOpen={() => setOpen(true)} disabled={!page}>{navigation}</HandoutMediaActions>
    <PdfPagePreview page={page} error={error} title={title} onOpen={() => setOpen(true)} />
    {open ? <PdfLightbox page={page} error={error} title={title} onClose={close} navigation={navigation} number={number} /> : null}
  </div>
}

function PdfPagePreview({ page, error, title, onOpen }: { page: PDFPageProxy | null; error: string; title: string; onOpen: () => void }) {
  if (error) return <p role="alert">{error}</p>
  if (!page) return <p role="status">Loading PDF page...</p>
  return <PdfPreview page={page} title={title} onOpen={onOpen} />
}

function PdfLightbox({ page, error, title, onClose, navigation, number }: {
  page: PDFPageProxy | null; error: string; title: string; onClose: () => void; navigation: ReactNode; number: number
}) {
  const size = page?.getViewport({ scale: 1 }) ?? { width: 600, height: 800 }
  return <HandoutLightbox title={title} width={size.width} height={size.height} onClose={onClose} navigation={navigation} resetKey={number}>
    {(scale) => <PdfFullContent page={page} error={error} scale={scale} />}
  </HandoutLightbox>
}

function PdfFullContent({ page, error, scale }: { page: PDFPageProxy | null; error: string; scale: number }) {
  if (page) return <FullPdfPage page={page} scale={scale} />
  return <p className="handout-full-message" role={error ? 'alert' : 'status'}>{error || 'Loading PDF page...'}</p>
}

function PdfNavigation({ number, count, onPage }: { number: number; count: number; onPage: (number: number) => void }) {
  return <>
    <button type="button" disabled={number <= 1} onClick={() => onPage(number - 1)}>Previous page</button>
    <span>Page {number} of {count}</span>
    <button type="button" disabled={number >= count} onClick={() => onPage(number + 1)}>Next page</button>
  </>
}

function PdfPreview({ page, title, onOpen }: { page: PDFPageProxy; title: string; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const size = useHandoutElementSize(ref)
  const scale = fitMediaScale(page.getViewport({ scale: 1 }), size)
  return <button ref={ref} type="button" className="handout-media-preview handout-pdf-preview" aria-label={`Open ${title} full size`} title="Click to open full size" onClick={onOpen}>
    {scale > 0 ? <HandoutPdfCanvas page={page} displayScale={scale} /> : <span role="status">Preparing PDF preview...</span>}
  </button>
}

function FullPdfPage({ page, scale }: { page: PDFPageProxy; scale: number }) {
  const rasterScale = useDeferredValue(scale)
  return <HandoutPdfCanvas page={page} displayScale={1} rasterScale={rasterScale} />
}
