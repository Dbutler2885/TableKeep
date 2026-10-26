import type { LubecItemKind, LubecItemSize } from '../../ruleSets/lubec/gear/gearRecord'
import { KIND_NAMES } from '../../ruleSets/lubec/gear/gearRules'
import { countNote, SIZE_HINT } from './gearLabels'
import { LUBEC_SHAPES, lubecPictureShape, type LubecShape } from './gearArt'
import { KIND_TILE } from './itemLabels'
import { lubecCountOf, lubecPictureShown, lubecWithSize, type LubecItemFields } from './itemForm'
import { LubecKindGlyph, LubecPicture } from './LubecGearArt'
import { KIND_IDS } from './stockEntries'

/** Every part of the form takes the fields and hands back the next ones. */
export type LubecFieldsProps = { fields: LubecItemFields; onFields: (fields: LubecItemFields) => void }

/** The kind is the big choice: five tiles, each with its icon and one line. */
export function LubecKindTiles({ fields, onKind }: { fields: LubecItemFields; onKind: (kind: LubecItemKind) => void }) {
  return (
    <fieldset className="field form-kinds">
      <legend className="label">What kind of item?</legend>
      <div className="kind-tiles">
        {KIND_IDS.map((kind) => (
          <label key={kind}>
            <input type="radio" name="kind" value={kind} checked={fields.kind === kind} onChange={() => onKind(kind)} />
            <span><i><LubecKindGlyph kind={kind} /></i><b>{KIND_NAMES[kind]}</b><small>{KIND_TILE[kind]}</small></span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

const SHAPE_IDS = Object.keys(LUBEC_SHAPES) as LubecShape[]

/** The picture: a stock drawing in its shape, with × to take it off and the three shapes to frame it in. Uploads come later. */
export function LubecPictureField({ fields, onFields }: LubecFieldsProps) {
  const pic = fields.picture
  const shown = lubecPictureShown(pic)
  const shape = shown ? lubecPictureShape(pic) : 'square'
  return (
    <div className="pic-field">
      <div className="pic-frame">
        <div className="pic-box">
          {shown ? <LubecPicture item={{ kind: fields.kind, art: pic.art, shape }} frame="pic-in" /> : <span className="pic-none" aria-hidden="true"><LubecKindGlyph kind={fields.kind} /></span>}
        </div>
        {shown ? <button type="button" className="pic-x" aria-label="Take the picture off" onClick={() => onFields({ ...fields, picture: null })}>×</button> : null}
      </div>
      <div className="shape-seg" role="radiogroup" aria-label="Picture shape">
        {SHAPE_IDS.map((s) => (
          <label key={s} className={s} title={LUBEC_SHAPES[s]}>
            <input type="radio" name="shape" value={s} aria-label={LUBEC_SHAPES[s]} disabled={!shown} checked={shape === s} onChange={() => onFields({ ...fields, picture: pic && { ...pic, shape: s } })} />
            <span><i /></span>
          </label>
        ))}
      </div>
      <div className="shape-name" aria-hidden="true">{shown ? LUBEC_SHAPES[shape] : 'No picture'}</div>
    </div>
  )
}

const SIZES: readonly LubecItemSize[] = [0, 1, 2, 4, 8]

/** Size is a small row with a one-line hint. */
export function LubecSizePick({ fields, onFields }: LubecFieldsProps) {
  return (
    <fieldset className="field size-pick">
      <legend className="label">Size in slots, per item</legend>
      <div className="seg-row">
        {SIZES.map((value) => (
          <label key={value}>
            <input type="radio" name="size" value={value} checked={fields.size === value} onChange={() => onFields(lubecWithSize(fields, value))} />
            <span>{value === 0 ? 'Small' : value}</span>
          </label>
        ))}
      </div>
      <p className="field-note" aria-live="polite">{SIZE_HINT[fields.size]}</p>
    </fieldset>
  )
}

/** The count, and how many fit in one slot; the line under it says what stacks they make. Armor and holders are always one. */
export function LubecCountPick({ fields, onFields }: LubecFieldsProps) {
  const { qty, per } = lubecCountOf(fields)
  const note = countNote(qty, per, fields.size)
  return (
    <div className="count-pick">
      <div className="count-row">
        <label className="field"><span className="label">How many in all</span><input type="number" min="0" max="999" inputMode="numeric" value={fields.qty} onChange={(e) => onFields({ ...fields, qty: e.target.value })} /></label>
        {fields.size > 0 ? (
          <label className="field">
            <span className="label">{fields.size > 1 ? `Fit in ${fields.size} slots` : 'Fit in one slot'}</span>
            <input type="number" min="1" max="999" inputMode="numeric" value={fields.per} onChange={(e) => onFields({ ...fields, per: e.target.value })} />
          </label>
        ) : null}
      </div>
      <p className={`field-note${note.warn ? ' warn' : ''}`} aria-live="polite">{note.text}</p>
    </div>
  )
}
