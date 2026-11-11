import type { KeyboardEvent } from 'react'
import { lubecFillAfterPress, lubecPiePaths, lubecPiecesLabel } from './lubecClock'

type LubecClockPieProps = {
  pieces: number
  filled: number
  /** The clock's name, for the pieces' labels; a pie with no `onPress` is a picture only. */
  name?: string
  /** Called with the fill a press on a piece asks for. */
  onPress?: (filled: number) => void
}

// What pressing a piece does, named by the piece so no two pieces share a label.
function pressLabel(name: string, filled: number, index: number) {
  const piece = index + 1
  if (piece > filled) return `${name}: fill to piece ${piece}`
  if (piece === filled) return `${name}: empty piece ${piece}`
  return `${name}: empty after piece ${piece}`
}

function PiePiece({ path, index, filled, name, onPress }: { path: string; index: number } & Required<Omit<LubecClockPieProps, 'pieces'>>) {
  const after = lubecFillAfterPress(filled, index)
  const press = () => onPress(after)
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    press()
  }
  return (
    <path d={path} className={index < filled ? 'piece filled' : 'piece'} role="button" tabIndex={0}
      aria-label={pressLabel(name, filled, index)} aria-pressed={index < filled}
      onClick={press} onKeyDown={onKeyDown} />
  )
}

/** The clock's face: its pieces from the top, clockwise, the filled ones in rust. */
export function LubecClockPie({ pieces, filled, name, onPress }: LubecClockPieProps) {
  const paths = lubecPiePaths(pieces)
  return (
    <svg className="lubec-clock-pie" viewBox="0 0 100 100" role="group" aria-label={`${lubecPiecesLabel(pieces)}, ${filled} filled`}>
      {paths.map((path, index) => onPress && name !== undefined
        ? <PiePiece key={index} path={path} index={index} filled={filled} name={name} onPress={onPress} />
        : <path key={index} d={path} className={index < filled ? 'piece filled' : 'piece'} />)}
      <circle className="rim" cx="50" cy="50" r="45" />
    </svg>
  )
}
