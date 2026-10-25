import { useState } from 'react'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { lubecSwapSources, lubecSwapTargets, type LubecSwap } from '../ruleSets/lubec/guidedRollUp'
import type { LubecStat } from '../ruleSets/lubec/sheet'

type Scores = Pick<LubecCharacterSheet, 'base'>

/** The Swap as the player is making it: which lowest Stat moves, then what it trades with; nothing is stored until it is confirmed. */
type SwapPick = { lowest: LubecStat | null; other: LubecStat | null }

type StatChoiceProps = { prompt: string; stats: readonly LubecStat[]; sheet: Scores; onPick: (stat: LubecStat) => void; onCancel: () => void }

function LubecStatChoice({ prompt, stats, sheet, onPick, onCancel }: StatChoiceProps) {
  return (
    <div className="lubec-swap-step">
      <p>{prompt}</p>
      <div className="lubec-swap-actions">
        {stats.map((stat) => (
          <button key={stat} type="button" className="lubec-swap-stat" onClick={() => onPick(stat)}>
            {stat} {sheet.base[stat]}
          </button>
        ))}
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

type ReviewProps = { swap: LubecSwap; sheet: Scores; onConfirm: () => void; onUndo: () => void }

function LubecSwapReview({ swap, sheet, onConfirm, onUndo }: ReviewProps) {
  return (
    <div className="lubec-swap-step">
      <p>
        {swap.lowest} becomes {sheet.base[swap.other]} and {swap.other} becomes {sheet.base[swap.lowest]}.
        Once confirmed, this cannot be undone.
      </p>
      <div className="lubec-swap-actions">
        <button type="button" className="lubec-swap-confirm" onClick={onConfirm}>Confirm Swap</button>
        <button type="button" onClick={onUndo}>Undo</button>
      </div>
    </div>
  )
}

type StartProps = { canSwap: boolean; onSwap: () => void; onKeep: () => void }

function LubecSwapStart({ canSwap, onSwap, onKeep }: StartProps) {
  return (
    <div className="lubec-swap-actions">
      <button type="button" className="lubec-swap-keep" onClick={onKeep}>Keep scores</button>
      <button type="button" disabled={!canSwap} onClick={onSwap}>Swap lowest Stat</button>
    </div>
  )
}

type TrayProps = { sheet: Scores; onSwap: (swap: LubecSwap) => void; onKeep: () => void }

/**
 * Keep the rolled scores, or Swap the lowest Stat's score with any Stat but
 * the highest. A tie for lowest lets the player pick which one moves.
 */
export function LubecSwapTray({ sheet, onSwap, onKeep }: TrayProps) {
  const [pick, setPick] = useState<SwapPick | null>(null)
  const sources = lubecSwapSources(sheet)
  const cancel = () => setPick(null)
  if (pick === null) {
    const start = () => setPick({ lowest: sources.length === 1 ? sources[0] : null, other: null })
    return <LubecSwapStart canSwap={sources.some((stat) => lubecSwapTargets(sheet, stat).length > 0)} onSwap={start} onKeep={onKeep} />
  }
  if (pick.lowest === null) {
    const prompt = 'Tied for lowest: which one moves?'
    return <LubecStatChoice prompt={prompt} stats={sources} sheet={sheet} onPick={(lowest) => setPick({ lowest, other: null })} onCancel={cancel} />
  }
  const lowest = pick.lowest
  if (pick.other === null) {
    const prompt = `Trade ${lowest} ${sheet.base[lowest]} with which Stat? Your highest cannot move.`
    const targets = lubecSwapTargets(sheet, lowest)
    return <LubecStatChoice prompt={prompt} stats={targets} sheet={sheet} onPick={(other) => setPick({ lowest, other })} onCancel={cancel} />
  }
  const swap = { lowest, other: pick.other }
  return <LubecSwapReview swap={swap} sheet={sheet} onConfirm={() => onSwap(swap)} onUndo={() => setPick({ lowest, other: null })} />
}
