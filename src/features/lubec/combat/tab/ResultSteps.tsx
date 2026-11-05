import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { lubecCurrentValue, lubecEffectiveHandle } from '../../../ruleSets/lubec/derivations'
import { locName } from '../../../ruleSets/lubec/gear/gearRules'
import { lubecCombatantRecord, type LubecCombatant } from '../../fight/lubecFightRequest'
import { lubecPartDistances } from '../engine/hitLocation'
import { combatInputModifiers } from '../engine/inputModifiers'
import type { CombatAttack, Combatant, CombatState } from '../engine/types'
import { SegmentRoll } from './AttackBar'
import type { AttackAct, AttackCommands } from './attackCommands'
import { combatFightCombatant, type CombatRosterRecords } from './combatFightCombatants'
import { CombatDoll } from './CombatDoll'
import { catchFacts, catchVerdict, checkAsk, checkVerdict, defenseVerdict, impactChips, stopWords, strengthTitle, woundBox, type WoundBoxWords } from './resultSequence'
import { RollBar } from './RollBar'

/** What this viewer may do in the sequence: the steps they own, the GM's way to act for an absent player, and the commands. */
export type StepControls = {
  owns: (key: string) => boolean
  isGm: boolean
  commands: AttackCommands
  onActFor: (key: string) => void
  roster: CombatRosterRecords
  fightId: string
}

export type StepProps = { state: CombatState; attack: CombatAttack; controls: StepControls | null; active: boolean }

const nameOf = (state: CombatState, key: string): string => state.combatants.find((entry) => entry.key === key)!.name
const combatantOf = (state: CombatState, key: string): Combatant => state.combatants.find((entry) => entry.key === key)!
const lower = (part: string) => locName(part).toLowerCase()
const half = (value: number) => Math.max(8, Math.min(92, value / 2))

/** Whether this viewer works the step now: it is waiting, and they own (or act for) its combatant. */
const working = (props: StepProps, key: string): props is StepProps & { controls: StepControls } => props.active && props.controls !== null && props.controls.owns(key)

/** "Waiting for the GM to roll Roy's defense", as the mock-up says it, with the GM's way to act for an absent player. */
type WaitProps = { state: CombatState; controls: StepControls | null; owner: string; what: string }

function WaitWords({ state, owner, what }: Omit<WaitProps, 'controls'>) {
  const combatant = combatantOf(state, owner)
  return <span className="plain-roll">{combatant.kind === 'npc' ? `Waiting for the GM to roll ${combatant.name}'s ${what}` : `Waiting for ${combatant.name} to roll`}</span>
}

function ActFor({ state, controls, owner }: Omit<WaitProps, 'what'>) {
  const combatant = combatantOf(state, owner)
  if (!controls?.isGm || combatant.kind !== 'character') return null
  return <p className="note"><button type="button" className="linkish" onClick={() => controls.onActFor(owner)}>Away from the table? Roll for {combatant.name}</button></p>
}

function Waiting(props: WaitProps) {
  return <><WaitWords {...props} /><ActFor {...props} /></>
}

/** A step's Roll button: pressed once, it waits on the table and shows a refusal. */
function useAct() {
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const run = async (act: () => AttackAct) => {
    setBusy(true)
    setRefusal(await act())
    setBusy(false)
  }
  return { busy, refusal, run: (act: () => AttackAct) => void run(act) }
}

function Refusal({ refusal }: { refusal: string | null }) {
  return refusal ? <div className="notice hot" role="alert"><span>{refusal}</span></div> : null
}

/** The defender's sheet as this viewer can read it: Handle for the pool, Strength for the attacker. */
function sheetOf(state: CombatState, key: string, controls: StepControls) {
  const sheet = readableSheet(combatFightCombatant(combatantOf(state, key), controls.roster))
  return sheet ? { sheet, modifiers: combatInputModifiers(sheet, { fightId: controls.fightId, round: state.round }) } : null
}

const readableSheet = (record: LubecCombatant | null) => (record ? lubecCombatantRecord(record)?.lubec : undefined)

