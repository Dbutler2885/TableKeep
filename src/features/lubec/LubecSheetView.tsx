import { useState } from 'react'
import { lubecClass } from '../ruleSets/lubec/classes'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import { LubecCorePage } from './LubecCorePage'
import type { LubecCountersChange } from './LubecCountersPanel'
import { LubecMissing } from './LubecMissing'
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

// The v4 frame: the dark top bar with the wordmark and the page tabs over the
// rust and mustard stripe, then the name band with the portrait at the left and
// the stamp at the right, with a stand of pines rising behind the stamp.
function LubecMasthead({ character, page, onPage }: { character: LubecCharacterRecord; page: LubecPage; onPage: (page: LubecPage) => void }) {
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
          <div className="lubec-kid-meta">{lubecClass(character.lubec.class.key)?.name ?? <LubecMissing />}</div>
        </div>
        <div className="lubec-stamp" aria-hidden="true">Lubec<br />Maine<br />1977</div>
      </div>
      <img className="lubec-pines" src={lubecPines} alt="" aria-hidden="true" />
    </header>
  )
}

// The Skills page is an empty panel until the skill tree is built.
function LubecSkillsPage() {
  return (
    <div className="lubec-page lubec-skills">
      <section className="lubec-panel pine" aria-labelledby="lubec-panel-skills">
        <div className="lubec-section-head"><h3 id="lubec-panel-skills">Skills</h3></div>
      </section>
    </div>
  )
}

type SheetViewProps = {
  character: LubecCharacterRecord
  /** Absent for a viewer who may not change the character. */
  onCountersChange: LubecCountersChange | null
}

/** One Lubec character's sheet, in the v4 frame, on its Core or Skills page. */
export function LubecSheetView({ character, onCountersChange }: SheetViewProps) {
  const [page, setPage] = useState<LubecPage>('core')
  return (
    <article className="lubec-sheet" aria-label={`${lubecCharacterName(character)} character sheet`}>
      <LubecMasthead character={character} page={page} onPage={setPage} />
      {page === 'core' ? <LubecCorePage sheet={character.lubec} onCountersChange={onCountersChange} /> : <LubecSkillsPage />}
    </article>
  )
}
