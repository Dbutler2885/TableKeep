// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { Campaign } from '../../../types/app'
import { useCampaignCombatErrors } from './combatErrors'

afterEach(cleanup)

it('keeps fight errors dismissible and scoped to their campaign', () => {
  const view = renderHook(({ campaign }: { campaign: Pick<Campaign, 'groupId' | 'id'> | null }) => useCampaignCombatErrors(campaign), { initialProps: { campaign: { groupId: 'g', id: 'one' } } })
  act(() => view.result.current.report('Waiting for wounds to reach the sheet'))
  expect(view.result.current.message).toBe('Waiting for wounds to reach the sheet')
  view.rerender({ campaign: { groupId: 'g', id: 'two' } })
  expect(view.result.current.message).toBeNull()
  act(() => view.result.current.report('Could not follow the fight.'))
  expect(view.result.current.message).toBe('Could not follow the fight.')
  view.rerender({ campaign: null })
  expect(view.result.current.message).toBeNull()
  view.rerender({ campaign: { groupId: 'g', id: 'two' } })
  expect(view.result.current.message).toBe('Could not follow the fight.')
  act(() => view.result.current.dismiss())
  expect(view.result.current.message).toBeNull()
})
