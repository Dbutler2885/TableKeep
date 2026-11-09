import { useState, type ReactNode } from 'react'
import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import { lubecEffectiveHandle } from '../../../ruleSets/lubec/derivations'
import type { LubecHands } from '../../../ruleSets/lubec/gear/held'
import { LubecFightWindowContent } from '../../fight/LubecFightWindowContent'
import { lubecCombatantFace, lubecCombatantKey, lubecCombatantRecord, type LubecCombatant } from '../../fight/lubecFightRequest'
import { clampHandle } from '../engine/attackMath'
import { combatOpponents } from '../engine/attackParty'
import { combatInputModifiers } from '../engine/inputModifiers'
import type { CombatAttack, Combatant, CombatState } from '../engine/types'
import { AttackBar, AttackScale, SegmentRoll } from './AttackBar'
import type { AttackCommands, DeclarePick } from './attackCommands'
import { attackSum, initialDraft, labelPlace, segmentMiddle, withDefense, withWeapon, type AttackDraft } from './attackDraft'
import { attackWindowModel, type AttackReading, type AttackWindowModel } from './attackWindowModel'
import { AttackDefenseLine, DefenseLineSelect } from './AttackWindowParts'
import { combatFightCombatant, type CombatRosterRecords } from './combatFightCombatants'
import { CombatStepper, CombatWindow } from './CombatParts'
import { CombatRefusal } from './CombatParts'
import { useCombatRun, type CombatRun } from './useCombatRun'
import { aimedText, attackBadge, declaredAt } from './declarationsModel'

type WindowProps = {
  state: CombatState
  fightId: string
  declarer: Combatant
  roster: CombatRosterRecords
  commands: AttackCommands
  gm: boolean
  onInventory: (hands: LubecHands) => void
}

type BodyProps = WindowProps & { fighter: LubecCombatant; sheet: LubecCharacterSheet }

/** Declare has no attack yet: the window reads its numbers from the sheet in hand, as the engine will at Declare. */
const draftAttack = (declarer: Combatant): CombatAttack => ({ id: 'declare', grantId: null, attackerKey: declarer.key, step: 'aim', detached: [], closed: false })

/** Who has declared at, or against, this declarer: they can answer with Full Defense. */
function AimedNotice({ state, declarer }: { state: CombatState; declarer: Combatant }) {
  const aimed = state.combatants.filter((entry) => entry.declaration && !entry.declaration.ran && declaredAt(entry.declaration, [declarer.key]))
  if (!aimed.length) return null
  return (
    <div className="notice hot">
      <span>{aimed.map((entry) => <span key={entry.key}><b>{entry.name}</b> {aimedText(state, entry.declaration!, declarer.key)} </span>)}You can answer with Full Defense below, or attack and defend with what is left.</span>
    </div>
  )
}

const targetNote = (state: CombatState) => (target: LubecCombatant): string => {
  const combatant = state.combatants.find((entry) => entry.key === lubecCombatantKey(target))!
  return `${combatant.kind === 'npc' ? 'NPC' : 'Player'} · Speed ${combatant.speed}`
}

type ChoicesProps = { body: BodyProps; draft: AttackDraft; setDraft: (draft: AttackDraft) => void; model: AttackWindowModel; full: boolean }

function DeclareChoices({ body, draft, setDraft, model, full }: ChoicesProps) {
  return (
    <div className={full ? 'dim' : ''}>
      <LubecFightWindowContent
        request={{ attacker: body.fighter, target: model.target, weaponItemId: draft.weaponItemId ?? undefined, attackId: draft.attackId ?? undefined }}
        targets={model.targets} targetNote={targetNote(body.state)} targetBadge={(target) => attackBadge(body.state, lubecCombatantKey(target), body.declarer.key)} onInventory={body.onInventory} readOnly={full}
        onTarget={(key) => setDraft({ ...draft, targetKey: key })}
        onWeapon={(id) => setDraft(withWeapon(draft, body.sheet, id))}
        onAttack={(id) => setDraft({ ...draft, attackId: id })}
      />
    </div>
  )
}

/** Full Defense's pool: the chosen weapon's attack Handle, as the window sums it, otherwise Handle itself. */
function fullPool(body: BodyProps, reading: AttackReading | null): AttackReading {
  if (reading) return reading
  const handle = clampHandle(lubecEffectiveHandle(body.sheet, combatInputModifiers(body.sheet, { fightId: body.fightId, round: body.state.round }))!)
  return { handle, skill: null, total: handle, ranged: false }
}

function DeclareAsk({ words, reading }: { words: string; reading: AttackReading }) {
  return (
    <div className="ask-row">
      <p className="ask">{words}</p>
      <span className="effective"><span className="sum">{attackSum(reading, null)} <b>{reading.total}</b></span></span>
    </div>
  )
}

const FullCheck = ({ full, onFull }: { full: boolean; onFull: (full: boolean) => void }) =>
  <label className="fdcheck"><input type="checkbox" checked={full} onChange={(event) => onFull(event.target.checked)} /> Full Defense</label>

