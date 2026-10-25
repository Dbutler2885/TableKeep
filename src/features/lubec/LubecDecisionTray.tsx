import type { LubecValueName } from '../ruleSets/lubec/sheet'
import { lubecSwapHint, type LubecSwapDraft } from './lubecRollUpCircles'
import type { LubecRollUpActions, LubecRollUpView } from './useLubecRollUp'

type ButtonsProps = { swap: LubecSwapDraft | null; canSwap: boolean; actions: LubecRollUpActions }

const KeepButton = ({ actions }: { actions: LubecRollUpActions }) =>
  <button type="button" className="secondary-button" onClick={actions.keep}>Keep these scores</button>

// Once the trade is shown, it is undone or confirmed.
function LubecReviewButtons({ actions }: { actions: LubecRollUpActions }) {
  return (
    <>
      <button type="button" className="secondary-button tray-icon lubec-swap-undo" aria-label="Undo swap" title="Undo swap" onClick={actions.undoSwap}>
        <span aria-hidden="true">&#8634;</span>
      </button>
      <button type="button" className="confirm-button tray-icon" aria-label="Confirm swap" title="Confirm swap" onClick={actions.confirmSwap}>
        <span aria-hidden="true">&#10003;</span>
      </button>
    </>
  )
}

// The tray's buttons in the prototype's order, each shown only at its step of the Swap.
function LubecTrayButtons({ swap, canSwap, actions }: ButtonsProps) {
  if (swap?.stage === 'review') return <LubecReviewButtons actions={actions} />
  const start = <button type="button" className="action-button" disabled={!canSwap} onClick={actions.startSwap}>Swap lowest stat</button>
  const cancel = <button type="button" className="secondary-button" onClick={actions.cancelSwap}>Cancel</button>
  return (
    <>
      {swap ? cancel : start}
      <KeepButton actions={actions} />
    </>
  )
}

/**
 * The prototype's decision tray under the Stats, once every value is rolled:
 * Swap the lowest Stat or keep the scores, then Cancel while the trade is
 * picked on the circles, and undo or confirm once it is shown traded.
 */
export function LubecDecisionTray({ view }: { view: LubecRollUpView }) {
  if (!view.actions || view.stage !== 'deciding' || view.spinning) return null
  return (
    <div className="decision-tray">
      {view.swap ? <span className="swap-hint">{lubecSwapHint(view.swap)}</span> : null}
      <LubecTrayButtons swap={view.swap} canSwap={view.canSwap} actions={view.actions} />
    </div>
  )
}

/** One value's roll-up circle: "Roll" until it is rolled, the spin, then its score with its dice or Swap state under it. */
export function LubecRollUpAbility({ name, view }: { name: LubecValueName; view: LubecRollUpView }) {
  const circle = view.circle(name)
  return (
    <div className="ability">
      <button
        type="button"
        className={['roll-circle', ...circle.classes].join(' ')}
        disabled={!circle.tappable}
        aria-label={circle.label}
        onClick={() => view.actions?.tap(name)}
      >
        <span className="number">{circle.number}</span>
      </button>
      <span className="ability-name">{name}</span>
      <span className={circle.swapNote ? 'base-note swap-note' : 'base-note'}>{circle.note}</span>
    </div>
  )
}
