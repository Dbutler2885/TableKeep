import type { LubecLastRoll } from '../ruleSets/lubec/lastRoll'
import { isLubecDoubleRoll, type LubecCircleFace, type LubecCircleName } from './lubecCircles'
import { LubecMissing } from './LubecMissing'
import type { LubecCircles } from './useLubecCircles'
import type { LubecRoller } from './useLubecRoller'

// "32/65" side by side, or stacked for a 100, which is too wide for one line.
function LubecCheckPair({ roll, target }: { roll: number; target: number }) {
  return (
    <span className={roll === 100 ? 'check-stack' : 'check-pair'}>
      <span>{roll}</span><span aria-hidden="true">/</span><span>{target}</span>
    </span>
  )
}

function LubecCircleNumber({ face }: { face: LubecCircleFace }) {
  if (face.kind === 'missing') return <LubecMissing />
  if (face.kind === 'value') return <>{face.value}</>
  if (face.kind === 'rolling') return <LubecCheckPair roll={face.preview} target={face.target} />
  return <LubecCheckPair roll={face.roll.result} target={face.roll.target} />
}

// The prototype's circle states: a value, a skill armed, a spin, a success or failure, a double.
function faceClasses(face: LubecCircleFace): string[] {
  if (face.kind === 'missing') return []
  if (face.kind === 'rolling') return ['rolling']
  if (face.kind === 'result') return ['has-value', `check-${face.roll.outcome}`, ...(isLubecDoubleRoll(face.roll) ? ['check-double'] : [])]
  return ['has-value', ...(face.armed ? ['skill-armed'] : [])]
}

const circleClasses = (face: LubecCircleFace): string => ['roll-circle', ...faceClasses(face)].join(' ')

function resultLabel(name: string, roll: LubecLastRoll): string {
  const outcome = isLubecDoubleRoll(roll) ? `Critical ${roll.outcome}` : `${roll.outcome.charAt(0).toUpperCase()}${roll.outcome.slice(1)}`
  return `${name} rolled ${roll.result} against ${roll.target}. ${outcome}. Click to clear.`
}

/** What a circle is called in a result, and its label while it waits to be rolled or is a hole. */
export type LubecCircleLabels = { name: string; missing: string; value: (value: number) => string }

function circleLabel(labels: LubecCircleLabels, face: LubecCircleFace): string {
  if (face.kind === 'missing') return labels.missing
  if (face.kind === 'rolling') return `Rolling ${labels.name}`
  if (face.kind === 'result') return resultLabel(labels.name, face.roll)
  return labels.value(face.value)
}

// A hole cannot be rolled, and nothing is rolled while a roll spins.
const circleDisabled = (face: LubecCircleFace, roller: LubecRoller | null, circles: LubecCircles): boolean =>
  !roller || circles.spin !== null || face.kind === 'missing'

type CircleProps = {
  name: LubecCircleName
  labels: LubecCircleLabels
  face: LubecCircleFace
  roller: LubecRoller | null
  circles: LubecCircles
}

/** The prototype's roll circle: tapped to roll, it spins, then shows the result until it is tapped again. */
export function LubecRollCircle({ name, labels, face, roller, circles }: CircleProps) {
  return (
    <button
      type="button"
      className={circleClasses(face)}
      disabled={circleDisabled(face, roller, circles)}
      aria-label={circleLabel(labels, face)}
      title={face.kind === 'missing' ? 'missing value' : undefined}
      onClick={() => circles.click(name)}
    >
      <span className="number"><LubecCircleNumber face={face} /></span>
    </button>
  )
}