const handlePool = (state: CombatState, key: string, controls: StepControls): number | null => {
  const read = sheetOf(state, key, controls)
  return read && lubecEffectiveHandle(read.sheet, read.modifiers)
}

type SplitProps = { state: CombatState; attack: CombatAttack; controls: StepControls; pool: number }

/** The defender's grant-local split: Defense in tens on their own Handle, or Full Defense, naming this attacker. */
/** Show the table the split being chosen, so every seat sees what the defender keeps before the roll. */
function useSplitSync(attack: CombatAttack, split: { amount: number; full: boolean }, send: (split: { amount: number; full: boolean }) => AttackAct) {
  const sent = useRef<string | null>(null)
  const key = JSON.stringify([split.amount, split.full])
  const held = JSON.stringify([attack.defenseSplit?.amount, attack.defenseSplit?.full])
  useEffect(() => {
    if (key === held || sent.current === key) return
    sent.current = key
    const [amount, full] = JSON.parse(key) as [number, boolean]
    void send({ amount, full })
  }, [key, held, send])
}

const tensOf = (pool: number) => Math.floor(pool / 10) * 10

/** The defender's draft: what the table already holds, or every whole ten of their Handle. */
function useDefenseDraft(attack: CombatAttack, pool: number) {
  const held = attack.defenseSplit
  const [amount, setAmount] = useState(held ? held.amount : tensOf(pool))
  const [full, setFull] = useState(held?.full === true)
  const move = (next: number) => setAmount(Math.max(0, Math.min(tensOf(pool), Math.round(next / 10) * 10)))
  return { split: { amount: full ? pool : amount, full }, value: full ? Math.min(100, pool + 10) : amount, full, setFull, move }
}

function DefenseSplit({ state, attack, controls, pool }: SplitProps) {
  const { split, value, full, setFull, move } = useDefenseDraft(attack, pool)
  const act = useAct()
  const defender = attack.aim!.targetKey
  useSplitSync(attack, split, useCallback((next) => controls.commands.split(defender, next), [controls.commands, defender]))
  const roll = <SegmentRoll at={half(value)} label={value ? 'Roll Defense' : 'No Defense'} disabled={act.busy} onRoll={() => act.run(() => controls.commands.defend(defender, split))} />
  return (
    <>
      <Refusal refusal={act.refusal} />
      <p className="say">Split your Handle for Defense against <b>{nameOf(state, attack.attackerKey)}</b>.</p>
      <label className="fdcheck"><input type="checkbox" checked={full} onChange={(event) => setFull(event.target.checked)} /> Full Defense</label>
      <RollBar value={value} tag="DEF" bonus={full} onMove={full ? undefined : move} controls={roll} />
    </>
  )
}

function DefenseLive(props: StepProps & { controls: StepControls }) {
  const defender = props.attack.aim!.targetKey
  const pool = handlePool(props.state, defender, props.controls)
  if (pool === null) return <p className="note">Reading {nameOf(props.state, defender)}&apos;s sheet...</p>
  return <DefenseSplit state={props.state} attack={props.attack} controls={props.controls} pool={pool} />
}

function DefenseRolled({ state, attack }: Pick<StepProps, 'state' | 'attack'>) {
  const defense = attack.defense!
  const net = attack.net!
  return (
    <>
      <p className="say"><b>{nameOf(state, attack.aim!.targetKey)}</b> kept {defense.amount} for {defense.full ? 'Full ' : ''}Defense against {nameOf(state, attack.attackerKey)}.</p>
      <RollBar value={defense.value} tag="DEF" bonus={defense.full} roll={defense} controls={null} />
      <p className={`verdict ${defense.success ? 'ok' : 'bad'}`}>{defenseVerdict(defense)}</p>
      <div className="chips"><dl className="chip"><dt>Attack Quality</dt><dd>{attack.roll!.quality}</dd></dl><span className="op">−</span><dl className="chip armor"><dt>Defense</dt><dd>{defense.removes}</dd></dl><span className="op">=</span><dl className="chip on"><dt>Left</dt><dd>{net}</dd></dl></div>
      <StopWords attack={attack} />
    </>
  )
}

