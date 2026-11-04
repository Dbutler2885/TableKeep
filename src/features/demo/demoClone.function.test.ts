/**
 * The shape of a cloned sandbox, checked against the Cloud Functions module
 * that produces it. `functions/src/demoClone.ts` deliberately has no runtime
 * dependencies, so this runs in the plain `npm test` job, which does not install
 * the Cloud Functions package.
 */
import { describe, expect, it } from 'vitest'
import { CAMPAIGN_SUBCOLLECTIONS } from '../campaign/deleteCampaignDeep'
import {
  DEMO_CLONED_SUBCOLLECTIONS,
  demoSandboxCampaignDoc,
  demoSandboxGroupDoc,
  demoSandboxMemberDoc,
  demoSessionExpiresAtMs,
  demoStoragePrefix,
} from '../../../functions/src/demoClone'
import { DEMO_SESSION_TTL_MS } from '../../../functions/src/demoConstants'

const VISITOR = 'anon-visitor-uid'

describe('what a sandbox copies', () => {
  it('covers every campaign subcollection except per-user scratch, in-flight requests and fights', () => {
    const cloned = DEMO_CLONED_SUBCOLLECTIONS.map((spec) => spec.name).sort()
    const known = CAMPAIGN_SUBCOLLECTIONS.map((spec) => spec.name).sort()
    const skipped = known.filter((name) => !cloned.includes(name))

    // userState is one visitor's UI scratch; itemApprovals and pendingTransfers
    // are in-flight requests between two players a fresh sandbox has neither
    // of; the template carries no fights to clone.
    expect(skipped).toEqual(['combatControl', 'combats', 'itemApprovals', 'pendingTransfers', 'userState'])
    expect(cloned.filter((name) => !known.includes(name))).toEqual([])
  })

  it('copies the GM Items tab, whose library items are part of a campaign', () => {
    expect(DEMO_CLONED_SUBCOLLECTIONS.map((spec) => spec.name)).toContain('gmItems')
    expect(CAMPAIGN_SUBCOLLECTIONS.map((spec) => spec.name)).toContain('gmItems')
    expect(DEMO_CLONED_SUBCOLLECTIONS.map((spec) => spec.name)).toContain('sharedCarriers')
    expect(CAMPAIGN_SUBCOLLECTIONS.map((spec) => spec.name)).toContain('sharedCarriers')
  })

  const nestedIn = (specs: typeof CAMPAIGN_SUBCOLLECTIONS, name: string) =>
    (specs.find((spec) => spec.name === name)?.children ?? []).map((child) => child.name).sort()

  it('carries the nested subcollections the campaign schema declares, except sheet write receipts', () => {
    const withoutReceipts = (name: string) => nestedIn(CAMPAIGN_SUBCOLLECTIONS, name).filter((child) => child !== 'writeReceipts')

    expect(nestedIn(DEMO_CLONED_SUBCOLLECTIONS, 'characters')).toEqual(withoutReceipts('characters'))
    expect(nestedIn(DEMO_CLONED_SUBCOLLECTIONS, 'npcSheets')).toEqual(withoutReceipts('npcSheets'))
    expect(nestedIn(DEMO_CLONED_SUBCOLLECTIONS, 'maps')).toEqual(nestedIn(CAMPAIGN_SUBCOLLECTIONS, 'maps'))
    expect(nestedIn(DEMO_CLONED_SUBCOLLECTIONS, 'tables')).toEqual(nestedIn(CAMPAIGN_SUBCOLLECTIONS, 'tables'))
  })

  it('leaves sheet write receipts behind, which the campaign deletes with each sheet', () => {
    expect(nestedIn(CAMPAIGN_SUBCOLLECTIONS, 'characters')).toContain('writeReceipts')
    expect(nestedIn(CAMPAIGN_SUBCOLLECTIONS, 'npcSheets')).toEqual(['writeReceipts'])
    expect(nestedIn(DEMO_CLONED_SUBCOLLECTIONS, 'characters')).not.toContain('writeReceipts')
    expect(nestedIn(DEMO_CLONED_SUBCOLLECTIONS, 'npcSheets')).toEqual([])
  })

  it('deletes a fight with its log and command receipts, and the campaign\'s fight control', () => {
    expect(nestedIn(CAMPAIGN_SUBCOLLECTIONS, 'combats')).toEqual(['commands', 'log'])
    expect(CAMPAIGN_SUBCOLLECTIONS.map((spec) => spec.name)).toContain('combatControl')
  })
})

describe('who the sandbox belongs to', () => {
  it('makes the visitor a group admin, which is what makes them GM', () => {
    const member = demoSandboxMemberDoc({ visitorUid: VISITOR, joinedAt: 'now' })

    expect(member).toMatchObject({ userId: VISITOR, role: 'admin', status: 'active' })
  })

  it('points the group at the cloned campaign and marks it disposable', () => {
    const group = demoSandboxGroupDoc({
      templateGroup: { name: 'The Knight Errants', createdBy: 'template-owner' },
      visitorUid: VISITOR,
      campaignId: 'campaign-1',
      createdAt: 'now',
      expiresAt: 'later',
    })

    expect(group).toMatchObject({
      name: 'The Knight Errants',
      activeCampaignId: 'campaign-1',
      currentCampaignId: 'campaign-1',
      createdBy: VISITOR,
      isDemoSandbox: true,
      demoOwnerUid: VISITOR,
    })
  })

  it('hands the visitor the campaign as its GM, active on arrival', () => {
    const campaign = demoSandboxCampaignDoc({
      templateCampaign: {
        name: 'The Black Wyrm of Brandonsford',
        system: 'ose',
        status: 'draft',
        gmUserId: 'template-gm',
        createdBy: 'template-gm',
        enabledTabs: ['character', 'maps'],
      },
      visitorUid: VISITOR,
      groupId: 'group-1',
      updatedAt: 'now',
    })

    expect(campaign).toMatchObject({
      name: 'The Black Wyrm of Brandonsford',
      system: 'ose',
      enabledTabs: ['character', 'maps'],
      groupId: 'group-1',
      status: 'active',
      gmUserId: VISITOR,
      createdBy: VISITOR,
    })
  })
})

describe('lifetime and cleanup', () => {
  it('expires a sandbox one TTL after it was created', () => {
    expect(demoSessionExpiresAtMs(1_000)).toBe(1_000 + DEMO_SESSION_TTL_MS)
  })

  it('scopes cleanup to the sandbox group, so a shared template object is out of reach', () => {
    const prefix = demoStoragePrefix('sandbox-group')

    expect(prefix).toBe('groups/sandbox-group/')
    expect('groups/demo-template/campaigns/demo-campaign/maps/m1'.startsWith(prefix)).toBe(false)
    expect('groups/sandbox-group/campaigns/c1/maps/m1/fog/1.png'.startsWith(prefix)).toBe(true)
  })
})
