import type { ReactNode } from 'react'
import { Maximize2 } from 'lucide-react'

export function HandoutMediaActions({ url, fileName, onOpen, disabled, children }: {
  url: string; fileName: string; onOpen: () => void; disabled?: boolean; children?: ReactNode
}) {
  return <div className="handout-view-controls">
    <a href={url} download={fileName}>Download original</a>
    {children}
    <button type="button" onClick={onOpen} disabled={disabled}><Maximize2 size={15} />Open full size</button>
  </div>
}
