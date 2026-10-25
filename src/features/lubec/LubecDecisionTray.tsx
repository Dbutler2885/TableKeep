import type { LubecValueName } from '../ruleSets/lubec/sheet'
import { LubecInk } from './LubecInk'
import { lubecSwapHint, type LubecSwapDraft } from './lubecRollUpCircles'
import { useLubecGenerateTimers, type LubecRollUpActions, type LubecRollUpView } from './useLubecRollUp'

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

/** Rolling every value left at once, beside rolling each from its own circle; shut once none is left. */
function LubecRollAllTray({ actions, disabled }: { actions: LubecRollUpActions; disabled: boolean }) {
  return (
    <div className="decision-tray">
      <button type="button" className="action-button" disabled={disabled} onClick={actions.rollAll}>Roll all remaining</button>
    </div>
  )
}

/**
 * The prototype's decision tray under the Stats: while values are left to
 * roll, a button that rolls them all at once, kept shut in place while the
 * last dice spin; once they land, Swap the lowest Stat or keep the scores,
 * then Cancel while the trade is picked on the circles, and undo or confirm
 * once it is shown traded.
 */
export function LubecDecisionTray({ view }: { view: LubecRollUpView }) {
  if (!view.actions || view.stage === 'settled') return null
  if (view.stage === 'rolling' || view.spinning) return <LubecRollAllTray actions={view.actions} disabled={view.stage !== 'rolling'} />
  return (
    <div className="decision-tray">
      {view.swap ? <span className="swap-hint">{lubecSwapHint(view.swap)}</span> : null}
      <LubecTrayButtons swap={view.swap} canSwap={view.canSwap} actions={view.actions} />
    </div>
  )
}

/** One value's roll-up circle: "Roll" until it is rolled, the spin, then its score with its dice or Swap state under it. */
export function LubecRollUpAbility({ name, view }: { name: LubecValueName; view: LubecRollUpView }) {
  useLubecGenerateTimers(view.spinner, name)
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
        <span className="number"><LubecInk text={circle.number} /></span>
      </button>
      <span className="ability-name">{name}</span>
      <span className={circle.swapNote ? 'base-note swap-note' : 'base-note'}>{circle.note}</span>
    </div>
  )
}
