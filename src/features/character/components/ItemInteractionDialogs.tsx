import type { Dispatch, SetStateAction } from 'react'
import type { useSelectedCharacterDerivations } from '../hooks/useSelectedCharacterDerivations'
import type { useInventoryDomain } from '../hooks/useInventoryDomain'
import { ConfirmModal } from '../../common/ConfirmModal'
import { DropItemDialog } from './DropItemDialog'
import { SellItemDialog } from './SellItemDialog'

type Props = {
  derivations: ReturnType<typeof useSelectedCharacterDerivations>
  inventoryDomain: ReturnType<typeof useInventoryDomain>
  goldSpendConfirmAmount: number | null
  setGoldSpendConfirmAmount: Dispatch<SetStateAction<number | null>>
  dropConfirmItemId: string | null
  setDropConfirmItemId: Dispatch<SetStateAction<string | null>>
  sellConfirmItemId: string | null
  setSellConfirmItemId: Dispatch<SetStateAction<string | null>>
  stackActionQty: string
  setStackActionQty: Dispatch<SetStateAction<string>>
  cantFireMessage: string | null
  setCantFireMessage: Dispatch<SetStateAction<string | null>>
  cantLightOpen: boolean
  setCantLightOpen: Dispatch<SetStateAction<boolean>>
}

export function ItemInteractionDialogs(props: Props) {
  const { selectedGoldTotal, selectedInventory } = props.derivations
  const { spendGold, dropItem, sellItem } = props.inventoryDomain
  return (
    <>
      <ConfirmModal
        open={props.goldSpendConfirmAmount !== null}
        title="Spend gold?"
        message={`Spend ${props.goldSpendConfirmAmount ?? 0} gp? You will have ${Math.max(0, selectedGoldTotal - (props.goldSpendConfirmAmount ?? 0))} gp remaining.`}
        confirmLabel="Spend"
        onConfirm={() => {
          if (props.goldSpendConfirmAmount !== null) spendGold(props.goldSpendConfirmAmount)
          props.setGoldSpendConfirmAmount(null)
        }}
        onCancel={() => props.setGoldSpendConfirmAmount(null)}
      />
      <DropItemDialog
        item={props.dropConfirmItemId ? selectedInventory.find((item) => item.id === props.dropConfirmItemId) ?? null : null}
        quantity={props.stackActionQty}
        onQuantityChange={props.setStackActionQty}
        onClose={() => props.setDropConfirmItemId(null)}
        onDrop={(quantity) => {
          if (props.dropConfirmItemId) void dropItem(props.dropConfirmItemId, quantity)
        }}
      />
      <SellItemDialog
        item={props.sellConfirmItemId ? selectedInventory.find((item) => item.id === props.sellConfirmItemId) ?? null : null}
        quantity={props.stackActionQty}
        onQuantityChange={props.setStackActionQty}
        onClose={() => props.setSellConfirmItemId(null)}
        onSell={(quantity) => {
          if (props.sellConfirmItemId) void sellItem(props.sellConfirmItemId, quantity)
        }}
      />
      <ConfirmModal
        open={props.cantFireMessage !== null}
        title="Can't Fire"
        message={props.cantFireMessage ?? ''}
        confirmLabel="OK"
        onConfirm={() => props.setCantFireMessage(null)}
        onCancel={() => props.setCantFireMessage(null)}
      />
      <ConfirmModal
        open={props.cantLightOpen}
        title="Can't Light"
        message={"To light this, you need it equipped and a fire source \u2014 an equipped tinderbox, or a lit torch or lantern (yours or another party member's)."}
        confirmLabel="OK"
        onConfirm={() => props.setCantLightOpen(false)}
        onCancel={() => props.setCantLightOpen(false)}
      />
    </>
  )
}
