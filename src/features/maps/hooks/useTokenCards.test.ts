// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { TokenRecord } from '../lib/types'
import { useTokenCards } from './useTokenCards'

const token = (id: string) => ({ id, name: id, party: false, group: '' }) as unknown as TokenRecord

describe('the selected tokens', () => {
  it('are held in the map\'s order for bulk edits, and in the order they were picked for a fight', () => {
    const tokens = [token('tommy'), token('rene'), token('wayne')]
    const { result } = renderHook(() => useTokenCards(tokens, ['rene', 'tommy'], vi.fn(), vi.fn()))
    expect(result.current.selectedTokens.map((t) => t.id)).toEqual(['tommy', 'rene'])
    expect(result.current.pickedTokens.map((t) => t.id)).toEqual(['rene', 'tommy'])
  })
})
