import { Pencil, Trash2, UserPlus } from 'lucide-react'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { lubecClass } from '../ruleSets/lubec/classes'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import { withLubecClass, type LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import type { LubecSkills } from '../ruleSets/lubec/skillPicks'
import { LubecCorePage, type LubecGuided } from './LubecCorePage'
import { LubecCorrectSwitch } from './LubecCorrectSwitch'
import type { LubecCountersChange } from './LubecCountersPanel'
import { LubecDraftBar } from './LubecDraftBar'
import type { LubecGearDrop } from './gear/lubecGearDrop'
import { LubecGearPage, type LubecGearChange } from './gear/LubecGearPage'
import { LubecMissing } from './LubecMissing'
import { LubecNameBandEditor, type LubecSheetEditing } from './LubecNameBandEditor'
import { LubecSkillsPage } from './LubecSkillsPage'
import { LubecToken } from './LubecToken'
import { lubecCharacterName } from './lubecNames'
import { lubecMotionAllowed } from './useLubecCircles'
import lubecPines from './lubecPines.svg'

type LubecPage = 'core' | 'skills' | 'gear'

type LubecPages = readonly (readonly [LubecPage, string])[]

const LUBEC_PAGES: LubecPages = [['core', 'Core sheet'], ['skills', 'Skills'], ['gear', 'Gear']]

// Every page, or every page but Gear where the sheet has no Gear page yet.
const pagesOf = (withGear: boolean | undefined): LubecPages =>
  (withGear === false ? LUBEC_PAGES.filter(([id]) => id !== 'gear') : LUBEC_PAGES)

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

function LubecPageTabs({ pages, page, onPage }: { pages: LubecPages; page: LubecPage; onPage: (page: LubecPage) => void }) {
  return (
    <nav className="lubec-page-tabs" aria-label="Character sheet pages">
      {pages.map(([id, label]) => (
        <button key={id} type="button" aria-current={id === page ? 'page' : undefined} onClick={() => onPage(id)}>
          {label}
        </button>
      ))}
    </nav>
  )
}

type MastheadProps = {
  character: LubecCharacterRecord
  pages: LubecPages
  page: LubecPage
  onPage: (page: LubecPage) => void
  /** The viewer's edits, or null when they may only look. */
  editing: LubecSheetEditing | null
  /** Opens the name band's edits; absent for a viewer who cannot edit. */
  onEdit: (() => void) | null
  /** Asks to delete a finalized character; absent for a draft, whose stage bar has its own, or a viewer who may not. */
  onDelete: (() => void) | null
  /** Opens Give to Player, at any stage; absent unless the viewer is the GM. */
  onAssign: (() => void) | null
}

type BandActionsProps = Pick<MastheadProps, 'onEdit' | 'onDelete' | 'onAssign'>

type BandAction = {
  onClick: (() => void) | null
  label: string
  ariaLabel: string
  Icon: typeof Pencil
  className: string
}

type ShownBandAction = BandAction & { onClick: () => void }

// The name band's buttons, in the order they show.
const bandActionsOf = ({ onEdit, onDelete, onAssign }: BandActionsProps): BandAction[] => [
  { onClick: onEdit, label: 'Edit', ariaLabel: 'Edit name band', Icon: Pencil, className: 'lubec-band-edit' },
  { onClick: onAssign, label: 'Give to Player', ariaLabel: 'Give character to player', Icon: UserPlus, className: 'lubec-band-edit' },
  { onClick: onDelete, label: 'Delete', ariaLabel: 'Delete character', Icon: Trash2, className: 'lubec-band-edit lubec-band-delete' },
]

// The name band's Edit, Give to Player and Delete buttons, for those who may.
function LubecBandActions(props: BandActionsProps) {
  const actions = bandActionsOf(props).filter((action): action is ShownBandAction => action.onClick !== null)
  if (actions.length === 0) return null
  return (
    <div className="lubec-band-actions">
      {actions.map(({ onClick, label, ariaLabel, Icon, className }) => (
        <button key={label} type="button" className={className} aria-label={ariaLabel} onClick={onClick}>
          <Icon size={12} aria-hidden="true" /> {label}
        </button>
      ))}
    </div>
  )
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
// rust and mustard stripe, then the name band with the portrait and the token
// at the left and the stamp at the right, with a stand of pines rising behind
// the stamp.
function LubecMasthead({ character, pages, page, onPage, editing, ...actions }: MastheadProps) {
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
        <LubecPageTabs pages={pages} page={page} onPage={onPage} />
      </div>
      <div className="lubec-idband">
        <div className="lubec-id-art">
          <LubecPortrait character={character} />
          <LubecToken character={character} editing={editing} />
        </div>
        <div className="lubec-id-text">
          <h2 className="lubec-kid-name">{lubecCharacterName(character)}</h2>
          <LubecKidMeta character={character} />
          <LubecBandActions {...actions} />
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

// A finalized character's Delete is on the name band, as it has no stage bar for its owner; a draft's is on its stage bar.
const bandDeleteOf = (character: LubecCharacterRecord, onDelete: (() => void) | null) =>
  (character.creationStatus === 'active' ? onDelete : null)

// A draft shows its creation bar; a finalized character shows the GM the Correct switch.
function LubecStageBar({ character, correcting, onCorrecting, onDelete, onFinalize }: StageBarProps) {
  if (character.creationStatus !== 'active') return <LubecDraftBar character={character} onDelete={onDelete} onFinalize={onFinalize} />
  return onCorrecting ? <LubecCorrectSwitch on={correcting} onChange={onCorrecting} /> : null
}

export type LubecSheetViewProps = {
  character: LubecCharacterRecord
  /** The viewer's edits, or null when they may only look. */
  editing: LubecSheetEditing | null
  /** False where the name, portrait and token are edited elsewhere: the band has no Edit and the token is only a picture. */
  identityEditable?: boolean
  /** False where the sheet has no Gear page yet, as on an NPC's sheet; offered unless said otherwise. */
  withGear?: boolean
  /** Null for a viewer who may not change the character. */
  onCountersChange: LubecCountersChange | null
  /** Null unless the viewer may change the character's skills, which is only in creation. */
  onSkillsChange: ((skills: LubecSkills) => void) | null
  /** Changes a draft's base values, class and class choice; null unless the viewer may type into the draft. */
  onDraftEdit: LubecSheetEdit | null
  /** Asks to delete the character, at any stage; null unless the viewer may. */
  onDelete: (() => void) | null
  /** Opens Give to Player, at any stage; null unless the viewer is the GM. */
  onAssign: (() => void) | null
  /** Puts the draft in use; null unless the viewer may. */
  onFinalize: (() => void) | null
  /** Saves a guided draft's dice and Swap at once; null unless the viewer may roll them. */
  onRollUp: LubecSheetEdit | null
  /** What the Correct switch unlocks; null unless the viewer is the GM on a finalized character. */
  corrections: LubecCorrections | null
  /** Saves the character's gear, at any stage; null unless the viewer may change the character. */
  onGearChange: LubecGearChange
  /** Drops a thing to the GM's Items tab; null unless the viewer may change the character. */
  onGearDrop: LubecGearDrop
}

type LockedEdits = Pick<LubecSheetViewProps, 'onDraftEdit' | 'onSkillsChange'>

// While the GM's Correct switch is on, the locked values take the GM's corrections.
const lockedEdits = (correcting: boolean, corrections: LubecCorrections | null, edits: LockedEdits): LockedEdits =>
  correcting && corrections ? corrections : edits

type SheetPageProps = LockedEdits & Pick<LubecSheetViewProps, 'character' | 'editing' | 'onCountersChange' | 'onRollUp' | 'onGearChange' | 'onGearDrop'> & {
  page: LubecPage
  onHideTree: () => void
  /** Brings the Core page's class cards into view once the class is cleared. */
  onShowClass: () => void
}

// Only a guided character still in creation is rolled up; once finalized its values are like any other's.
const guidedOf = (character: LubecCharacterRecord, onRollUp: LubecSheetEdit | null): LubecGuided | null =>
  (character.lubec.door === 'guided' && character.creationStatus !== 'active' ? { onRollUp } : null)

// The prototype's Change class: the class and the skills chosen for it are cleared, and the class cards come back.
function changeClassOf(sheet: LubecCharacterRecord['lubec'], onDraftEdit: LubecSheetEdit | null, onShowClass: () => void) {
  if (!onDraftEdit) return null
  return () => {
    onDraftEdit({ ...withLubecClass(sheet, null), skills: { free: null, picked: [] } })
    onShowClass()
  }
}

function LubecSheetPage({ page, onHideTree, onShowClass, character, editing, onCountersChange, onDraftEdit, onSkillsChange, onRollUp, onGearChange, onGearDrop }: SheetPageProps) {
  if (page === 'gear') return <LubecGearPage gear={character.lubec.gear} onGearChange={onGearChange} onDrop={onGearDrop} />
  if (page === 'skills') {
    const onChangeClass = changeClassOf(character.lubec, onDraftEdit, onShowClass)
    return <LubecSkillsPage sheet={character.lubec} onChange={onSkillsChange} onHideTree={onHideTree} onChangeClass={onChangeClass} />
  }
  return (
    <LubecCorePage
      sheet={character.lubec}
      onCountersChange={onCountersChange}
      onEffectsChange={editing ? (effects) => editing.update({ lubec: { ...character.lubec, effects } }) : null}
      onDraftEdit={onDraftEdit}
      onRolled={editing ? (lubec) => editing.update({ lubec }) : null}
      guided={guidedOf(character, onRollUp)}
      inPlay={character.creationStatus === 'active'}
    />
  )
}

// "Hide skill tree" goes back to the Core page and brings its skill strip into view, as the prototype does.
function hideLubecTree(sheet: HTMLElement | null, onPage: (page: LubecPage) => void) {
  flushSync(() => onPage('core'))
  sheet?.querySelector('[aria-labelledby="lubec-skill-strip-title"]')?.scrollIntoView({ behavior: lubecMotionAllowed() ? 'smooth' : 'auto', block: 'center' })
}

// Change class goes back to the Core page and brings its class cards into view, as the prototype scrolls to them.
function showLubecClass(sheet: HTMLElement | null, onPage: (page: LubecPage) => void) {
  flushSync(() => onPage('core'))
  sheet?.querySelector('#lubec-class-title')?.scrollIntoView({ behavior: lubecMotionAllowed() ? 'smooth' : 'auto', block: 'start' })
}

// The name band's edits, unless the name, portrait and token are edited elsewhere; editable unless said otherwise.
const identityEditingOf = (editing: LubecSheetEditing | null, identityEditable: boolean | undefined) =>
  (identityEditable === false ? null : editing)

/** One Lubec character's sheet, in the v4 frame, on its Core, Skills or Gear page. */
export function LubecSheetView({
  character, editing, identityEditable, withGear, onCountersChange, onDelete, onAssign, onFinalize, onRollUp, corrections, onGearChange, onGearDrop, ...edits
}: LubecSheetViewProps) {
  const [page, setPage] = useState<LubecPage>('core')
  const [bandOpen, setBandOpen] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const sheetRef = useRef<HTMLElement>(null)
  const identityEditing = identityEditingOf(editing, identityEditable)
  return (
    <article ref={sheetRef} className="lubec-sheet" aria-label={`${lubecCharacterName(character)} character sheet`}>
      <LubecMasthead
        character={character}
        pages={pagesOf(withGear)}
        page={page}
        onPage={setPage}
        editing={identityEditing}
        onEdit={identityEditing ? () => setBandOpen(true) : null}
        onDelete={bandDeleteOf(character, onDelete)}
        onAssign={onAssign}
      />
      {identityEditing && bandOpen ? <LubecNameBandEditor character={character} editing={identityEditing} onDone={() => setBandOpen(false)} /> : null}
      <LubecStageBar
        character={character}
        correcting={correcting}
        onCorrecting={corrections ? setCorrecting : null}
        onDelete={onDelete}
        onFinalize={onFinalize}
      />
      <LubecSheetPage
        page={page}
        onHideTree={() => hideLubecTree(sheetRef.current, setPage)}
        onShowClass={() => showLubecClass(sheetRef.current, setPage)}
        character={character}
        editing={editing}
        onCountersChange={onCountersChange}
        onRollUp={onRollUp}
        onGearChange={onGearChange}
        onGearDrop={onGearDrop}
        {...lockedEdits(correcting, corrections, edits)}
      />
    </article>
  )
}
