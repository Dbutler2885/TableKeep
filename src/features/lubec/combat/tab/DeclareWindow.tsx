import { useState, type ReactNode } from 'react'
import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import { lubecEffectiveHandle } from '../../../ruleSets/lubec/derivations'
import type { LubecHands } from '../../../ruleSets/lubec/gear/held'
import { LubecFightWindowContent } from '../../fight/LubecFightWindowContent'
import { lubecCombatantFace, lubecCombatantKey, lubecCombatantRecord, type LubecCombatant } from '../../fight/lubecFightRequest'
import { clampHandle } from '../engine/attackMath'
import { combatOpponents } from '../engine/attackParty'
import { combatPosture } from '../engine/posture'
import { combatInputModifiers } from '../engine/inputModifiers'
import type { CombatAttack, Combatant, CombatState } from '../engine/types'
import { AttackBar, AttackScale, SegmentRoll } from './AttackBar'
import type { AttackCommands, DeclarePick } from './attackCommands'
import { attackSum, initialDraft, labelPlace, segmentMiddle, withDefense, withWeapon, type AttackDraft } from './attackDraft'
import { attackWindowModel, postureTargets, type AttackReading, type AttackWindowModel } from './attackWindowModel'
import { AttackDefenseLine, DefenseLineSelect } from './AttackWindowParts'
import { combatFightCombatant, type CombatRosterRecords } from './combatFightCombatants'
import { CombatStepper, CombatWindow, NoticeSlot, type SlotNotice } from './CombatParts'
import { useCombatRun, type CombatRun } from './useCombatRun'
import { aimedText, attackBadge, declaredAt } from './declarationsModel'
import { declaredAtAttacker, orderedOpponentKeys, orderedTargets } from './targetOrder'

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
function aimedNotice(state: CombatState, declarer: Combatant): SlotNotice | null {
  const aimed = state.combatants.filter((entry) => entry.declaration && !entry.declaration.ran && declaredAt(entry.declaration, [declarer.key]))
  if (!aimed.length) return null
  const tail = 'You can answer with Full Defense below, or attack and defend with what is left.'
  return {
    key: 'aimed', tone: 'hot',
    body: <>{aimed.map((entry) => <span key={entry.key}><b>{entry.name}</b> {aimedText(state, entry.declaration!, declarer.key)} </span>)}{tail}</>,
    words: `${aimed.map((entry) => `${entry.name} ${aimedText(state, entry.declaration!, declarer.key)}`).join(' ')} ${tail}`,
  }
}

type NoticeInputs = { state: CombatState; declarer: Combatant; refusal: string | null; evading: boolean; down: boolean; reach: string | null }

/** Everything the Declare window has to say, most pressing first, for its one notice line. */
const EVASIVE = 'No attack this round: declare Full Defense against one person.'
const GROUNDED = 'Nobody they can attack from the ground: declare Full Defense against one person.'

/** Why this declarer may only guard: they moved evasively, or failing that, they are on the ground. */
function positionNotice(declarer: Combatant, evading: boolean, down: boolean): SlotNotice | null {
  if (evading) return { key: 'evading', tone: 'cool', role: 'status', body: <><b>{declarer.name} moved evasively.</b> {EVASIVE}</>, words: `${declarer.name} moved evasively. ${EVASIVE}` }
  if (down) return { key: 'down', tone: 'cool', role: 'status', body: <><b>{declarer.name} is on the ground.</b> {GROUNDED}</>, words: `${declarer.name} is on the ground. ${GROUNDED}` }
  return null
}

const REJECTED = 'The GM rejected your declaration. Choose again.'

