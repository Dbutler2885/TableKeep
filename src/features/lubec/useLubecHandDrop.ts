import { useState } from 'react'
import type { LubecGear, LubecItem } from '../ruleSets/lubec/gear/gearRecord'
import type { LubecGearDrop } from './gear/lubecGearDrop'
import { lubecDroppedToast } from './gear/moveLabels'

// What a drop says once its transaction is done: the Gear page's toast, or why nothing changed.
async function dropSaying(onDrop: Exclude<LubecGearDrop, null>, item: LubecItem): Promise<string> {
  const r = await onDrop(item).catch(() => ({ ok: false as const, msg: `Could not drop ${item.name}. Nothing changed.` }))
  return r.ok ? lubecDroppedToast(item) : r.msg
}

/** A drop from a hand crosses to the GM's Items tab, so it waits on its transaction and then says what happened. */
export function useLubecHandDrop(gear: LubecGear, onDrop: LubecGearDrop) {
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState('')
  const run = async (dropper: Exclude<LubecGearDrop, null>, item: LubecItem) => {
    setBusy(true)
    setSaid(await dropSaying(dropper, item))
    setBusy(false)
  }
  const drop = onDrop && ((itemId: string) => {
    const item = gear.items.find((i) => i.id === itemId)
    if (item && !busy) void run(onDrop, item)
  })
  return { busy, said, drop }
}
