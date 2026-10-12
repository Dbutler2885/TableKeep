import { describe, expect, it } from 'vitest'
import { discordRequestErrorMessage, discordReturnMessage } from './discordConnectionMessages'
import { readDiscordOutcome } from './discordReturnOutcome'

describe('readDiscordOutcome', () => {
  it('finds the outcome among other query values', () => {
    expect(readDiscordOutcome('?a=1&discord=already_linked')).toBe('already_linked')
  })

  it('is null when there is none, or it is empty', () => {
    expect(readDiscordOutcome('')).toBeNull()
    expect(readDiscordOutcome('?discord=')).toBeNull()
  })
})

describe('discordReturnMessage', () => {
  it('says nothing when the address carries no outcome', () => {
    expect(discordReturnMessage(null)).toBeNull()
    expect(discordReturnMessage('')).toBeNull()
  })

  it('confirms a successful connection', () => {
    expect(discordReturnMessage('connected')).toEqual({ tone: 'success', text: 'Discord connected.' })
  })

  it('confirms a linked server', () => {
    expect(discordReturnMessage('server_linked')?.tone).toBe('success')
  })

  it.each(['declined', 'already_linked', 'expired', 'invalid_state', 'discord_error', 'server_taken', 'not_group_admin'])(
    'explains the %s outcome as an error',
    (outcome) => {
      const message = discordReturnMessage(outcome)
      expect(message?.tone).toBe('error')
      expect(message?.text.length).toBeGreaterThan(20)
    },
  )

  it('tells the person which account to disconnect when the Discord account is taken', () => {
    expect(discordReturnMessage('already_linked')?.text).toMatch(/different Table Keep account/)
  })

  it('still says something for an outcome it does not know', () => {
    expect(discordReturnMessage('something-new')).toEqual({
      tone: 'error',
      text: 'Connecting Discord did not finish. Try again.',
    })
  })
})

describe('discordRequestErrorMessage', () => {
  it('says so when the site has no Discord application configured', () => {
    expect(discordRequestErrorMessage({ code: 'functions/failed-precondition' })).toBe(
      'Discord is not set up for this site yet.',
    )
  })

  it("passes on the function's own reason when it refuses permission", () => {
    expect(
      discordRequestErrorMessage({
        code: 'functions/permission-denied',
        message: 'Only an admin of the group can link a Discord server.',
      }),
    ).toBe('Only an admin of the group can link a Discord server.')
    expect(discordRequestErrorMessage({ code: 'functions/permission-denied' })).toBe('You are not allowed to do that.')
  })

  it('falls back to a connection problem for anything else', () => {
    expect(discordRequestErrorMessage(new Error('boom'))).toMatch(/Check your connection/)
    expect(discordRequestErrorMessage(null)).toMatch(/Check your connection/)
  })
})
