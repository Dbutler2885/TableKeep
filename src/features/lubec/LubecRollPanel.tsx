import {
  LUBEC_ADVANTAGE_MODES,
  describeLubecCheckDice,
  describeLubecCheckOutcome,
  describeLubecCheckRoll,
  isLubecCritical,
  lubecAdvantageName,
  lubecRollSkills,
  readLubecCheckRoll,
} from '../ruleSets/lubec/checkRoll'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import type { LubecRoller } from './useLubecRoller'

function LubecAdvantageSwitch({ roller }: { roller: LubecRoller }) {
  return (
    <div className="lubec-roll-switch" role="group" aria-label="Advantage">
      {LUBEC_ADVANTAGE_MODES.map((mode) => (
        <button key={mode} type="button" aria-pressed={roller.advantage === mode} onClick={() => roller.setAdvantage(mode)}>
          {lubecAdvantageName(mode)}
        </button>
      ))}
    </div>
  )
}

const COMBAT_ONLY = 'Fighting and shooting skills count only in the combat roller'

function LubecArmSkills({ sheet, roller }: { sheet: LubecCharacterSheet; roller: LubecRoller }) {
  const skills = lubecRollSkills(sheet)
  if (skills.length === 0) return null
  const armed = skills.find((skill) => skill.name === roller.armed)
  return (
    <>
      <div className="lubec-roll-skills" role="group" aria-label="Arm a skill">
        {skills.map((skill) => (
          <button
            key={skill.name}
            type="button"
            aria-pressed={roller.armed === skill.name}
            disabled={!skill.armable}
            title={skill.armable ? undefined : COMBAT_ONLY}
            onClick={() => roller.toggleArmed(skill.name)}
          >
            {skill.name} <b>+{skill.bonus}</b>
          </button>
        ))}
      </div>
      <p className="lubec-roll-hint">
        {armed ? `+${armed.bonus} ${armed.name} applies to your next roll.` : 'Tap a skill, then a Stat or Save to roll.'}
      </p>
    </>
  )
}

function LubecLastRollText({ sheet }: { sheet: LubecCharacterSheet }) {
  const roll = readLubecCheckRoll(sheet.lastRoll)
  if (!roll) return <span className="lubec-roll-none">No roll yet.</span>
  return (
    <>
      <span className="lubec-last-roll-what">{describeLubecCheckRoll(roll)}</span>
      <span className="lubec-last-roll-dice">{describeLubecCheckDice(roll)}</span>
      <strong className={isLubecCritical(roll) ? 'lubec-last-roll-outcome critical' : 'lubec-last-roll-outcome'}>
        {describeLubecCheckOutcome(roll)}
      </strong>
    </>
  )
}

// One live region that stays in place, so a screen reader hears each new roll.
function LubecLastRoll({ sheet }: { sheet: LubecCharacterSheet }) {
  const outcome = readLubecCheckRoll(sheet.lastRoll)?.outcome ?? 'none'
  return (
    <div className={`lubec-last-roll ${outcome}`} role="status" aria-label="Last roll">
      <LubecLastRollText sheet={sheet} />
    </div>
  )
}

/** The Advantage switch and the skills to arm for a viewer who may roll, and the last roll for anyone. */
export function LubecRollPanel({ sheet, roller }: { sheet: LubecCharacterSheet; roller: LubecRoller | null }) {
  return (
    <section className="lubec-panel blue lubec-roll" aria-labelledby="lubec-panel-roll">
      <div className="lubec-section-head"><h3 id="lubec-panel-roll">Roll</h3></div>
      {roller ? <LubecAdvantageSwitch roller={roller} /> : null}
      {roller ? <LubecArmSkills sheet={sheet} roller={roller} /> : null}
      <LubecLastRoll sheet={sheet} />
    </section>
  )
}
