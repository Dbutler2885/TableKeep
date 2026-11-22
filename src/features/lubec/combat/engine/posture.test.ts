import { describe, expect, it } from 'vitest'
import { postureAllowsAttack, postureRefusal } from './posture'

describe('who may attack whom by posture', () => {
  it('lets standing attack anyone, and keeps prone from attacking anyone yet', () => {
    expect(postureAllowsAttack('standing', 'standing')).toBe(true)
    expect(postureAllowsAttack('standing', 'prone')).toBe(true)
    expect(postureAllowsAttack('prone', 'standing')).toBe(false)
    expect(postureAllowsAttack('prone', 'prone')).toBe(false)
  })

  it('says why, naming both fighters', () => {
    expect(postureRefusal({ name: 'Roy', posture: 'standing' }, { name: 'Dot', posture: 'prone' })).toBeNull()
    expect(postureRefusal({ name: 'Roy', posture: 'prone' }, { name: 'Dot', posture: 'standing' })).toBe('Roy is on the ground and cannot attack Dot, who is standing.')
    expect(postureRefusal({ name: 'Roy', posture: 'prone' }, { name: 'Dot', posture: 'prone' })).toBe('Roy and Dot are both on the ground: attacks on the ground wait for the grappling rules.')
  })
})
