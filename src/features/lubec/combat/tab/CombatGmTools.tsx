import { useState } from 'react'
import type { LubecGmItem } from '../../../ruleSets/lubec/gear/gmItem'
import type { Combatant } from '../engine/types'
import { CombatItemPicker } from './CombatItemPicker'

export type CombatGmTool = '' | 'actfor' | 'out' | 'place' | 'end'

/** The mock-up's four tools. */
const TOOLS: readonly (readonly [CombatGmTool, string])[] = [
  ['', 'GM tools...'],
  ['actfor', 'A player is away from the table: act for them'],
  ['out', 'Take someone out of the fight, or return them'],
  ['place', 'Place an item on the Floor'],
  ['end', 'End combat'],
]

type GmToolsProps = {
  tool: CombatGmTool
  onTool: (tool: CombatGmTool) => void
  items: readonly LubecGmItem[]
  placing: boolean
  onPlace: (item: LubecGmItem, qty: number) => void
  onEnd: () => void
  combatants: readonly Combatant[]
  actingFor: string | null
  onActFor: (key: string) => void
  onOut: (combatant: Combatant) => void
}

const Who = ({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) => (
  <label className="f who-pick"><span>Who</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>
)

/** Act for: absence is the GM's call, never inferred; it lasts for the attack or stage it is chosen in. */
function ActForTool({ combatants, actingFor, onActFor }: Pick<GmToolsProps, 'combatants' | 'actingFor' | 'onActFor'>) {
  const players = combatants.filter((entry) => entry.kind === 'character')
  return (
    <>
      <Who value={actingFor ?? ''} onChange={onActFor}>
        <option value="" disabled>Choose a player</option>
        {players.map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}
      </Who>
      <span className="note">You roll or choose for them. Use it when the player is away from the table.</span>
    </>
  )
}

/** Take out or return: one neutral action whichever way round. */
const outName = (combatant: Combatant): string => `${combatant.name}${combatant.outReason === null ? '' : ' (Out)'}`

function OutTool({ combatants, onOut }: Pick<GmToolsProps, 'combatants' | 'onOut'>) {
  // A live fight always has someone in it.
  const [key, setKey] = useState(combatants[0].key)
  const who = combatants.find((entry) => entry.key === key)!
  return (
    <>
      <Who value={key} onChange={setKey}>
        {combatants.map((entry) => <option key={entry.key} value={entry.key}>{outName(entry)}</option>)}
      </Who>
      <button className="btn line small" type="button" onClick={() => onOut(who)}>{who.outReason === null ? 'Take out' : 'Return'} {who.name}</button>
      <span className="note">They show as Out: rounds stop waiting for them and their attack stops. You can return them.</span>
    </>
  )
}

function ToolBody({ tool, items, placing, onPlace, onEnd, ...people }: Omit<GmToolsProps, 'onTool'>) {
  if (tool === 'actfor') return <ActForTool {...people} />
  if (tool === 'out') return <OutTool {...people} />
  if (tool === 'place') return <CombatItemPicker items={items} onPlace={onPlace} withCount busy={placing} />
  return tool === 'end' ? <button className="btn rust small" type="button" onClick={onEnd}>End combat</button> : null
}

/** The GM's tools over the middle. */
export function CombatGmTools({ tool, onTool, ...body }: GmToolsProps) {
  return (
    <div className="gmtools">
      <select aria-label="GM tools" value={tool} onChange={(event) => onTool(event.target.value as CombatGmTool)}>
        {TOOLS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <ToolBody tool={tool} {...body} />
    </div>
  )
}
