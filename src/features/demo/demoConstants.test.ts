/**
 * The demo template's identity is written out in four files that cannot import
 * each other: this package's constants, the Cloud Functions package's, and the
 * two security rules files, which have no import mechanism at all. A drift
 * between any of them is silent and severe - `firestore.rules` would keep
 * world-readable a group nothing clones from, while the group visitors actually
 * land in would be unreadable - so the coupling is pinned here instead of being
 * left to a comment.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEMO_SESSION_TTL_MS,
  DEMO_TEMPLATE_CAMPAIGN_ID,
  DEMO_TEMPLATE_GROUP_ID,
  DEMO_VISITOR_USERNAME,
} from './demoConstants'
import {
  DEMO_MAX_LIVE_SANDBOXES,
  DEMO_SESSION_TTL_MS as FUNCTIONS_TTL_MS,
  DEMO_TEMPLATE_CAMPAIGN_ID as FUNCTIONS_TEMPLATE_CAMPAIGN_ID,
  DEMO_TEMPLATE_GROUP_ID as FUNCTIONS_TEMPLATE_GROUP_ID,
  DEMO_VISITOR_USERNAME as FUNCTIONS_VISITOR_USERNAME,
} from '../../../functions/src/demoConstants'
import { isValidUsername } from '../auth/usernameRules'

const readRepoFile = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8')

describe('demo sandbox constants', () => {
  it('agrees with the Cloud Functions package', () => {
    expect(DEMO_TEMPLATE_GROUP_ID).toBe(FUNCTIONS_TEMPLATE_GROUP_ID)
    expect(DEMO_TEMPLATE_CAMPAIGN_ID).toBe(FUNCTIONS_TEMPLATE_CAMPAIGN_ID)
    expect(DEMO_SESSION_TTL_MS).toBe(FUNCTIONS_TTL_MS)
    expect(DEMO_VISITOR_USERNAME).toBe(FUNCTIONS_VISITOR_USERNAME)
  })

  it('names the same template group in firestore.rules', () => {
    expect(readRepoFile('firestore.rules')).toContain(`groupId == "${DEMO_TEMPLATE_GROUP_ID}"`)
  })

  it('names the same template group in storage.rules', () => {
    expect(readRepoFile('storage.rules')).toContain(`groupId == '${DEMO_TEMPLATE_GROUP_ID}'`)
  })

  it('keeps a ceiling low enough to bound the bill and high enough to be a demo', () => {
    expect(DEMO_MAX_LIVE_SANDBOXES).toBeGreaterThanOrEqual(10)
    expect(DEMO_MAX_LIVE_SANDBOXES).toBeLessThanOrEqual(500)
  })

  it('uses a visitor name the app accepts as a handle', () => {
    expect(isValidUsername(DEMO_VISITOR_USERNAME)).toBe(true)
  })
})
