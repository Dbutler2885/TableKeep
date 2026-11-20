import { Fragment, type ReactNode } from 'react'

// A wound table row's own words, as the table file writes them: its line
// breaks kept, **bold** names, *italic* lasting injuries and `amounts` drawn
// as they are marked, and not one word changed.

const MARKS = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g

function inline(text: string): ReactNode[] {
  return text.split(MARKS).filter(Boolean).map((piece, index) => {
    if (piece.startsWith('**')) return <b key={index}>{piece.slice(2, -2)}</b>
    if (piece.startsWith('`')) return <span key={index} className="lubec-table-amount">{piece.slice(1, -1)}</span>
    if (piece.startsWith('*')) return <i key={index}>{piece.slice(1, -1)}</i>
    return <Fragment key={index}>{piece}</Fragment>
  })
}

export function LubecTableWords({ text, className }: { text: string; className?: string }) {
  const lines = text.split(/<br\s*\/?>/)
  return (
    <p className={['lubec-table-words', className].filter(Boolean).join(' ')}>
      {lines.map((line, index) => <Fragment key={index}>{index ? <br /> : null}{inline(line.trim())}</Fragment>)}
    </p>
  )
}
