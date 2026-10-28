// What happens to a deleted character's things (settled rule 7, which
// replaces "they go with the character"): none is lost. Each becomes a
// dropped item in the GM's Items tab, named for the character, with where it
// was, exactly as if it had been dropped. Pure: the gear in, the dropped items
// out. The transaction that writes them and deletes the character is
// `lubecDeleteCharacterDroppingGear`.

import { lubecDroppedGmItem, type LubecDropper } from './containers'
import { lubecDropPlan } from './drop'
import type { LubecGear } from './gearRecord'
import type { LubecGmItem } from './gmItem'

/** Every thing in `gear`, on you or in a personal carrier, as the dropped item it becomes when its character is deleted. */
export const lubecDroppedOnDelete = (gear: LubecGear, by: LubecDropper): LubecGmItem[] =>
  gear.items.flatMap((item) => {
    // Each is planned on its own, so the plan finds it by its id alone.
    const plan = lubecDropPlan({ ...gear, items: [item] }, item.id)
    return plan ? [lubecDroppedGmItem(plan.item, plan.droppedFrom, by)] : []
  })
