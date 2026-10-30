import type { LubecAttackHandle } from '../../ruleSets/lubec/gear/handPenalty'
import { LubecPicture } from '../gear/LubecGearArt'
import { LubecHandleTerms } from '../LubecInHand'
import { LUBEC_FISTICUFFS_ID, lubecCombatantGear, lubecCombatantWielder, type LubecCombatant } from './lubecFightRequest'
import { lubecFightCells, lubecFightFists, type LubecFightCell } from './lubecFightWeapons'

// B's glyphs for a free hand and for Fisticuffs.
const WEAPON_GLYPH = 'M5 19L18 6l1.5-1.5M8 13l3 3M4 20l3-3'
const FIST_GLYPH = 'M7 11V7.5a1.5 1.5 0 0 1 3 0V10M10 9.5V6.5a1.5 1.5 0 0 1 3 0V10M13 9.5V7a1.5 1.5 0 0 1 3 0v3.5M16 10V9a1.5 1.5 0 0 1 3 0v4.5c0 3.6-2.6 6.5-6.2 6.5h-1.1c-2.2 0-4-1-5.2-2.8L5 15.2a1.6 1.6 0 0 1 2.3-2.1L9 14.5'

function Glyph({ d }: { d: string }) {
  return (
    <span className="pic glyph">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
    </span>
  )
}

type Choosing = {
  chosen: string | null
  onChoose: (weaponId: string) => void
  /** Drops a held thing; null for a viewer who may not. */
  drop: ((itemId: string) => void) | null
  busy: boolean
}

function CardWords({ name, line, attack }: { name: string; line: string; attack: LubecAttackHandle | null }) {
  return (
    <span>
      <span className="name">{name}</span>
      <small>{line}</small>
      {attack ? <LubecHandleTerms attack={attack} /> : null}
    </span>
  )
}

function HeldCard({ cell, chosen, onChoose, drop, busy }: Choosing & { cell: Extract<LubecFightCell, { kind: 'held' }> }) {
  const { held, item } = cell
  return (
    <div className={`pick-cell${held.hands === 'both' ? ' both' : ''}`}>
      <button type="button" className="pick" disabled={!held.weapon} aria-pressed={chosen === held.itemId} onClick={() => onChoose(held.itemId)}>
        <span className="where">{cell.where}</span>
        <LubecPicture item={item} frame="pic" />
        <CardWords name={held.name} line={cell.line} attack={cell.attack} />
      </button>
      {cell.droppable && drop ? (
        <button type="button" className="btn line small drop" disabled={busy} aria-label={`Drop ${held.name}, free`} onClick={() => drop(held.itemId)}>Drop it, free</button>
      ) : null}
    </div>
  )
}

function FreeHand({ where }: { where: string }) {
  return (
    <div className="pick-cell">
      <div className="pick empty"><span className="where">{where}</span><Glyph d={WEAPON_GLYPH} /><span><span className="name">Free</span></span></div>
    </div>
  )
}

function FistsCard({ attacker, chosen, onChoose }: Pick<Choosing, 'chosen' | 'onChoose'> & { attacker: LubecCombatant }) {
  const fists = lubecFightFists(lubecCombatantGear(attacker), lubecCombatantWielder(attacker))
  return (
    <div className="pick-cell">
      <button type="button" className="pick" disabled={!fists.offered} aria-pressed={chosen === LUBEC_FISTICUFFS_ID} onClick={() => onChoose(LUBEC_FISTICUFFS_ID)}>
        <span className="where">Fists and feet</span>
        <Glyph d={FIST_GLYPH} />
        <CardWords name="Fisticuffs" line={fists.offered ? 'Punch or kick' : 'Hands full: drop something first'} attack={fists.offered ? fists.attack : null} />
      </button>
    </div>
  )
}

type WeaponStepProps = Choosing & { attacker: LubecCombatant; said: string }

/** The Weapon step (B's renderStep0): each hand, then Fisticuffs, read from Gear. */
export function LubecFightWeaponStep({ attacker, said, ...choosing }: WeaponStepProps) {
  const cells = lubecFightCells(lubecCombatantGear(attacker), lubecCombatantWielder(attacker))
  return (
    <>
      <p className="ask">What are you attacking with?</p>
      <div className="picks">
        {cells.map((cell) => (cell.kind === 'held' ? <HeldCard key={cell.where} cell={cell} {...choosing} /> : <FreeHand key={cell.where} where={cell.where} />))}
        <FistsCard attacker={attacker} chosen={choosing.chosen} onChoose={choosing.onChoose} />
      </div>
      {said ? <p className="note ground" role="status">{said}</p> : null}
    </>
  )
}