/** Full Defense on the bar: the whole pool as one hatched Defense line, its +10 shown only here. */
function FullDefenseBar({ total, controls }: { total: number; controls: ReactNode }) {
  const place = labelPlace(0, total)
  return (
    <>
      <div className="roll-controls">{controls}</div>
      <AttackScale />
      <div className="allocation-bar">
        <span className="segment defense full" style={{ left: 0, width: `${total}%` }} />
        <span className="segment unused" style={{ left: `${total}%`, width: `${100 - total}%` }} />
        <div className="effective-edge" style={{ left: `${total}%` }} />
      </div>
      <div className="allocation-labels">
        <span className={`allocation-label defense ${place.edge}`} style={{ left: `${place.left}%` }}><small>DEF 1</small><strong>{total}</strong><b className="fd10">+10</b></span>
      </div>
    </>
  )
}

type PartProps = { body: BodyProps; draft: AttackDraft; setDraft: (draft: AttackDraft) => void; model: AttackWindowModel; run: CombatRun; onFull: (full: boolean) => void }
type FullProps = PartProps & { against: string; onAgainst: (key: string) => void }

function FullDefense({ body, model, run, onFull, against, onAgainst }: FullProps) {
  const reading = fullPool(body, model.reading)
  const pick: DeclarePick = { full: true, against, aim: model.aim ? { weaponItemId: model.aim.weaponItemId, attackId: model.aim.attackId } : null }
  const declare = <SegmentRoll at={Math.max(8, Math.min(92, reading.total / 2))} label="Declare Full Defense" disabled={run.busy} onRoll={() => run.run(() => body.commands.declare(body.declarer.key, pick))} />
  return (
    <>
      <DeclareAsk words="Full Defense: put all of your Handle on Defense." reading={reading} />
      <FullCheck full onFull={onFull} />
      <FullDefenseBar total={reading.total} controls={declare} />
      <DefenseLineSelect against={against} opponents={model.opponents} onAgainst={onAgainst} />
    </>
  )
}

/** The split: Declare sits over the attack where Roll will, and the one Defense line moves in tens. */
function Split({ body, draft, setDraft, model, run, onFull }: PartProps) {
  if (!model.split) return <FullCheck full={false} onFull={onFull} />
  const { segments, reading, target } = model.split
  const declare = <SegmentRoll at={segmentMiddle(segments.attackFrom, segments.attackWidth)} label="Declare" disabled={run.busy} onRoll={() => run.run(() => body.commands.declare(body.declarer.key, { full: false, aim: model.aim! }))} />
  return (
    <>
      <DeclareAsk words={`Split your Handle against ${lubecCombatantFace(target).name}.`} reading={reading} />
      <FullCheck full={false} onFull={onFull} />
      <AttackBar segments={segments} onDefense={(amount) => setDraft(withDefense(draft, amount, reading.total, draft.targetKey!))} controls={declare} />
      <AttackDefenseLine draft={draft} segments={segments} opponents={model.opponents} total={reading.total} onDraft={setDraft} />
    </>
  )
}

/** The person a draft already names: its Defense line's, else its target. The window always starts with a target. */
const draftNames = (draft: AttackDraft): string => draft.defense?.against ?? draft.targetKey!

/** Full Defense names one person: the one picked for it, else whoever the draft names. */
const guardedKey = (picked: string | null, draft: AttackDraft): string => picked ?? draftNames(draft)

function DeclareBody(body: BodyProps) {
  const { state, declarer, sheet } = body
  const [draft, setDraft] = useState<AttackDraft>(() => initialDraft(draftAttack(declarer), sheet, combatOpponents(state, declarer).map((entry) => entry.key)))
  const [full, setFull] = useState(false)
  const [against, setAgainst] = useState<string | null>(null)
  const run = useCombatRun()
  const model = attackWindowModel({ state, attack: draftAttack(declarer), attacker: declarer, sheet, draft, fightId: body.fightId, roster: body.roster })
  const parts = { body, draft, setDraft, model, run, onFull: setFull }
  const guarded = guardedKey(against, draft)
  return (
    <>
      <AimedNotice state={state} declarer={declarer} />
      {declarer.declarationRejected ? <div className="notice hot" role="status"><span>The GM rejected your declaration. Choose again; it is still your turn to declare.</span></div> : null}
      <CombatRefusal refusal={run.refusal} />
      <div className="trail"><span className="who"><small>Attacker</small>{declarer.name}</span><span className="who"><small>Round {state.round}</small>Stage 2, Declare</span></div>
      <DeclareChoices body={body} draft={draft} setDraft={setDraft} model={model} full={full} />
      {full ? <FullDefense {...parts} against={guarded} onAgainst={setAgainst} /> : <Split {...parts} />}
    </>
  )
}

/** Moment 5: the attack window with Declare where Roll sits, for whoever declares now. */
export function DeclareWindow(props: WindowProps) {
  const fighter = combatFightCombatant(props.declarer, props.roster)
  const sheet = fighter ? lubecCombatantRecord(fighter)?.lubec : undefined
  return (
    <CombatWindow title="Declare" stepper={<CombatStepper steps={['Target', 'Weapon', 'Attack', 'Declare']} now={3} />} foot={<span className="note">Submit your choice for GM approval. The next person waits until it is approved.</span>}>
      {sheet ? <DeclareBody key={props.state.stageInstanceId} {...props} fighter={fighter!} sheet={sheet} /> : <p className="note">Reading {props.declarer.name}&apos;s sheet...</p>}
    </CombatWindow>
  )
}
