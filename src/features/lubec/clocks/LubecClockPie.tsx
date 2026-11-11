import type { KeyboardEvent } from 'react'
import { lubecPiePaths, lubecPiecesLabel } from './lubecClock'

type LubecClockPieProps = {
  pieces: number
  /** The filled pieces' indexes. */
  filled: readonly number[]
  /** The clock's name, for the pieces' labels; a pie with no `onToggle` is a picture only. */
  name?: string
  /** Called with a pressed piece's index and whether it should now be filled. */
  onToggle?: (index: number, filled: boolean) => void
}

type PiePieceProps = { path: string; index: number; isFilled: boolean; name: string; onToggle: NonNullable<LubecClockPieProps['onToggle']> }

// Each piece fills or empties itself alone, in any order.
function PiePiece({ path, index, isFilled, name, onToggle }: PiePieceProps) {
  const press = () => onToggle(index, !isFilled)
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    press()
  }
  return (
    <path d={path} className={isFilled ? 'piece filled' : 'piece'} role="button" tabIndex={0}
      aria-label={`${name}: ${isFilled ? 'empty' : 'fill'} piece ${index + 1}`} aria-pressed={isFilled}
      onClick={press} onKeyDown={onKeyDown} />
  )
}

/** The clock's face: its pieces from the top, clockwise, the filled ones in rust. */
export function LubecClockPie({ pieces, filled, name, onToggle }: LubecClockPieProps) {
  const paths = lubecPiePaths(pieces)
  return (
    <svg className="lubec-clock-pie" viewBox="0 0 100 100" role="group" aria-label={`${lubecPiecesLabel(pieces)}, ${filled.length} filled`}>
      {paths.map((path, index) => onToggle && name !== undefined
        ? <PiePiece key={index} path={path} index={index} isFilled={filled.includes(index)} name={name} onToggle={onToggle} />
        : <path key={index} d={path} className={filled.includes(index) ? 'piece filled' : 'piece'} />)}
      <circle className="rim" cx="50" cy="50" r="45" />
    </svg>
  )
}
