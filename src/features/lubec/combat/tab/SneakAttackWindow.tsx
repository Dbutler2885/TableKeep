import { useCallback, useEffect, useRef, useState } from 'react'
import { sheetPayload } from '../../../character/characterStore/sheetIntentionEdits'
import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import type { LubecHands } from '../../../ruleSets/lubec/gear/held'
import { LubecFightWindowContent } from '../../fight/LubecFightWindowContent'
import { lubecCombatantKey, lubecCombatantRecord, type LubecCombatant } from '../../fight/lubecFightRequest'
import { combatOpponents } from '../engine/attackParty'
import type { CombatAim, CombatAttack, Combatant, CombatState } from '../engine/types'
import { AttackBar, SegmentRoll } from './AttackBar'
import type { AttackAct, AttackCommands } from './attackCommands'
import { initialDraft, sameAim, segmentMiddle, withDefense, withWeapon, type AttackDraft } from './attackDraft'
import { attackWindowModel, type AttackWindowModel } from './attackWindowModel'
import { AttackAsk, AttackDefenseLine, AttackNotices, AttackTrail } from './AttackWindowParts'
import { combatFightCombatant, type CombatRosterRecords } from './combatFightCombatants'
import { CombatStepper, CombatWindow } from './CombatParts'
import { RangeRow, type DeclareRange } from './RangeRow'

type Refuse = (reason: string | null) => void

/** Persist a complete pick as the aim, so the GM sees the weapon to range and a reload finds it. */
function useAimSync(attack: CombatAttack, aim: CombatAim | null, send: (aim: CombatAim) => AttackAct, refuse: Refuse) {
  const sent = useRef<string | null>(null)
  useEffect(() => {
    if (!aim || sameAim(attack.aim, aim)) return
    const key = sheetPayload(aim)
    if (sent.current === key) return
    sent.current = key
    void send(aim).then(refuse)
  }, [attack.aim, aim, send, refuse])
}

/** Roll: persist the aim first if the table does not hold it yet, then roll once. */
function useRoll(attack: CombatAttack, attacker: Combatant, aim: CombatAim | null, commands: AttackCommands, refuse: Refuse) {
  const [busy, setBusy] = useState(false)
  const roll = async (next: CombatAim) => {
    setBusy(true)
    const aimed = sameAim(attack.aim, next) ? null : await commands.aim(attacker.key, next)
    refuse(aimed ?? await commands.roll(attacker.key, next))
    setBusy(false)
  }
  // Roll shows only over a split, which exists only for a complete aim.
  return { busy, roll: () => void roll(aim!) }
}

type WindowProps = {
  state: CombatState
  fightId: string
  attack: CombatAttack
  attacker: Combatant
  roster: CombatRosterRecords
  commands: AttackCommands
  /** The GM declares the range and works an NPC's or an absent player's window. */
  gm: boolean
  onInventory: (hands: LubecHands) => void
}

type BodyProps = WindowProps & { fighter: LubecCombatant; sheet: LubecCharacterSheet }

function useAttackWindow({ state, attack, attacker, commands, sheet, ...props }: BodyProps) {
  const [draft, setDraft] = useState<AttackDraft>(() => initialDraft(attack, sheet, combatOpponents(state, attacker).map((entry) => entry.key)))
  const [refusal, setRefusal] = useState<string | null>(null)
  const refuse = useCallback<Refuse>((reason) => setRefusal(reason), [])
  const model = attackWindowModel({ state, attack, attacker, sheet, draft, fightId: props.fightId, roster: props.roster })
  const sendAim = useCallback((next: CombatAim) => commands.aim(attacker.key, next), [commands, attacker.key])
  useAimSync(attack, model.aim, sendAim, refuse)
  const roll = useRoll(attack, attacker, model.aim, commands, refuse)
  return { draft, setDraft, refusal, refuse, model, roll }
}

const targetNote = (state: CombatState) => (target: LubecCombatant): string => {
  const combatant = state.combatants.find((entry) => entry.key === lubecCombatantKey(target))!
  return `${combatant.kind === 'npc' ? 'NPC' : 'Player'} · Speed ${combatant.speed}`
}

