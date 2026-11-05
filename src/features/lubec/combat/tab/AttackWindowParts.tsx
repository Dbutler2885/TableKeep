import { lubecCombatantFace, type LubecCombatant } from '../../fight/lubecFightRequest'
import type { CombatAttack, CombatAttackRange, Combatant } from '../engine/types'
import { attackSum, withDefense, type AttackDraft, type AttackSegments, type AttackSum } from './attackDraft'

type NoticeProps = { attacker: Combatant; attack: CombatAttack; refusal: string | null; gm: boolean }

/** Why this attack runs now, what it waits on, and what the table refused. */
export function AttackNotices({ attacker, attack, refusal, gm }: NoticeProps) {
  const granted = gm ? `${attacker.name} has a Sneak Attack.` : 'The GM granted you a Sneak Attack.'
  return (
    <>
      <div className="notice cool"><span><b>{granted}</b> This attack runs now, before initiative. Pick, split and Roll in one go.</span></div>
      {attack.repair ? <div className="notice hot" role="alert"><span><b>Waiting for a repair.</b> {attack.repair} Nothing has been spent or rolled.</span></div> : null}
      {refusal ? <div className="notice hot" role="alert"><span>{refusal}</span></div> : null}
    </>
  )
}

/** The trail over the window: who attacks, and when. */
export function AttackTrail({ attacker }: { attacker: Combatant }) {
  return <div className="trail"><span className="who"><small>Attacker</small>{attacker.name}</span><span className="who"><small>Round 0</small>Before initiative</span></div>
}

type AskProps = { target: LubecCombatant; reading: AttackSum; range: CombatAttackRange | null; segments: AttackSegments }

/** "Roll to hit Roy Carver." beside the pool's sum, as the mock-up's ask row has them. */
export function AttackAsk({ target, reading, range, segments }: AskProps) {
  return (
    <div className="ask-row">
      <p className="ask">Roll to hit {lubecCombatantFace(target).name}.</p>
      <span className="effective"><span className="sum">{attackSum(reading, range)} <b>{segments.defense + segments.attackNumber}</b></span></span>
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

type LineProps = { draft: AttackDraft; defense: NonNullable<AttackDraft['defense']>; opponents: readonly Combatant[]; onDraft: (draft: AttackDraft) => void }

function DefenseLine({ draft, defense, opponents, onDraft }: LineProps) {
  return (
    <div className="defense-lines">
      <div className="defrow">
        <span className="defchip">DEF 1</span><span className="label">against</span>
        <select aria-label="Defense against" value={defense.against} onChange={(event) => onDraft({ ...draft, defense: { ...defense, against: event.target.value } })}>
          {opponents.map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}
        </select>
      </div>
    </div>
  )
}

/** One named Defense line, or the link that adds it. */
export function AttackDefenseLine(props: DefenseProps) {
  const defense = props.draft.defense
  return defense ? <DefenseLine draft={props.draft} defense={defense} opponents={props.opponents} onDraft={props.onDraft} /> : <AddDefenseLine {...props} />
}
