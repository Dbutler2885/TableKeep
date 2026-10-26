/** The id of the item sheet's title, which names the dialog in every mode. */
export const LUBEC_SHEET_TITLE = 'lubec-gear-sheet-title'

type HeadProps = { eyebrow: string; title: string; onClose: () => void }

/** The item sheet's head in every mode: the eyebrow, the title and the close button, over B's double rule. */
export function LubecSheetHead({ eyebrow, title, onClose }: HeadProps) {
  return (
    <header>
      <div><div className="eyebrow">{eyebrow}</div><h2 id={LUBEC_SHEET_TITLE}>{title}</h2></div>
      <button className="close" type="button" aria-label="Close" onClick={onClose}>×</button>
    </header>
  )
}
