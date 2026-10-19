// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import type { GroupRecord } from '../../types/app'
import { useRootRedirect } from './useRootRedirect'

const group = (id: string) => ({ id }) as GroupRecord

type Props = { groups: GroupRecord[]; loading: boolean }

function renderAt(path: string, initialProps: Props) {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  return renderHook(({ groups, loading }: Props) => {
    const location = useLocation()
    const navigate = useNavigate()
    useRootRedirect(groups, loading, location.pathname, navigate)
    return location.pathname
  }, { wrapper, initialProps })
}

afterEach(() => {
  cleanup()
})

describe('useRootRedirect', () => {
  it('waits for groups to load', () => {
    const { result, rerender } = renderAt('/', { groups: [group('g1')], loading: true })
    expect(result.current).toBe('/')

    rerender({ groups: [group('g1')], loading: false })
    expect(result.current).toBe('/groups/g1')
  })

  it('sends a member of one group to its home', () => {
    const { result } = renderAt('/', { groups: [group('g1')], loading: false })

    expect(result.current).toBe('/groups/g1')
  })

  it('sends everyone else to the picker', () => {
    expect(renderAt('/', { groups: [], loading: false }).result.current).toBe('/groups')
    cleanup()
    expect(renderAt('/', { groups: [group('g1'), group('g2')], loading: false }).result.current).toBe('/groups')
  })

  it('leaves any other path alone', () => {
    const { result } = renderAt('/groups/g2', { groups: [group('g1')], loading: false })

    expect(result.current).toBe('/groups/g2')
  })
})