/** "Down to 0. The throw is dodged." once a successful Defense takes the quality to 0 or below. */
function StopWords({ attack }: { attack: CombatAttack }) {
  const words = stopWords(attack)
  return words ? <p className="say"><b>{words.title}</b> {words.text}</p> : null
}

function DefenseResult({ state, attack }: Pick<StepProps, 'state' | 'attack'>) {
  if (attack.defense) return <DefenseRolled state={state} attack={attack} />
  return <p className="say"><b>{nameOf(state, attack.aim!.targetKey)}</b> kept no Defense against {nameOf(state, attack.attackerKey)}.</p>
}

/** What the table sees while the defender chooses: what they keep against this attacker, on its bar, and who rolls it. */
function DefensePending(props: StepProps) {
  const defender = props.attack.aim!.targetKey
  const split = props.attack.defenseSplit
  const wait = <WaitWords state={props.state} owner={defender} what="defense" />
  const actFor = <ActFor state={props.state} controls={props.controls} owner={defender} />
  if (!split) return <><p className="say"><b>{nameOf(props.state, defender)}</b> is choosing what to keep for Defense against {nameOf(props.state, props.attack.attackerKey)}.</p><div className="roll-controls">{wait}</div>{actFor}</>
  const value = split.full ? Math.min(100, split.amount + 10) : split.amount
  return (
    <>
      <p className="say"><b>{nameOf(props.state, defender)}</b> kept {split.amount} for {split.full ? 'Full ' : ''}Defense against {nameOf(props.state, props.attack.attackerKey)}.</p>
      <RollBar value={value} tag="DEF" bonus={split.full} controls={wait} />
      {actFor}
    </>
  )
}

export function DefenseStep(props: StepProps) {
  const defender = props.attack.aim!.targetKey
  if (props.attack.defense !== undefined || props.attack.step !== 'defense') return <DefenseResult state={props.state} attack={props.attack} />
  if (working(props, defender)) return <DefenseLive {...props} controls={props.controls} />
  return <DefensePending {...props} />
}

function CatchChecks({ attack }: { attack: CombatAttack }) {
  const facts = catchFacts(attack)
  return (
    <>
      <ul className="checks"><li className="yes">It hit</li><li className="yes">Defense took it to {attack.net}{facts.below > 0 ? ' (below 0)' : ''}</li><li className="yes">A free hand</li><li className="yes">A catchable item: {facts.name.toLowerCase()}, {facts.base}%</li></ul>
      <div className="chips"><dl className="chip"><dt>{facts.name}</dt><dd>{facts.base}%</dd></dl><span className="op">+</span><dl className="chip"><dt>10 × below 0</dt><dd>{10 * facts.below}</dd></dl><span className="op">=</span><dl className="chip on"><dt>Catch chance</dt><dd>{attack.catchChance}%</dd></dl><span className="op cap">capped at 100%</span></div>
    </>
  )
}

function CatchControl(props: StepProps) {
  const act = useAct()
  const defender = props.attack.aim!.targetKey
  if (!working(props, defender)) return <Waiting state={props.state} controls={props.controls} owner={defender} what="catch" />
  return <><SegmentRoll at={half(props.attack.catchChance!)} label="Roll catch" disabled={act.busy} onRoll={() => act.run(() => props.controls!.commands.catchRoll(defender))} /><Refusal refusal={act.refusal} /></>
}

function CatchVerdict({ attack }: { attack: CombatAttack }) {
  const rolled = attack.catch
  if (!rolled) return null
  return <p className={`verdict ${rolled.success ? 'ok' : 'bad'}`}>{catchVerdict(rolled)}</p>
}

export function CatchStep(props: StepProps) {
  const waiting = !props.attack.catch && props.active
  return (
    <>
      <CatchChecks attack={props.attack} />
      <RollBar value={props.attack.catchChance!} tag="CATCH" roll={props.attack.catch} controls={waiting ? <CatchControl {...props} /> : null} />
      <CatchVerdict attack={props.attack} />
    </>
  )
}

