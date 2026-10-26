import { useState, type KeyboardEvent } from 'react'
import type { LubecCharacterSheet } from '../../ruleSets/lubec/characterRecord'
import { readLubecCheckRoll, type LubecCheckRoll } from '../../ruleSets/lubec/checkRoll'
import { lubecSheetModifiers } from '../../ruleSets/lubec/modifiers'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecStrengthStress, lubecStrengthTarget } from '../../ruleSets/lubec/gear/strengthCheck'
import { lubecCircleFace } from '../lubecCircles'
import { LubecNumber } from '../LubecMissing'
import { LubecRollCircle, type LubecCircleLabels } from '../LubecRollCircle'
import { LubecAdvantageSwitch } from '../LubecSkillStrip'
import { useLubecCircles, type LubecCircles } from '../useLubecCircles'
import { useLubecRoller, type LubecRolled, type LubecRoller } from '../useLubecRoller'
import { LUBEC_STRENGTH_EYEBROW, lubecStrengthText, lubecStrengthTitle } from './strengthLabels'

/** The Strength prompt's title, which names its dialog over the item sheet. */
const PROMPT_TITLE = 'lubec-strength-title'

type Heavy = Pick<LubecItem, 'name' | 'weight'>

type PromptProps = {
  /** The character's sheet, which the roll reads Strength from and is recorded on. */
  sheet: LubecCharacterSheet
  onRolled: LubecRolled
  thing: Heavy
  /** Before the roll: nothing is rolled and nothing changes. */
  onCancel: () => void
  /** After the roll: the add or move goes ahead with its result. */
  onDone: (outcome: LubecCheckRoll['outcome']) => void
}

// As the Core page labels a Strength circle the viewer may roll.
const LABELS: LubecCircleLabels = {
  name: 'Strength',
  missing: 'Roll Strength: missing value',
  value: (value) => `Roll Strength at or under ${value}`,
}

function PromptText({ sheet, thing }: Pick<PromptProps, 'sheet' | 'thing'>) {
  const [before, after] = lubecStrengthText(thing, lubecStrengthStress(sheet))
  return <p className="note prompt-text">{before}<LubecNumber value={lubecStrengthTarget(sheet)} />{after}</p>
}

type RollProps = { sheet: LubecCharacterSheet; roller: LubecRoller | null; circles: LubecCircles; rolled: boolean }

// The Core page's Strength circle and its Advantage switch; once rolled, the switch gives way to what the roll did.
function StrengthRoll({ sheet, roller, circles, rolled }: RollProps) {
  const state = { armed: null, result: circles.result('Strength'), spin: circles.spin }
  const face = lubecCircleFace({ sheet, name: 'Strength', modifiers: lubecSheetModifiers(sheet) }, state)
  return (
    <div className="strength-roll">
      <div className="ability">
        <LubecRollCircle name="Strength" labels={LABELS} face={face} roller={roller} circles={circles} />
        <span className="ability-name">Strength</span>
      </div>
      <div className="strength-roll-side">
        {rolled || !roller ? null : <LubecAdvantageSwitch roller={roller} spin={circles.spin} />}
        <p className="status" role="status" aria-live="polite">{rolled ? circles.status : 'Tap the circle to roll.'}</p>
      </div>
    </div>
  )
}

type ButtonsProps = { rolled: LubecCheckRoll | null; spinning: boolean } & Pick<PromptProps, 'onCancel' | 'onDone'>

// Before the roll only Cancel; after it only Done, so the roll stands. Done waits for the spin to land.
function PromptButtons({ rolled, spinning, onCancel, onDone }: ButtonsProps) {
  if (!rolled) return <div className="actions"><button className="btn line" type="button" onClick={onCancel}>Cancel</button></div>
  return <div className="actions"><button className="btn" type="button" disabled={spinning} onClick={() => onDone(rolled.outcome)}>Done</button></div>
}

/** The roll this prompt made, kept apart from any earlier last roll, and the roller that makes it, until it has. */
function useStrengthRoll(sheet: LubecCharacterSheet, onRolled: LubecRolled) {
  const [rolled, setRolled] = useState<LubecCheckRoll | null>(null)
  const roller = useLubecRoller(sheet, (next) => {
    setRolled(readLubecCheckRoll(next.lastRoll))
    onRolled(next)
  })
  // The circle shows only this prompt's roll, and takes no second one.
  const circles = useLubecCircles({ ...sheet, lastRoll: rolled }, rolled ? null : roller)
  return { rolled, roller: rolled ? null : roller, circles }
}

/**
 * The Strength check for a heavy thing coming onto you (Rule E5, spec 5.5),
 * in B's prompt look: the Core roller rolls it on the Core page's own Strength
 * circle, recording it as the character's last roll with the Stress a failed
 * Strength check adds. Cancel before the roll changes nothing; after it, Done
 * is the only way out.
 */
export function LubecStrengthPrompt({ sheet, onRolled, thing, onCancel, onDone }: PromptProps) {
  const { rolled, roller, circles } = useStrengthRoll(sheet, onRolled)
  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !rolled) onCancel()
  }
  return (
    <div className="confirm-overlay lubec-gear-overlay" role="dialog" aria-modal="true" aria-labelledby={PROMPT_TITLE} onKeyDown={closeOnEscape}>
      <div className="prompt-sheet">
        <div className="sheet-form">
          <header>
            <div><div className="eyebrow">{LUBEC_STRENGTH_EYEBROW}</div><h2 id={PROMPT_TITLE}>{lubecStrengthTitle(thing)}</h2></div>
            {rolled ? null : <button className="close" type="button" aria-label="Close" onClick={onCancel}>×</button>}
          </header>
          <PromptText sheet={sheet} thing={thing} />
          <StrengthRoll sheet={sheet} roller={roller} circles={circles} rolled={rolled !== null} />
          <PromptButtons rolled={rolled} spinning={circles.spin !== null} onCancel={onCancel} onDone={onDone} />
        </div>
      </div>
    </div>
  )
}
