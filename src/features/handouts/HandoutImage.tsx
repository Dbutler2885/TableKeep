import { useCallback, useState } from 'react'
import { HandoutLightbox } from './HandoutLightbox'
import { HandoutMediaActions } from './HandoutMediaActions'

export function HandoutImage({ url, title, fileName }: { url: string; title: string; fileName: string }) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return <div className="handout-media-reader">
    <HandoutMediaActions url={url} fileName={fileName} onOpen={() => setOpen(true)} disabled={!size.width} />
    <button type="button" className="handout-media-preview" aria-label={`Open ${title} full size`} title="Click to open full size" onClick={() => setOpen(true)} disabled={!size.width}>
      <img className="handout-image" src={url} alt={title} draggable={false} onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
    </button>
    {open ? <HandoutLightbox title={title} width={size.width} height={size.height} onClose={close}>
      {() => <img src={url} alt={title} draggable={false} />}
    </HandoutLightbox> : null}
  </div>
}
