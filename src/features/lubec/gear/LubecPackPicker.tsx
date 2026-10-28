import { useState, type CSSProperties, type KeyboardEvent } from 'react'
import { LUBEC_BACKPACK_ARTS, type LubecBackpackArt } from './backpackArt'
import { CROPS, lubecPackLayout } from './backpackSlots'
import { useLubecBackpackUrl } from './useLubecBackpackUrl'

/** The picker's title, which names its dialog. */
const PICKER_TITLE = 'lubec-pack-picker-title'

// A thumbnail shows the part of the picture the Backpack panel shows on a desktop.
const THUMB_CROP = lubecPackLayout(CROPS.wide).style as CSSProperties

type ChoiceProps = { name: LubecBackpackArt; current: boolean; onPick: (name: LubecBackpackArt) => void }

// One pack: its thumbnail and its short name; the current one is ringed and has focus when the picker opens.
function PackChoice({ name, current, onPick }: ChoiceProps) {
  const url = useLubecBackpackUrl(name, true)
  const style = url ? { ...THUMB_CROP, backgroundImage: `url(${url})` } : THUMB_CROP
  return (
    <button type="button" className="pack-choice" aria-current={current || undefined} autoFocus={current} onClick={() => onPick(name)}>
      <span className="pack-thumb" style={style} aria-hidden="true" />
      <span className="pack-name">{name}</span>
    </button>
  )
}

type PickerProps = { current: LubecBackpackArt; onPick: (name: LubecBackpackArt) => void; onCancel: () => void }

/** The backpack pictures to choose from, in B's sheet over the page; a pick closes it, and Cancel or Escape closes it unchanged. */
function PackPicker({ current, onPick, onCancel }: PickerProps) {
  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
  }
  return (
    <div className="confirm-overlay lubec-gear-overlay" role="dialog" aria-modal="true" aria-labelledby={PICKER_TITLE} onKeyDown={closeOnEscape}>
      <div className="pack-picker">
        <div className="sheet-form">
          <header><div><div className="eyebrow">Backpack</div><h2 id={PICKER_TITLE}>Change pack</h2></div></header>
          <div className="pack-choices">
            {LUBEC_BACKPACK_ARTS.map((name) => <PackChoice key={name} name={name} current={name === current} onPick={onPick} />)}
          </div>
          <div className="actions"><button className="btn line" type="button" onClick={onCancel}>Cancel</button></div>
        </div>
      </div>
    </div>
  )
}

type ChangePackProps = { art: LubecBackpackArt; onPick: (name: LubecBackpackArt) => void }

/** The Backpack panel's "Change pack" button, and the picker it opens. */
export function LubecChangePack({ art, onPick }: ChangePackProps) {
  const [open, setOpen] = useState(false)
  const pick = (name: LubecBackpackArt) => {
    setOpen(false)
    onPick(name)
  }
  return (
    <>
      <button type="button" className="btn line small" onClick={() => setOpen(true)}>Change pack</button>
      {open ? <PackPicker current={art} onPick={pick} onCancel={() => setOpen(false)} /> : null}
    </>
  )
}
