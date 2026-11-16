import { lubecCombatantFace, type LubecCombatant } from '../../fight/lubecFightRequest'
import type { CombatAttack, CombatAttackRange, Combatant } from '../engine/types'
import { attackSum, withDefense, type AttackDraft, type AttackSegments, type AttackSum } from './attackDraft'
import type { AttackGone } from './attackWindowModel'
import { AttackMatchup } from './AttackMatchup'

type NoticeProps = { attacker: Combatant; attack: CombatAttack; refusal: string | null; gm: boolean }

/** Why this attack runs now, what it waits on, and what the table refused. */
export function AttackNotices({ attacker, attack, refusal, gm }: NoticeProps) {
  const granted = gm ? `${attacker.name} has a Sneak Attack.` : 'The GM granted you a Sneak Attack.'
  return (
    <>
      <div className="notice cool"><span><b>{granted}</b> This attack runs now, before initiative. Pick, split and Roll in one go.</span></div>
      <RepairNotice attack={attack} />
      {refusal ? <div className="notice hot" role="alert"><span>{refusal}</span></div> : null}
    </>
  )
}

/** The current matchup above the choices, with round metadata kept secondary. */
export function AttackTrail({ attacker, target, round }: { attacker: Combatant; target: string | null; round: number }) {
  return <>
    <AttackMatchup attacker={attacker.name} target={target} />
    <p className="matchup-context">{round ? `Round ${round} · Stage 3, Attack` : 'Before initiative'}</p>
  </>
}

type RoundNoticeProps = { attack: CombatAttack; targetName: string; gone: AttackGone; refusal: string | null }

/** What has gone before this declared attack's turn, and that choosing again wastes nothing. */
export function RoundNotices({ attack, targetName, gone, refusal }: RoundNoticeProps) {
  return (
    <>
      {gone.target ? <div className="notice hot"><span><b>{targetName} is Out.</b> Your target has gone before your turn. Choose again; your declared split stays and nothing is wasted.</span></div> : null}
      {gone.weapon ? <div className="notice hot"><span><b>The {attack.frozen!.weaponName.toLowerCase()} is no longer in your hand.</b> Choose a weapon again; your declared split stays and nothing is wasted.</span></div> : null}
      <RepairNotice attack={attack} />
      {refusal ? <div className="notice hot" role="alert"><span>{refusal}</span></div> : null}
    </>
  )
}

const RepairNotice = ({ attack }: { attack: CombatAttack }) =>
  (attack.repair ? <div className="notice hot" role="alert"><span><b>Waiting for a repair.</b> {attack.repair} Nothing has been spent or rolled.</span></div> : null)

/** A declared line on the locked split: who it guards against, named, not chosen. */
export function LockedDefenseLine({ against }: { against: string | null }) {
  if (!against) return null
  return <div className="defense-lines"><div className="defrow"><span className="defchip">DEF 1</span><span className="label">against</span><b>{against}</b></div></div>
}

type AskProps = { target: LubecCombatant; reading: AttackSum; range: CombatAttackRange | null; evasion?: number; segments: AttackSegments }

/** "Roll to hit Roy Carver." beside the pool's sum, as the mock-up's ask row has them. */
export function AttackAsk({ target, reading, range, evasion = 0, segments }: AskProps) {
  return (
    <div className="ask-row">
      <p className="ask">Roll to hit {lubecCombatantFace(target).name}.</p>
      <span className="effective"><span className="sum">{attackSum(reading, range, evasion)} <b>{segments.defense + segments.attackNumber}</b></span></span>
    </div>
  )
}

type DefenseProps = { draft: AttackDraft; segments: AttackSegments; opponents: readonly Combatant[]; total: number; onDraft: (draft: AttackDraft) => void }

/** "Add a Defense line" while the attack has more than 20 to give; there is never a second line. */
function AddDefenseLine({ draft, segments, total, onDraft }: DefenseProps) {
  if (segments.attackWidth <= 20) return null
  // A split exists only for a complete aim, so the line first guards against its target.
  return <p className="note defense-add"><button type="button" className="linkish" onClick={() => onDraft(withDefense(draft, 20, total, draft.targetKey!))}>Add a Defense line</button></p>
}

type SelectProps = { against: string; opponents: readonly Combatant[]; onAgainst: (key: string) => void }

/** The one Defense line: its chip and the person it guards against. */
export function DefenseLineSelect({ against, opponents, onAgainst }: SelectProps) {
  return (
    <div className="defense-lines">
      <div className="defrow">
        <span className="defchip">DEF 1</span><span className="label">against</span>
        <select aria-label="Defense against" value={against} onChange={(event) => onAgainst(event.target.value)}>
          {opponents.map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}
        </select>
      </div>
    </div>
  )
}

/** One named Defense line, or the link that adds it. */
export function AttackDefenseLine(props: DefenseProps) {
  const defense = props.draft.defense
  if (!defense) return <AddDefenseLine {...props} />
  return <DefenseLineSelect against={defense.against} opponents={props.opponents} onAgainst={(against) => props.onDraft({ ...props.draft, defense: { ...defense, against } })} />
}
