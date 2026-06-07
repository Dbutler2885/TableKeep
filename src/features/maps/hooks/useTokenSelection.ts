import { useEffect, useState } from 'react'
import type { Role } from '../../../types/app'
import type { TokenRecord } from '../lib/types'

type UseTokenSelectionOptions = {
  role: Role | null
  tokens: TokenRecord[]
  selectedMapId: string
}

export function useTokenSelection({ role, tokens, selectedMapId }: UseTokenSelectionOptions) {
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([])
  const [playerSelectedTokenIds, setPlayerSelectedTokenIds] = useState<string[]>([])
  const [tokenSelectionBox, setTokenSelectionBox] = useState<{
    start: { x: number; y: number }
    end: { x: number; y: number }
  } | null>(null)

  useEffect(() => {
    setSelectedTokenIds((current) => current.filter((id) => tokens.some((token) => token.id === id)))
    setPlayerSelectedTokenIds((current) => current.filter((id) => tokens.some((token) => token.id === id)))
  }, [tokens])

  useEffect(() => {
    setSelectedTokenIds([])
    setPlayerSelectedTokenIds([])
    setTokenSelectionBox(null)
  }, [selectedMapId])

  const togglePlayerTokenSelection = (tokenId: string) => {
    if (role === 'gm') return
    setPlayerSelectedTokenIds((current) => (current.includes(tokenId) ? current.filter((id) => id !== tokenId) : [tokenId]))
  }

  return {
    selectedTokenIds,
    setSelectedTokenIds,
    playerSelectedTokenIds,
    setPlayerSelectedTokenIds,
    tokenSelectionBox,
    setTokenSelectionBox,
    togglePlayerTokenSelection,
  }
}
