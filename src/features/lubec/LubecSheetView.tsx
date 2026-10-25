import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { lubecClass } from '../ruleSets/lubec/classes'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import type { LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import type { LubecSkills } from '../ruleSets/lubec/skillPicks'
import { LubecCorePage } from './LubecCorePage'
import type { LubecCountersChange } from './LubecCountersPanel'
import { LubecDraftBar } from './LubecDraftBar'
import { LubecMissing } from './LubecMissing'
import { LubecNameBandEditor, type LubecSheetEditing } from './LubecNameBandEditor'
import { LubecSkillsPage } from './LubecSkillsPage'
import { lubecCharacterName } from './lubecNames'
import lubecPines from './lubecPines.svg'

type LubecPage = 'core' | 'skills'

const LUBEC_PAGES: readonly (readonly [LubecPage, string])[] = [['core', 'Core sheet'], ['skills', 'Skills']]

function LubecPortrait({ character }: { character: LubecCharacterRecord }) {
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

function LubecPageTabs({ page, onPage }: { page: LubecPage; onPage: (page: LubecPage) => void }) {
  return (
    <nav className="lubec-page-tabs" aria-label="Character sheet pages">
      {LUBEC_PAGES.map(([id, label]) => (
        <button key={id} type="button" aria-current={id === page ? 'page' : undefined} onClick={() => onPage(id)}>
          {label}
        </button>
      ))}
    </nav>
  )
}

type MastheadProps = {
  character: LubecCharacterRecord
  page: LubecPage
  onPage: (page: LubecPage) => void
  /** Opens the name band's edits; absent for a viewer who cannot edit. */
  onEdit: (() => void) | null
}

function LubecKidMeta({ character }: { character: LubecCharacterRecord }) {
  const { age } = character.lubec
  return (
    <div className="lubec-kid-meta">
      <span>{lubecClass(character.lubec.class.key)?.name ?? <LubecMissing />}</span>
      {age === null ? null : <span className="lubec-kid-age">Age {age}</span>}
    </div>
  )
}

// The v4 frame: the dark top bar with the wordmark and the page tabs over the
// rust and mustard stripe, then the name band with the portrait at the left and
// the stamp at the right, with a stand of pines rising behind the stamp.
function LubecMasthead({ character, page, onPage, onEdit }: MastheadProps) {
  return (
    <header className="lubec-masthead">
      {/* The worn edge of the big lettering, as printed on old paper. */}
      <svg width="0" height="0" className="lubec-filters" aria-hidden="true" focusable="false">
        <filter id="lubec-rough" x="-2%" y="-10%" width="104%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves={2} seed={7} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={1.8} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="lubec-topbar">
        <div className="lubec-wordmark">Lubec 1977</div>
        <LubecPageTabs page={page} onPage={onPage} />
      </div>
      <div className="lubec-idband">
        <LubecPortrait character={character} />
        <div className="lubec-id-text">
          <h2 className="lubec-kid-name">{lubecCharacterName(character)}</h2>
          <LubecKidMeta character={character} />
          {onEdit ? (
            <button type="button" className="lubec-band-edit" aria-label="Edit name band" onClick={onEdit}>
              <Pencil size={12} aria-hidden="true" /> Edit
            </button>
          ) : null}
        </div>
        <div className="lubec-stamp" aria-hidden="true">Lubec<br />Maine<br />1977</div>
      </div>
      <img className="lubec-pines" src={lubecPines} alt="" aria-hidden="true" />
    </header>
  )
}

type SheetViewProps = {
  character: LubecCharacterRecord
  /** The viewer's edits, or null when they may only look. */
  editing: LubecSheetEditing | null
  /** Absent for a viewer who may not change the character. */
  onCountersChange: LubecCountersChange | null
  /** Absent unless the viewer may change the character's skills, which is only in creation. */
  onSkillsChange: ((skills: LubecSkills) => void) | null
  /** Changes a draft's base values, class and class choice; absent unless the viewer may type into the draft. */
  onDraftEdit?: LubecSheetEdit | null
  /** Deletes the draft; absent unless the viewer may. */
  onDelete?: (() => void) | null
}

/** One Lubec character's sheet, in the v4 frame, on its Core or Skills page. */
export function LubecSheetView({ character, editing, onCountersChange, onSkillsChange, onDraftEdit = null, onDelete = null }: SheetViewProps) {
  const [page, setPage] = useState<LubecPage>('core')
  const [bandOpen, setBandOpen] = useState(false)
  return (
    <article className="lubec-sheet" aria-label={`${lubecCharacterName(character)} character sheet`}>
      <LubecMasthead character={character} page={page} onPage={setPage} onEdit={editing ? () => setBandOpen(true) : null} />
      {editing && bandOpen ? <LubecNameBandEditor character={character} editing={editing} onDone={() => setBandOpen(false)} /> : null}
      {character.creationStatus === 'active' ? null : <LubecDraftBar character={character} onDelete={onDelete} />}
      {page === 'core' ? (
        <LubecCorePage
          sheet={character.lubec}
          onCountersChange={onCountersChange}
          onEffectsChange={editing ? (effects) => editing.update({ lubec: { ...character.lubec, effects } }) : null}
          onDraftEdit={onDraftEdit}
        />
      ) : <LubecSkillsPage sheet={character.lubec} onChange={onSkillsChange} />}
    </article>
  )
}
