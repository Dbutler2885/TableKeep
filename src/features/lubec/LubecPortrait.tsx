import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import { lubecCharacterName } from './lubecNames'

type Portrayed = Pick<LubecCharacterRecord, 'name' | 'portraitUrl' | 'portraitFocusX' | 'portraitFocusY'>

/** A character's portrait, or the empty frame until there is one. */
export function LubecPortrait({ character }: { character: Portrayed }) {
  if (!character.portraitUrl) {
    return <div className="lubec-portrait" role="img" aria-label="No photo yet"><span>Photo</span></div>
  }
  return (
    <img
      className="lubec-portrait"
      src={character.portraitUrl}
      alt={`${lubecCharacterName(character)} portrait`}
      style={{ objectPosition: `${character.portraitFocusX}% ${character.portraitFocusY}%` }}
    />
  )
}
