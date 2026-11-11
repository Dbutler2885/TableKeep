import type { ReactNode } from 'react'
import type { Combatant, CombatDeclaration, CombatState } from '../engine/types'
import { combatantName, type CombatViewer } from './attackWords'
import { declaredAt, miniParts, slowestFirst, declaredUse, viewerKeys } from './declarationsModel'
import { CombatPanel } from './CombatParts'

/** A runner has no split to show. */
export function DeclarationMini({ declaration }: { declaration: CombatDeclaration }) {
  if (declaration.ran) return null
  return <div className="mini">{miniParts(declaration).map((part, index) => <i key={index} className={part.kind} style={{ width: `${part.width}%` }} />)}</div>
}

const Name = ({ state, keyOf }: { state: CombatState; keyOf: string }) => <b>{combatantName(state, keyOf)}</b>

function lineWords(state: CombatState, declaration: CombatDeclaration): ReactNode {
  return declaration.lines.map((line) => (
    <span key={line.against}>Defense {line.amount}{declaration.full ? <> <b>Full</b></> : null} against {combatantName(state, line.against)}</span>
  ))
}

/** "Throw with the Dodgeball at Roy Carver. ATK 36; Defense 20 against Roy Carver." as every screen shows a declaration. */
export function DeclarationWords({ state, declaration }: { state: CombatState; declaration: CombatDeclaration }) {
  if (declaration.ran) return <><b>Ran</b>: no attack and no Defense this round.</>
  if (declaration.full) return <><b>Full Defense</b>: no attack. {lineWords(state, declaration)}.</>
  const { frozen, aim } = declaration
  const lines = declaration.lines.length ? <>; {lineWords(state, declaration)}</> : null
  return <>{declaredUse(frozen!)} at <Name state={state} keyOf={aim!.targetKey} />. ATK {frozen!.attack}{lines}.</>
}

function PendingRow({ place, combatant, mine, now }: { place: number; combatant: Combatant; mine: boolean; now: boolean }) {
  return (
    <li className={`pend ${mine ? 'you' : ''}`}>
      <div className="dn"><span>{place} {combatant.name}</span><span className="k">{mine ? 'YOU' : ''}</span></div>
      {now ? 'Declaring now...' : 'Has not declared yet'}
    </li>
  )
}

const rowTag = (mine: boolean, atYou: boolean): string => (mine ? 'YOU' : atYou ? 'AT YOU' : '')

/** A declaration that will not run: its maker went Out, or came back after Declare. */
const Stopped = ({ combatant }: { combatant: Combatant }) => <> <span className="badge rust">{combatant.outReason === null ? 'Stopped' : 'Stopped: Out'}</span></>

/** A declaration that will not run any more is struck through. */
const struck = (combatant: Combatant, declaration: CombatDeclaration): boolean => combatant.outReason !== null || declaration.stopped === true

type RowProps = { state: CombatState; place: number; combatant: Combatant; declaration: CombatDeclaration; mine: readonly string[] }

function DeclaredRow({ state, place, combatant, declaration, mine }: RowProps) {
  const own = mine.includes(combatant.key)
  const atYou = !own && declaredAt(declaration, mine)
  const out = struck(combatant, declaration)
  // DeclarationRow supplies the proposal only when there is no approved declaration.
  const pending = !combatant.declaration
  return (
    <li className={`${own ? 'you' : ''} ${atYou ? 'atyou' : ''}`}>
      <div className="dn"><span>{place} {combatant.name}</span><span className="k">{rowTag(own, atYou)}</span></div>
      {pending ? <span className="badge must">Awaiting GM approval</span> : null}
      <DeclarationMini declaration={declaration} />
      <div className={`txt ${out ? 'stopped' : ''}`}><DeclarationWords state={state} declaration={declaration} />{out ? <Stopped combatant={combatant} /> : null}</div>
    </li>
  )
}

type PanelProps = { state: CombatState; viewer: CombatViewer }

function DeclarationRow({ state, combatant, place, mine, now }: Omit<RowProps, 'declaration'> & { now: string | undefined }) {
  const declaration = combatant.declaration ?? combatant.proposedDeclaration
  return declaration
    ? <DeclaredRow state={state} place={place} combatant={combatant} declaration={declaration} mine={mine} />
    : <PendingRow place={place} combatant={combatant} mine={mine.includes(combatant.key)} now={combatant.key === now} />
}

function DeclarationRows({ state, viewer }: PanelProps) {
  const mine = viewerKeys(state, viewer)
  const now = state.pendingActions?.find((action) => action.action === 'declare')?.combatantKey
  return (
    <ul className="decls">
      {slowestFirst(state).map((combatant, index) => <DeclarationRow key={combatant.key} state={state} place={index + 1} combatant={combatant} mine={mine} now={now} />)}
    </ul>
  )
}

const ROUND_PHASES = ['movement', 'declare', 'attack']

/** The right rail's declarations, slowest first, from round 1's Movement on; every split is visible to everyone. */
export function DeclarationsPanel({ state, viewer }: PanelProps) {
  if (!ROUND_PHASES.includes(state.phase)) return null
  const declaring = state.phase !== 'movement'
  return (
    <CombatPanel title="Declarations" sub="slowest first">
      {declaring ? null : <div className="pb"><p className="note">Nobody has declared. Slowest declares first; everyone sees every split.</p></div>}
      {declaring ? <DeclarationRows state={state} viewer={viewer} /> : <ul className="decls" />}
    </CombatPanel>
  )
}
