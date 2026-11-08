import { useEffect, useRef, useState } from 'react'
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { pdfRasterScale } from './handoutViewport'

export function HandoutPdfCanvas({ page, displayScale, rasterScale = displayScale }: {
  page: PDFPageProxy; displayScale: number; rasterScale?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [result, setResult] = useState({ key: '', error: '' })
  const key = `${page.pageNumber}/${displayScale}/${rasterScale}`
  const base = page.getViewport({ scale: 1 })
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let active = true
    let task: RenderTask | undefined
    void Promise.resolve().then(async () => {
      if (!active) return
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const natural = page.getViewport({ scale: 1 })
      const scale = pdfRasterScale(natural, rasterScale, ratio)
      const viewport = page.getViewport({ scale })
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio))
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio))
      task = page.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
      await task.promise
      if (active) setResult({ key, error: '' })
    }).catch((error: Error) => { if (active) setResult({ key, error: error.message }) })
    return () => { active = false; task?.cancel() }
  }, [key, page, rasterScale])
  const error = result.key === key ? result.error : ''
  return <>
    {error ? <p role="alert">{error}</p> : null}
    <canvas ref={canvasRef} aria-label={`PDF page ${page.pageNumber}`} aria-busy={result.key !== key} style={{ width: base.width * displayScale, height: base.height * displayScale }} />
  </>
}
