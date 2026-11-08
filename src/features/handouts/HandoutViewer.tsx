import { lazy, Suspense, useEffect, useState } from 'react'
import type { Handout } from './handoutModel'
import { loadHandoutFile } from './handoutStorage'
import { HandoutImage } from './HandoutImage'

const HandoutPdf = lazy(() => import('./HandoutPdf'))

export function HandoutViewer({ handout }: { handout: Handout }) {
  if (handout.kind === 'text') return <article className="handout-text">{handout.text}</article>
  return <HandoutFile key={handout.storagePath} handout={handout} />
}

function HandoutFile({ handout }: { handout: Handout }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    let objectUrl = ''
    void loadHandoutFile(handout.storagePath).then((blob) => {
      if (!active) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch((reason: Error) => { if (active) setError(reason.message) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [handout.storagePath, attempt])
  if (error) return <div><p role="alert">Unable to load this handout. {error}</p><button type="button" onClick={() => { setError(''); setAttempt(attempt + 1) }}>Retry</button></div>
  if (!url) return <p role="status">Loading handout...</p>
  return <div className="handout-media">
    {handout.kind === 'pdf'
      ? <Suspense fallback={<p role="status">Loading PDF viewer...</p>}><HandoutPdf url={url} title={handout.title} fileName={handout.fileName} /></Suspense>
      : <HandoutImage url={url} title={handout.title} fileName={handout.fileName} />}
  </div>
}
