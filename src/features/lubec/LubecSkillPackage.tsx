import { lubecClass } from '../ruleSets/lubec/classes'
import type { LubecSheet } from '../ruleSets/lubec/sheet'
import { LUBEC_PACKAGE_RULES, lubecPackageTarget, lubecPickCounts, lubecShapeLabel, lubecSkillWarningCodes } from './lubecSkillTree'

type FreeChipsProps = { list: readonly string[]; free: string | null; onFreeChip: (name: string) => void }

function LubecFreeChips({ list, free, onFreeChip }: FreeChipsProps) {
  return (
    <span className="free-choices" role="group" aria-label="Free class skill">
      {list.map((name) => (
        <button key={name} type="button" className="free-chip" aria-pressed={name === free} onClick={() => onFreeChip(name)}>
          {name}
        </button>
      ))}
    </span>
  )
}

/**
 * The prototype's class skill package panel, for choosing skills: the free
 * class skill with a chip for each skill on the class's free list, the
 * package's rule, each ticked once its Finalize warning clears, and the picks
 * counted against the package. Nothing while the class is a hole.
 */
export function LubecSkillPackage({ sheet, onFreeChip }: { sheet: LubecSheet; onFreeChip: (name: string) => void }) {
  const definition = lubecClass(sheet.class.key)
  if (!definition) return null
  const codes = lubecSkillWarningCodes(sheet)
  const free = sheet.skills.free
  return (
    <div className="skill-package">
      <ul className="package-rules">
        <li className={codes.has('free-skill') ? undefined : 'done'}>
          <span>
            <strong>Free class skill:</strong> {free ?? 'choose one'}
            <LubecFreeChips list={definition.skillPackage.free} free={free} onFreeChip={onFreeChip} />
          </span>
        </li>
        <li className={codes.has('package') ? undefined : 'done'}>
          <span><strong>Bonus:</strong> {LUBEC_PACKAGE_RULES[definition.key]}</span>
        </li>
      </ul>
      <div className="package-count">
        Picks made<strong>{lubecShapeLabel(lubecPickCounts(sheet.skills)) || 'Nothing yet'}</strong>of {lubecPackageTarget(definition)}
      </div>
    </div>
  )
}