function LocationLive(props: StepProps & { controls: StepControls }) {
  const landing = props.attack.landing!
  const [part, setPart] = useState(landing.start)
  const act = useAct()
  const distances = lubecPartDistances(landing.start)
  const reach = props.attack.net!
  return (
    <LocationLayout landing={landing.start} part={part} distances={distances} reach={reach} onPick={setPart} target={nameOf(props.state, props.attack.aim!.targetKey)}>
      <p className="note">You may move it one part per point of reach; each step costs 1 Impact. Click a part, or keep it where it landed.</p>
      {part !== landing.start ? <p className="note"><button type="button" className="linkish" onClick={() => setPart(landing.start)}>Keep it on the {lower(landing.start)}</button></p> : null}
      <Refusal refusal={act.refusal} />
      <p className="hit-button"><button type="button" className="btn rust" disabled={act.busy} onClick={() => act.run(() => props.controls.commands.land(props.attack.attackerKey, part))}>Hit the {lower(part)}</button></p>
    </LocationLayout>
  )
}

type LayoutProps = { landing: string; part: string; distances: Record<string, number>; reach: number; target: string; onPick: ((part: string) => void) | null; children: ReactNode }

function LocationLayout({ landing, part, distances, reach, target, onPick, children }: LayoutProps) {
  return (
    <div className="doll-step">
      <div>
        <CombatDoll start={landing} chosen={part} distances={distances} reach={reach} onPick={onPick} />
        <p className="map-legend"><span><i className="cross-key"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="12" cy="12" r="6" /><path d="M1 12h22M12 1v22" /></svg></i>Landed</span><span><i className="reach-key" />In reach</span><span><i className="chosen-key" />Chosen</span></p>
      </div>
      <div>
        <p className="ask">It lands on {target}&apos;s {lower(landing)}.</p>
        <div className="impact roll-chips"><dl className="chip"><dt>Quality left</dt><dd>{reach}</dd></dl><dl className="chip armor"><dt>Reach</dt><dd>{reach}</dd></dl></div>
        <p className="big-pick">{locName(part)}<span className="quality-left">Quality <span className="q">{reach - distances[part]}</span></span></p>
        {children}
      </div>
    </div>
  )
}

export function LocationStep(props: StepProps) {
  const landing = props.attack.landing!
  const target = nameOf(props.state, props.attack.aim!.targetKey)
  if (props.attack.step === 'location' && working(props, props.attack.attackerKey)) return <LocationLive {...props} controls={props.controls} />
  const part = landing.part ?? landing.start
  const words = landing.part ? <p className="verdict neutral">Hits {target}&apos;s {lower(part)}.</p> : <Waiting state={props.state} controls={props.controls} owner={props.attack.attackerKey} what="hit" />
  return <LocationLayout landing={landing.start} part={part} distances={lubecPartDistances(landing.start)} reach={props.attack.net!} target={target} onPick={null}>{words}</LocationLayout>
}

function StrengthControl({ at, ...props }: StepProps & { at: number }) {
  const act = useAct()
  const attacker = props.attack.attackerKey
  if (!working(props, attacker)) return <Waiting state={props.state} controls={props.controls} owner={attacker} what="Strength" />
  return <><SegmentRoll at={at} label="Roll Strength" disabled={act.busy} onRoll={() => act.run(() => props.controls.commands.strength(attacker))} /><Refusal refusal={act.refusal} /></>
}

/** Current Strength, from the roll once made, or from the attacker's sheet as this viewer reads it. */
function strengthOf(props: StepProps): number | null {
  if (props.attack.strength) return props.attack.strength.strength
  // Before the roll the attack is open, so the result shows with this viewer's controls.
  const read = sheetOf(props.state, props.attack.attackerKey, props.controls!)
  return read && lubecCurrentValue(read.sheet, 'Strength', read.modifiers)
}

function StrengthBar(props: StepProps) {
  const rolled = props.attack.strength
  const value = strengthOf(props)
  const control = rolled ? null : <StrengthControl {...props} at={half(value ?? 100)} />
  return (
    <>
      <p className="say"><b>{strengthTitle(rolled)}</b></p>
      {value === null ? <div className="roll-controls">{control}</div> : <RollBar value={value} tag="STR" roll={rolled} controls={control} />}
    </>
  )
}

