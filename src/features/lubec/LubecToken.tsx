import { useState } from 'react'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import { TokenPawnPreview, type TokenIconConfig } from '../tokens/TokenIconEditor'
import { TokenPickerModal } from '../tokens/TokenPickerModal'
import type { LubecSheetEditing } from './LubecNameBandEditor'
import { lubecCharacterName } from './lubecNames'

// The size the pawn or image is drawn at; the round frame's CSS shrinks it to fit a narrower frame.
const LUBEC_TOKEN_FACE_SIZE = 40

// The token as the map draws it: the pawn in its colour, or the uploaded image once its URL is resolved.
function LubecTokenFace({ tokenIcon }: { tokenIcon: TokenIconConfig }) {
  const imageUrl = tokenIcon.icon === 'custom' ? tokenIcon.customImageUrl : undefined
  return <TokenPawnPreview color={tokenIcon.color} size={LUBEC_TOKEN_FACE_SIZE} imageUrl={imageUrl} />
}

type TokenProps = {
  character: LubecCharacterRecord
  /** The viewer's edits, or null when they may only look. */
  editing: LubecSheetEditing | null
}

/**
 * The character's map token beside the portrait. The owner and the GM tap it
 * to change it in the token picker the OSE and VtM sheets use; anyone else only sees it.
 */
export function LubecToken({ character, editing }: TokenProps) {
  const [picking, setPicking] = useState(false)
  if (!editing) {
    return (
      <div className="lubec-token" role="img" aria-label={`${lubecCharacterName(character)} map token`}>
        <LubecTokenFace tokenIcon={character.tokenIcon} />
      </div>
    )
  }
  return (
    <>
      <button type="button" className="lubec-token" aria-label="Edit map token" onClick={() => setPicking(true)}>
        <LubecTokenFace tokenIcon={character.tokenIcon} />
      </button>
      <TokenPickerModal
        open={picking}
        value={character.tokenIcon}
        onUploadImage={editing.uploadToken}
        onConfirm={(tokenIcon) => {
          editing.update({ tokenIcon })
          setPicking(false)
        }}
        onCancel={() => setPicking(false)}
      />
    </>
  )
}
