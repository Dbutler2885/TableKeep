import { useMemo, useState, type ReactNode } from 'react'
import type { NpcRecord } from '../../../../types/app'
import type { LubecGmItem } from '../../../ruleSets/lubec/gear/gmItem'
import { combatantKey, combatPublicSummary } from '../engine/inputs'
import type { CombatantSelection, CombatSheet, FloorSelection } from '../engine/types'
import { combatCatchLine, combatCountWords } from './combatFloorRows'
import { addFloorPick, adjustFloorPick, combatSetupProblems, isSelected, pickRowNote, setupFloorRows, toggleCombatant, type CombatSetupIssue } from './combatSetupModel'
import { CombatItemPicker } from './CombatItemPicker'
import { CombatFloorIcon, CombatHead, CombatPanel, CombatStepper, CombatWindow } from './CombatParts'

/** `allies` are the keys of picked NPCs the GM put on the players' side. */
export type CombatSetupStart = { combatants: CombatantSelection[]; floor: FloorSelection[]; allies: string[] }

type SetupProps = {
  characters: readonly CombatSheet[]
  npcs: readonly { npc: NpcRecord; sheet: CombatSheet | null }[]
  items: readonly LubecGmItem[]
  /** Commits the setup; resolves to a refusal's reason, or null once the fight has started. */
  onStart: (setup: CombatSetupStart) => Promise<string | null>
  onRepair: (issue: CombatSetupIssue) => void
}

type PickRowProps = { sheet: CombatSheet; title: string; on: boolean; onToggle: () => void; side: ReactNode }

function PickRow({ sheet, title, on, onToggle, side }: PickRowProps) {
  return (
    <li className={on ? '' : 'off'}>
      <button type="button" className={`chk ${on ? 'on' : ''}`} onClick={onToggle} aria-pressed={on} aria-label={`${sheet.name} fights`}>{on ? '✓' : ''}</button>
      {sheet.name}<small>{pickRowNote(on, title, combatPublicSummary(sheet).speed)}</small>{side}
    </li>
  )
}

type SideProps = { sheet: CombatSheet; on: boolean; allies: readonly string[]; onSide: (key: string) => void }

/** A picked NPC's side: against the players unless the GM says otherwise. It only colours the turn order. */
function SideToggle({ sheet, on, allies, onSide }: SideProps) {
  if (!on || sheet.kind !== 'npc') return null
  const key = combatantKey(sheet)
  const ally = allies.includes(key)
  return <button type="button" className={`side-toggle ${ally ? 'on' : ''}`} onClick={() => onSide(key)} aria-pressed={ally} aria-label={`${sheet.name} fights with the players`}>{ally ? '✓ ' : ''}With the players</button>
}

function SetupIssues({ issues, onRepair }: { issues: readonly CombatSetupIssue[]; onRepair: (issue: CombatSetupIssue) => void }) {
  if (!issues.length) return null
  return (
    <div className="notice hot" role="alert">
      <span><b>Start needs these filled in.</b>
        <ul>{issues.map((issue) => (
          <li key={issue.text}>{issue.text} <button type="button" className="linkish" onClick={() => onRepair(issue)}>Repair {issue.name}</button></li>
        ))}</ul>
      </span>
    </div>
  )
}

type FloorPicksProps = { picks: readonly FloorSelection[]; items: readonly LubecGmItem[]; onPicks: (picks: FloorSelection[]) => void }

function SetupFloor({ picks, items, onPicks }: FloorPicksProps) {
  const rows = setupFloorRows(picks, items)
  return (
    <div>
      <span className="label">Floor: place items from your Items</span>
      <CombatItemPicker items={items} onPlace={(item) => onPicks(addFloorPick(picks, item))} />
      <ul className="roster">
        {rows.map((row) => {
          const line = combatCatchLine(row.item)
          return (
            <li key={row.key}>
              <CombatFloorIcon item={row.item} />
              <span className="row-line">{row.item.name}{line ? <><br /><small>{line}</small></> : null}</span>
              <span className="stepper-q">
                <button type="button" onClick={() => onPicks(adjustFloorPick(picks, row.source, -1))} aria-label={`Fewer ${row.item.name}`}>−</button>
                <b>{row.count}</b>
                <button type="button" onClick={() => onPicks(adjustFloorPick(picks, row.source, 1))} aria-label={`More ${row.item.name}`}>+</button>
              </span>
            </li>
          )
        })}
        {rows.length ? null : <li className="off">Nothing on the Floor yet.</li>}
      </ul>
    </div>
  )
}

