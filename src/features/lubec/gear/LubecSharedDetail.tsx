import { useState } from 'react'
import { lubecCarrierGear } from '../../ruleSets/lubec/gear/containers'
import type { LubecSharedCarrier } from '../../ruleSets/lubec/gear/sharedCarrier'
import { lubecCarrierDraftOf, lubecCarrierFormOfRecord, type LubecCarrierForm } from './carrierForm'
import { LubecCarrierDetail } from './LubecCarrierDetail'
import { LubecCarrierChangeDialog } from './LubecCarrierDialog'
import type { LubecGearAdd } from './LubecGearPack'
import { LubecPrompt } from './LubecLoadPrompts'
import type { LubecSharedActs, LubecSharedSeat } from './lubecSharedSeat'
import { lubecSharedDeletedToast, lubecSharedDeleteText } from './sharedCarrierLabels'

type ManageProps = { carrier: LubecSharedCarrier; acts: LubecSharedActs; toast: (text: string) => void }

type DeletePromptProps = ManageProps & { onClose: () => void }

// The carrier's things go to the GM, so a delete with things inside asks first.
function DeletePrompt({ carrier, acts, toast, onClose }: DeletePromptProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remove = async () => {
    setBusy(true)
    const failed = await acts.remove(carrier).then(() => false, () => true)
    setBusy(false)
    if (failed) return setError(`Could not delete ${carrier.name}. Nothing changed.`)
    onClose()
    toast(lubecSharedDeletedToast(carrier))
  }
  return (
    <LubecPrompt
      eyebrow="Shared carrier" title={`Delete ${carrier.name}?`} text={lubecSharedDeleteText(carrier)} error={error} onClose={onClose}
      buttons={[
        { label: 'Cancel', cls: 'line', onPress: onClose },
        { label: busy ? 'Moving...' : 'Delete it', cls: 'dispensation', disabled: busy, onPress: () => void remove() },
      ]}
    />
  )
}

// A carrier with nothing in it has nothing to lose, so it goes at once.
function useDeleteCarrier({ carrier, acts, toast }: ManageProps) {
  const [asking, setAsking] = useState(false)
  const onDelete = () => {
    if (carrier.items.length) return setAsking(true)
    acts.remove(carrier).then(() => toast(lubecSharedDeletedToast(carrier)), () => toast(`Could not delete ${carrier.name}. Nothing changed.`))
  }
  return { asking, onDelete, close: () => setAsking(false) }
}

/** What the carrier's owner and the GM may do to it: change its name and pockets, or delete it. */
function ManageCarrier(props: ManageProps) {
  const { carrier, acts, toast } = props
  const [changing, setChanging] = useState(false)
  const { asking, onDelete, close } = useDeleteCarrier(props)
  const onSave = async (form: LubecCarrierForm) => {
    const r = await acts.change(carrier.id, lubecCarrierDraftOf(form))
    if (!r.ok) return r.msg
    setChanging(false)
    return null
  }
  return (
    <div className="detail-acts">
      <button type="button" className="btn line small" onClick={() => setChanging(true)}>Change it</button>
      <button type="button" className="btn line small" onClick={onDelete}>Delete it</button>
      {changing ? <LubecCarrierChangeDialog start={lubecCarrierFormOfRecord(carrier)} onSave={onSave} onClose={() => setChanging(false)} toast={toast} /> : null}
      {asking ? <DeletePrompt {...props} onClose={close} /> : null}
    </div>
  )
}

type DetailProps = {
  carrier: LubecSharedCarrier
  seat: LubecSharedSeat
  onBack: () => void
  onAdd: LubecGearAdd
  onOpenItem: ((itemId: string) => void) | null
  toast: (text: string) => void
}

/** A shared carrier's detail: B's carrier detail over the carrier's own record, without the red box, since it is on nobody's body. */
export function LubecSharedDetail({ carrier, seat, onBack, onAdd, onOpenItem, toast }: DetailProps) {
  const manage = seat.acts && seat.mayChange(carrier) ? <ManageCarrier carrier={carrier} acts={seat.acts} toast={toast} /> : null
  return (
    <LubecCarrierDetail
      gear={lubecCarrierGear(carrier)} carrier={carrier} owner={seat.ownerOf(carrier)} onBack={onBack} onCarry={null}
      onAdd={onAdd} onOpenItem={onOpenItem} manage={manage} shared
    />
  )
}
