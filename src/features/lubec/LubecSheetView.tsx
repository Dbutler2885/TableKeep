import { Pencil } from 'lucide-react'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { lubecClass } from '../ruleSets/lubec/classes'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import type { LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import type { LubecSkills } from '../ruleSets/lubec/skillPicks'
import { LubecCorePage, type LubecGuided } from './LubecCorePage'
import { LubecCorrectSwitch } from './LubecCorrectSwitch'
import type { LubecCountersChange } from './LubecCountersPanel'
import { LubecDraftBar } from './LubecDraftBar'
import { LubecMissing } from './LubecMissing'
import { LubecNameBandEditor, type LubecSheetEditing } from './LubecNameBandEditor'
import { LubecSkillsPage } from './LubecSkillsPage'
import { lubecCharacterName } from './lubecNames'
import { lubecMotionAllowed } from './useLubecCircles'
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

/** The edits the GM's Correct switch unlocks on a finalized character. */
export type LubecCorrections = { onDraftEdit: LubecSheetEdit; onSkillsChange: (skills: LubecSkills) => void }

type StageBarProps = {
  character: LubecCharacterRecord
  correcting: boolean
  onCorrecting: ((on: boolean) => void) | null
  onDelete: (() => void) | null
  onFinalize: (() => void) | null
}

// A draft shows its creation bar; a finalized character shows the GM the Correct switch.
function LubecStageBar({ character, correcting, onCorrecting, onDelete, onFinalize }: StageBarProps) {
  if (character.creationStatus !== 'active') return <LubecDraftBar character={character} onDelete={onDelete} onFinalize={onFinalize} />
  return onCorrecting ? <LubecCorrectSwitch on={correcting} onChange={onCorrecting} /> : null
}

type SheetViewProps = {
  character: LubecCharacterRecord
  /** The viewer's edits, or null when they may only look. */
  editing: LubecSheetEditing | null
  /** Null for a viewer who may not change the character. */
  onCountersChange: LubecCountersChange | null
  /** Null unless the viewer may change the character's skills, which is only in creation. */
  onSkillsChange: ((skills: LubecSkills) => void) | null
  /** Changes a draft's base values, class and class choice; null unless the viewer may type into the draft. */
  onDraftEdit: LubecSheetEdit | null
  /** Deletes the draft; null unless the viewer may. */
  onDelete: (() => void) | null
  /** Puts the draft in use; null unless the viewer may. */
  onFinalize: (() => void) | null
  /** Saves a guided draft's dice and Swap at once; null unless the viewer may roll them. */
  onRollUp: LubecSheetEdit | null
  /** What the Correct switch unlocks; null unless the viewer is the GM on a finalized character. */
  corrections: LubecCorrections | null
}

type LockedEdits = Pick<SheetViewProps, 'onDraftEdit' | 'onSkillsChange'>

// While the GM's Correct switch is on, the locked values take the GM's corrections.
const lockedEdits = (correcting: boolean, corrections: LubecCorrections | null, edits: LockedEdits): LockedEdits =>
  correcting && corrections ? corrections : edits

type SheetPageProps = LockedEdits & Pick<SheetViewProps, 'character' | 'editing' | 'onCountersChange' | 'onRollUp'> & {
  page: LubecPage
  onShowTree: () => void
  onHideTree: () => void
}

// Only a guided character still in creation is rolled up; once finalized its values are like any other's.
const guidedOf = (character: LubecCharacterRecord, onRollUp: LubecSheetEdit | null): LubecGuided | null =>
  (character.lubec.door === 'guided' && character.creationStatus !== 'active' ? { onRollUp } : null)

function LubecSheetPage({ page, onShowTree, onHideTree, character, editing, onCountersChange, onDraftEdit, onSkillsChange, onRollUp }: SheetPageProps) {
  if (page === 'skills') return <LubecSkillsPage sheet={character.lubec} onChange={onSkillsChange} onHideTree={onHideTree} />
  return (
    <LubecCorePage
      sheet={character.lubec}
      onCountersChange={onCountersChange}
      onEffectsChange={editing ? (effects) => editing.update({ lubec: { ...character.lubec, effects } }) : null}
      onDraftEdit={onDraftEdit}
      onRolled={editing ? (lubec) => editing.update({ lubec }) : null}
      guided={guidedOf(character, onRollUp)}
      onShowTree={onShowTree}
    />
  )
}

// "Show skill tree" opens the Skills page and brings it into view, as the prototype scrolls to its tree.
function showLubecTree(sheet: HTMLElement | null, onPage: (page: LubecPage) => void) {
  flushSync(() => onPage('skills'))
  sheet?.querySelector('.lubec-page')?.scrollIntoView({ behavior: lubecMotionAllowed() ? 'smooth' : 'auto', block: 'start' })
}

// "Hide skill tree" goes back to the Core page and brings its skill strip into view, as the prototype does.
function hideLubecTree(sheet: HTMLElement | null, onPage: (page: LubecPage) => void) {
  flushSync(() => onPage('core'))
  sheet?.querySelector('[aria-labelledby="lubec-skill-strip-title"]')?.scrollIntoView({ behavior: lubecMotionAllowed() ? 'smooth' : 'auto', block: 'center' })
}

/** One Lubec character's sheet, in the v4 frame, on its Core or Skills page. */
export function LubecSheetView({ character, editing, onCountersChange, onDelete, onFinalize, onRollUp, corrections, ...edits }: SheetViewProps) {
  const [page, setPage] = useState<LubecPage>('core')
  const [bandOpen, setBandOpen] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const sheetRef = useRef<HTMLElement>(null)
  return (
    <article ref={sheetRef} className="lubec-sheet" aria-label={`${lubecCharacterName(character)} character sheet`}>
      <LubecMasthead character={character} page={page} onPage={setPage} onEdit={editing ? () => setBandOpen(true) : null} />
      {editing && bandOpen ? <LubecNameBandEditor character={character} editing={editing} onDone={() => setBandOpen(false)} /> : null}
      <LubecStageBar
        character={character}
        correcting={correcting}
        onCorrecting={corrections ? setCorrecting : null}
        onDelete={onDelete}
        onFinalize={onFinalize}
      />
      <LubecSheetPage
        page={page}
        onShowTree={() => showLubecTree(sheetRef.current, setPage)}
        onHideTree={() => hideLubecTree(sheetRef.current, setPage)}
        character={character}
        editing={editing}
        onCountersChange={onCountersChange}
        onRollUp={onRollUp}
        {...lockedEdits(correcting, corrections, edits)}
      />
    </article>
  )
}
