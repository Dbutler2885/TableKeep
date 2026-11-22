import { useEffect, useRef } from 'react'
import type { CampaignScope } from '../../campaign/firestorePaths'
import type { LubecLiveFight } from './combatWatch'
import type { Combatant } from './engine/types'
import { useLubecCombatSend } from './useLubecCombatSend'
import { attackCommands, type AttackCommands } from './tab/attackCommands'
import { DeclarationReview } from './tab/DeclarationReview'
import '../fight/lubecFight.css'
import './tab/lubecCombat.css'
import './declarationReviewModal.css'

type DialogProps = { live: LubecLiveFight; declarer: Combatant; commands: AttackCommands }

/** A native modal keeps focus inside and leaves the GM's current page mounted underneath. */
function ReviewDialog({ live, declarer, commands }: DialogProps) {
  const panel = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    const dialog = panel.current!
    dialog.showModal()
    return () => {
      dialog.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])
  return (
    <dialog ref={panel} className="declaration-review-modal" aria-label="Review declaration" onCancel={(event) => { event.preventDefault(); event.stopPropagation() }} onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation() }}>
      <div className="lubec-combat">
        <DeclarationReview state={live.fight.state} declarer={declarer} gm commands={commands} />
      </div>
    </dialog>
  )
}

type Props = { scope: CampaignScope; live: LubecLiveFight; userId: string }

/** Mounted by the GM's workspace, so a declaration interrupts whichever campaign page is open. */
export function DeclarationReviewModal({ scope, live, userId }: Props) {
  const send = useLubecCombatSend(userId)
  const { state } = live.fight
  const request = state.pendingActions?.find((action) => action.action === 'reviewDeclaration')
  const declarer = state.combatants.find((entry) => entry.key === request?.combatantKey)
  if (state.phase !== 'declare' || !declarer?.proposedDeclaration || declarer.outReason !== null) return null
  return <ReviewDialog key={state.stageInstanceId} live={live} declarer={declarer} commands={attackCommands(scope, live, send)} />
}
