import { ChessPawn } from 'lucide-react'
import type { TokenNameDrafts } from '../hooks/useTokenCards'
import type { TokenRecord } from '../lib/types'

type TokenListRowProps = {
  token: TokenRecord
  index: number
  groupLabel: string
  selected: boolean
  names: TokenNameDrafts
  onToggle: (tokenId: string, shiftKey: boolean) => void
}

// A click on one of the row's own controls is not a click on the row.
function isRowControl(target: EventTarget | null) {
  return Boolean((target as HTMLElement | null)?.closest('button,input,select,textarea,a,label'))
}

function TokenRowIcon({ token }: { token: TokenRecord }) {
  return (
    <span className="token-row-icon" style={{ color: token.color }} aria-hidden>
      {token.tokenImageUrl ? (
        <img src={token.tokenImageUrl} alt="" className="token-row-image" />
      ) : (
        <ChessPawn size={14} />
      )}
    </span>
  )
}

// One token in the token list: click to select it, or rename it in place.
export function TokenListRow({ token, index, groupLabel, selected, names, onToggle }: TokenListRowProps) {
  return (
    <div
      className={selected ? 'token-row selected' : 'token-row'}
      onClick={(event) => {
        if (isRowControl(event.target)) return
        onToggle(token.id, event.shiftKey)
      }}
    >
      <div className="token-row-summary">
        <TokenRowIcon token={token} />
        <input
          type="text"
          className="token-row-label-input"
          value={names.draftFor(token)}
          onFocus={() => names.beginRename(token)}
          onChange={(event) => names.changeDraft(token.id, event.target.value)}
          onBlur={(event) => void names.commitRename(token, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
          aria-label={`${groupLabel} token ${index + 1} name`}
          placeholder={`${groupLabel} ${index + 1}`}
        />
      </div>
    </div>
  )
}