type RostersProps = Pick<SetupProps, 'characters' | 'npcs'> & {
  selected: readonly CombatantSelection[]
  onToggle: (selection: CombatantSelection) => void
  allies: readonly string[]
  onSide: (key: string) => void
}

type Picks = Pick<RostersProps, 'selected' | 'onToggle' | 'allies' | 'onSide'>

type RowsProps = { sheets: readonly { sheet: CombatSheet | null; npc?: NpcRecord }[]; empty: string } & Picks

type RosterEntry = RowsProps['sheets'][number]

/** One roster row: a box for anyone with a sheet; an NPC without one is listed but cannot be picked. */
function RosterRow({ entry: { sheet, npc }, selected, onToggle, allies, onSide }: { entry: RosterEntry } & Picks) {
  if (!sheet) return <li className="off"><span className="chk" />{npc?.name}<small>No sheet to fight with</small></li>
  const on = isSelected(selected, sheet)
  return <PickRow sheet={sheet} title={npc?.title ?? ''} on={on} onToggle={() => onToggle({ kind: sheet.kind, sheetId: sheet.sheetId })} side={<SideToggle sheet={sheet} on={on} allies={allies} onSide={onSide} />} />
}

/** One roster, with a line saying so when nobody is in it. */
function RosterRows({ sheets, empty, ...picks }: RowsProps) {
  return (
    <ul className="roster spaced">
      {sheets.map((entry) => <RosterRow key={entry.sheet?.sheetId ?? entry.npc?.id} entry={entry} {...picks} />)}
      {sheets.length ? null : <li className="off">{empty}</li>}
    </ul>
  )
}

function SetupRosters({ characters, npcs, ...picks }: RostersProps) {
  return (
    <div>
      <span className="label">Characters</span>
      <RosterRows sheets={characters.map((sheet) => ({ sheet }))} empty="No characters in play." {...picks} />
      <span className="label block">NPCs</span>
      <RosterRows sheets={npcs} empty="No NPCs yet." {...picks} />
    </div>
  )
}

const allSheets = (characters: readonly CombatSheet[], npcs: SetupProps['npcs']) =>
  [...characters, ...npcs.flatMap(({ sheet }) => (sheet ? [sheet] : []))]

/** Who fights, and which of the picked NPCs are on the players' side; dropping an NPC drops its side too. */
function useSetupPicks() {
  const [selected, setSelected] = useState<CombatantSelection[]>([])
  const [allies, setAllies] = useState<string[]>([])
  const onToggle = (selection: CombatantSelection) => {
    const next = toggleCombatant(selected, selection)
    setSelected(next)
    setAllies((current) => current.filter((key) => next.some((entry) => combatantKey(entry) === key)))
  }
  const onSide = (key: string) => setAllies((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]))
  return { selected, allies, onToggle, onSide }
}

/** Moment 1: the GM picks who fights and what starts on the Floor. Every choice stays local until Start commits it. */
export function CombatSetup({ characters, npcs, items, onStart, onRepair }: SetupProps) {
  const setup = useSetupPicks()
  const { selected } = setup
  const [picks, setPicks] = useState<FloorSelection[]>([])
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const issues = useMemo(() => combatSetupProblems(selected, allSheets(characters, npcs)), [selected, characters, npcs])
  const floorWords = combatCountWords(setupFloorRows(picks, items)) || 'nothing'
  const start = async () => {
    setBusy(true)
    setRefusal(await onStart({ combatants: selected, floor: picks, allies: setup.allies }))
    setBusy(false)
  }
  return (
    <>
      <CombatHead round="Set up" stage="Before combat" />
      <div className="ct two">
        <div className="mid">
          <CombatWindow
            title="Set up combat"
            stepper={<CombatStepper steps={['Who fights', 'Floor', 'Start']} now={0} />}
            foot={<>
              <span className="note">{selected.length} in the fight · {floorWords} on the Floor</span>
              <button type="button" className="btn rust" onClick={() => void start()} disabled={busy || !selected.length || issues.length > 0}>Start Combat</button>
            </>}
          >
            {refusal ? <div className="notice hot" role="alert"><span><b>Combat did not start.</b> {refusal}</span></div> : null}
            <SetupIssues issues={issues} onRepair={onRepair} />
            <div className="two-col">
              <SetupRosters characters={characters} npcs={npcs} {...setup} />
              <SetupFloor picks={picks} items={items} onPicks={setPicks} />
            </div>
          </CombatWindow>
        </div>
        <div className="rail">
          <CombatPanel title="Turn order" sub="after initiative">
            <div className="pb"><p className="note">The turn order, declarations and Floor appear here and stay on screen once combat starts.</p></div>
          </CombatPanel>
        </div>
      </div>
    </>
  )
}
