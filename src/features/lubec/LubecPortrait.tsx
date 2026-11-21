import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import type { LubecCondition } from '../ruleSets/lubec/condition'
import { LubecConditionOverlay } from './LubecConditionOverlay'
import { lubecCharacterName } from './lubecNames'

type Portrayed = Pick<LubecCharacterRecord, 'name' | 'portraitUrl' | 'portraitFocusX' | 'portraitFocusY'> & { lubec?: { condition?: LubecCondition }; condition?: LubecCondition }

/** A character's portrait, or the empty frame until there is one. */
export function LubecPortrait({ character }: { character: Portrayed }) {
  return <div className="lubec-portrait-frame">
    {character.portraitUrl ? <img className="lubec-portrait" src={character.portraitUrl} alt={`${lubecCharacterName(character)} portrait`} style={{ objectPosition: `${character.portraitFocusX}% ${character.portraitFocusY}%` }} /> : <div className="lubec-portrait" role="img" aria-label="No photo yet"><span>Photo</span></div>}
    <LubecConditionOverlay condition={character.lubec?.condition ?? character.condition} />
  </div>
}
