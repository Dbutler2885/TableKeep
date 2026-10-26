import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { Role } from '../../../types/app'
import { boxSelectionIds, extendSelectionBox, type Point, type SelectionBox } from '../lib/tokenBoxSelection'
import type { TokenRecord } from '../lib/types'

type TokenBoxSelectionOptions = {
  role: Role | null
  tokenSelectionBox: SelectionBox | null
  setTokenSelectionBox: Dispatch<SetStateAction<SelectionBox | null>>
  setSelectedTokenIds: (ids: string[]) => void
  getTokenDropPoint: (clientX: number, clientY: number) => Point | null
  tokens: TokenRecord[]
  suppressNextMapClickRef: { current: boolean }
}

// While the GM drags a selection box, it follows the pointer anywhere on the page;
// letting go selects the tokens inside it and swallows the click that follows.
export function useTokenBoxSelection(options: TokenBoxSelectionOptions) {
  const { role, tokenSelectionBox, setTokenSelectionBox, setSelectedTokenIds, getTokenDropPoint, tokens, suppressNextMapClickRef } = options
  useEffect(() => {
    if (role !== 'gm' || !tokenSelectionBox) return

    const handleMove = (event: MouseEvent) => {
      const point = getTokenDropPoint(event.clientX, event.clientY)
      if (!point) return
      setTokenSelectionBox((current) => extendSelectionBox(current, point))
    }

    const handleUp = (event: MouseEvent) => {
      const point = getTokenDropPoint(event.clientX, event.clientY) ?? tokenSelectionBox.end
      setSelectedTokenIds(boxSelectionIds(tokens, tokenSelectionBox.start, point))
      setTokenSelectionBox(null)
      suppressNextMapClickRef.current = true
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [getTokenDropPoint, role, setSelectedTokenIds, setTokenSelectionBox, suppressNextMapClickRef, tokenSelectionBox, tokens])
}