function declareNotices({ state, declarer, refusal, evading, down, reach }: NoticeInputs): SlotNotice[] {
  const notices: (SlotNotice | null)[] = [
    refusal ? { key: 'refusal', tone: 'hot', role: 'alert', body: refusal, words: refusal } : null,
    declarer.declarationRejected ? { key: 'rejected', tone: 'hot', role: 'status', body: REJECTED, words: REJECTED } : null,
    positionNotice(declarer, evading, down),
    aimedNotice(state, declarer),
    reach ? { key: 'reach', tone: 'cool', role: 'status', body: reach, words: reach } : null,
  ]
  return notices.filter((notice): notice is SlotNotice => notice !== null)
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
        focusTarget
        request={{ attacker: body.fighter, target: model.target, targetDown: model.targetDown, weaponItemId: draft.weaponItemId ?? undefined, attackId: draft.attackId ?? undefined }}
        targets={orderedTargets(body.state, body.declarer, model.targets, declaredAtAttacker(body.state, body.declarer))} targetNote={targetNote(body.state)} targetBadge={(target) => attackBadge(body.state, lubecCombatantKey(target), body.declarer.key)} onInventory={body.onInventory} readOnly={full}
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

/** The ask, the Full Defense switch and the pool's sum on one line, so the bar stays on the same screen as the choices. */
function DeclareAsk({ words, reading, check }: { words: string; reading: AttackReading; check: ReactNode }) {
  return (
    <div className="ask-row">
      <p className="ask">{words}</p>
      {check}
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
      <DeclareAsk words="Put all of your Handle on Defense." reading={reading} check={<FullCheck full onFull={onFull} />} />
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
      <DeclareAsk words={`Split your Handle against ${lubecCombatantFace(target).name}.`} reading={reading} check={<FullCheck full={false} onFull={onFull} />} />
      <AttackBar segments={segments} onDefense={(amount) => setDraft(withDefense(draft, amount, reading.total, draft.targetKey!))} controls={declare} />
      <AttackDefenseLine draft={draft} segments={segments} opponents={model.opponents} total={reading.total} onDraft={setDraft} />
    </>
  )
}

/** The person a draft already names: its Defense line's, else its target. The window always starts with a target. */
const draftNames = (draft: AttackDraft): string => draft.defense?.against ?? draft.targetKey!

/** Full Defense names one person: the one picked for it, else whoever the draft names. */
const guardedKey = (picked: string | null, draft: AttackDraft): string => picked ?? draftNames(draft)

/** The opponents the declarer can attack from their posture, so the window starts on one of them; else every opponent, for Full Defense. */
function attackableKeys({ state, declarer, sheet, roster }: BodyProps, context: { fightId: string; round: number }): string[] {
  const fighters = combatOpponents(state, declarer).map((entry) => combatFightCombatant(entry, roster)).filter((entry): entry is LubecCombatant => entry !== null)
  const attackable = postureTargets(state, fighters, sheet, context).map(lubecCombatantKey)
  // With nobody to attack, Full Defense still guards against someone: start on the first opponent.
  return attackable.length ? attackable : combatOpponents(state, declarer).map((entry) => entry.key)
}

function DeclareBody(body: BodyProps) {
  const { state, declarer, sheet } = body
  const context = { fightId: body.fightId, round: state.round }
  const [draft, setDraft] = useState<AttackDraft>(() => initialDraft(draftAttack(declarer), sheet, orderedOpponentKeys(state, declarer, attackableKeys(body, context))))
  // Evasive Movement used this round's action: Full Defense is all that is left to declare.
  const evading = declarer.movement?.choice === 'evade'
  const run = useCombatRun()
  const model = attackWindowModel({ state, attack: draftAttack(declarer), attacker: declarer, sheet, draft, fightId: body.fightId, roster: body.roster })
  // On the ground with nobody the posture rules let them attack: the same Full Defense only.
  const down = combatPosture(sheet, context) === 'prone' && model.targets.length === 0
  const [fullChosen, setFull] = useState(false)
  const full = evading || down || fullChosen
  const [against, setAgainst] = useState<string | null>(null)
  const parts = { body, draft, setDraft, model, run, onFull: setFull }
  const guarded = guardedKey(against, draft)
  return (
    <>
      <div className="declare-top">
        <div className="declaration-actor"><small>Declaring now</small><strong>{declarer.name}</strong></div>
        <NoticeSlot notices={declareNotices({ state, declarer, refusal: run.refusal, evading, down, reach: full ? null : model.reach })} />
      </div>
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
    <CombatWindow title="Declare" stepper={<CombatStepper steps={['Target', 'Weapon', 'Attack', 'Declare']} now={3} />}>
      {sheet ? <DeclareBody key={props.state.stageInstanceId} {...props} fighter={fighter!} sheet={sheet} /> : <p className="note">Reading {props.declarer.name}&apos;s sheet...</p>}
    </CombatWindow>
  )
}