type ChoicesProps = { body: BodyProps; draft: AttackDraft; setDraft: (draft: AttackDraft) => void; model: AttackWindowModel }

function WindowChoices({ body, draft, setDraft, model }: ChoicesProps) {
  return (
    <LubecFightWindowContent
      request={{ attacker: body.fighter, target: model.target, weaponItemId: draft.weaponItemId ?? undefined, attackId: draft.attackId ?? undefined }}
      targets={model.targets} targetNote={targetNote(body.state)} onInventory={body.onInventory}
      onTarget={(key) => setDraft({ ...draft, targetKey: key })}
      onWeapon={(id) => setDraft(withWeapon(draft, body.sheet, id))}
      onAttack={(id) => setDraft({ ...draft, attackId: id })}
    />
  )
}

const showsRange = (model: AttackWindowModel): boolean => model.held && model.reading?.ranged === true

/** The GM declares from inside the window they work; an attacking player only reads the row. */
function rangeDeclare(body: BodyProps, refuse: Refuse): DeclareRange | null {
  if (!body.gm) return null
  return (band, modifier) => void body.commands.range(band, modifier).then(refuse)
}

function WindowRange({ body, model, refuse }: { body: BodyProps; model: AttackWindowModel; refuse: Refuse }) {
  if (!showsRange(model)) return null
  return <RangeRow attack={body.attack} remembered={body.state.lastRanges?.[body.attacker.key]} onDeclare={rangeDeclare(body, refuse)} />
}

type SplitProps = { model: AttackWindowModel; draft: AttackDraft; setDraft: (draft: AttackDraft) => void; busy: boolean; onRoll: () => void }

/** The bar with Roll over the attack, and the one named Defense line under it. */
function WindowSplit({ model, draft, setDraft, busy, onRoll }: SplitProps) {
  if (!model.split) return null
  const { segments, reading, target } = model.split
  const moveDefense = (amount: number) => setDraft(withDefense(draft, amount, reading.total, draft.targetKey!))
  const roll = <SegmentRoll at={segmentMiddle(segments.attackFrom, segments.attackWidth)} label="Roll" disabled={!model.ready || busy} onRoll={onRoll} />
  return (
    <>
      <AttackAsk target={target} reading={reading} range={model.range} segments={segments} />
      <AttackBar segments={segments} onDefense={moveDefense} controls={roll} />
      <AttackDefenseLine draft={draft} segments={segments} opponents={model.opponents} total={reading.total} onDraft={setDraft} />
    </>
  )
}

function WindowBody(body: BodyProps) {
  const { draft, setDraft, refusal, refuse, model, roll } = useAttackWindow(body)
  return (
    <>
      <AttackNotices attacker={body.attacker} attack={body.attack} refusal={refusal} gm={body.gm} />
      <AttackTrail attacker={body.attacker} />
      <WindowChoices body={body} draft={draft} setDraft={setDraft} model={model} />
      <WindowRange body={body} model={model} refuse={refuse} />
      <WindowSplit model={model} draft={draft} setDraft={setDraft} busy={roll.busy} onRoll={roll.roll} />
    </>
  )
}

/**
 * Moments 5 and 7 as Before initiative uses them: the granted attacker picks,
 * splits, waits for the GM's range if the weapon needs one, and rolls, all in
 * the one window, with no Declare turn.
 */
export function SneakAttackWindow(props: WindowProps) {
  const fighter = combatFightCombatant(props.attacker, props.roster)
  const sheet = fighter ? lubecCombatantRecord(fighter)?.lubec : undefined
  return (
    <CombatWindow title="Attack" stepper={<CombatStepper steps={['Target', 'Weapon', 'Attack', 'Roll']} now={3} />} foot={<span className="note">No declaration before initiative: this attack goes now.</span>}>
      {sheet ? <WindowBody key={props.attack.id} {...props} fighter={fighter!} sheet={sheet} /> : <p className="note">Reading {props.attacker.name}&apos;s sheet...</p>}
    </CombatWindow>
  )
}
