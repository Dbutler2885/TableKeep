import type { Combatant } from '../engine/types'

export type CombatGmTool = '' | 'actfor' | 'place'

type GmToolsProps = {
  tool: CombatGmTool
  onTool: (tool: CombatGmTool) => void
  combatants: readonly Combatant[]
  actingFor: string | null
  onActFor: (key: string) => void
  onStopActing: () => void
}

function ActingStatus({ combatants, actingFor, onStopActing }: Pick<GmToolsProps, 'combatants' | 'actingFor' | 'onStopActing'>) {
  if (!actingFor) return null
  return <><span className="acting-label">Acting for {combatants.find((entry) => entry.key === actingFor)?.name}</span><button className="btn line small" type="button" onClick={onStopActing}>Stop acting</button></>
}

/** Explicit player choices, with visible control of when the GM acts for someone. */
export function CombatGmTools({ tool, onTool, combatants, actingFor, onActFor, onStopActing }: GmToolsProps) {
  const open = tool === 'actfor'
  const players = combatants.filter((entry) => entry.kind === 'character')
  return <>
    <div className="gm-action-row">
      <ActingStatus combatants={combatants} actingFor={actingFor} onStopActing={onStopActing} />
      <button className="btn line small" type="button" aria-expanded={open} aria-controls="combat-player-picker" onClick={() => onTool(open ? '' : 'actfor')}>{open ? 'Cancel' : actingFor ? 'Change player' : 'Act for a player'}</button>
    </div>
    {open ? <section className="gm-player-picker" id="combat-player-picker" aria-label="Act for a player">
      <span className="label">Who is away from the table?</span>
      <div className="gm-player-list">{players.map((entry) => <button className="btn line small" type="button" key={entry.key} aria-label={`Act for ${entry.name}`} onClick={() => { onActFor(entry.key); onTool('') }}>{entry.name}</button>)}</div>
      <p className="note">You roll or choose for the player you select.</p>
    </section> : null}
  </>
}
