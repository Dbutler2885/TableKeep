import type { LubecGmItem } from '../../../ruleSets/lubec/gear/gmItem'
import { CombatItemPicker } from './CombatItemPicker'

export type CombatGmTool = '' | 'place' | 'end'

const TOOLS: readonly (readonly [CombatGmTool, string])[] = [
  ['', 'GM tools...'],
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
}

function ToolBody({ tool, items, placing, onPlace, onEnd }: Omit<GmToolsProps, 'onTool'>) {
  if (tool === 'place') return <CombatItemPicker items={items} onPlace={onPlace} withCount busy={placing} />
  if (tool === 'end') return <button className="btn rust small" type="button" onClick={onEnd}>End combat</button>
  return null
}

/** The GM's tools over the middle; only the tools whose actions are built are offered. */
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