function ImpactChips({ attack }: { attack: CombatAttack }) {
  return (
    <div className="impact">
      {impactChips(attack.impact!, attack.strength?.roll ?? null).map((chip) => (
        <Fragment key={chip.term}>{chip.op ? <span className="op">{chip.op}</span> : null}<dl className={`chip ${chip.cls}`}><dt>{chip.term}</dt><dd>{chip.value}</dd></dl></Fragment>
      ))}
    </div>
  )
}

function WoundTags({ box }: { box: WoundBoxWords }) {
  if (box.severity) return <span><span className={`sev ${box.severity.cls}`}>{box.severity.name}</span> <span className="tag ink">{box.trauma}</span></span>
  return box.tag ? <span className="sev mi">{box.tag}</span> : null
}

function WoundBox({ state, attack }: Pick<StepProps, 'state' | 'attack'>) {
  const box = woundBox(attack, nameOf(state, attack.aim!.targetKey))
  return <div className="wound"><div className="wh"><span>{box.head}</span><WoundTags box={box} /></div><div className="wb">{box.title ? <><b>{box.title}</b> </> : null}{box.body}</div></div>
}

/** The number the target's ordinary roll is made against, as this viewer can read it: the roll's own once made. */
function checkNumber(props: StepProps): number | null {
  const rolled = props.attack.check
  if (rolled) return rolled.target
  // Before the roll the attack is open, so the result shows with this viewer's controls.
  const read = sheetOf(props.state, props.attack.aim!.targetKey, props.controls!)
  return read && checkValue(read, props.attack.row!.check!.against)
}

const checkValue = (read: NonNullable<ReturnType<typeof sheetOf>>, against: 'Handle' | 'Body') =>
  (against === 'Handle' ? lubecEffectiveHandle(read.sheet, read.modifiers) : lubecCurrentValue(read.sheet, against, read.modifiers))

function CheckControl({ at, ...props }: StepProps & { at: number }) {
  const act = useAct()
  const target = props.attack.aim!.targetKey
  const what = props.attack.row!.check!.kind === 'save' ? 'Save' : 'Check'
  if (!working(props, target)) return <WaitWords state={props.state} owner={target} what={what} />
  return <><SegmentRoll at={at} label={`Roll ${what}`} disabled={act.busy} onRoll={() => act.run(() => props.controls.commands.check(target))} /><Refusal refusal={act.refusal} /></>
}

function CheckBar(props: StepProps) {
  const rolled = props.attack.check
  const value = checkNumber(props)
  const control = rolled ? null : <CheckControl {...props} at={half(value ?? 100)} />
  if (value === null) return <div className="roll-controls">{control}</div>
  return <RollBar value={value} tag={props.attack.row!.check!.against.toUpperCase()} roll={rolled && { roll: rolled.result, success: rolled.success }} controls={control} />
}

function CheckVerdict({ attack }: { attack: CombatAttack }) {
  const rolled = attack.check
  return rolled ? <p className={`verdict ${rolled.success ? 'ok' : 'bad'}`}>{checkVerdict(rolled)}</p> : null
}

/** The target's own Check or Save the row calls for: an ordinary roll at or under the number, with the row's Advantage. */
export function CheckStep(props: StepProps) {
  const target = props.attack.aim!.targetKey
  return (
    <>
      <p className="say"><b>{nameOf(props.state, target)}</b> rolls a {checkAsk(props.attack.row!.check!)}.</p>
      <CheckBar {...props} />
      <CheckVerdict attack={props.attack} />
      <ActFor state={props.state} controls={props.controls} owner={target} />
    </>
  )
}

function WoundResult({ state, attack }: Pick<StepProps, 'state' | 'attack'>) {
  // Without Impact yet the wound card waits on Strength, which only melee and thrown attacks roll.
  if (!attack.impact) return <p className="say">Attack Quality {attack.net} is on the way in. It adds a Strength roll.</p>
  return <><ImpactChips attack={attack} /><WoundBox state={state} attack={attack} /></>
}

export function WoundStep(props: StepProps) {
  return (
    <>
      {props.attack.frozen!.choice.str ? <StrengthBar {...props} /> : null}
      <WoundResult state={props.state} attack={props.attack} />
    </>
  )
}
