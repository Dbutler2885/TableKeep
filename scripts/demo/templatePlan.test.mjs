import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  TEMPLATE_CAMPAIGN_ID,
  TEMPLATE_GROUP_ID,
  TEMPLATE_SUBCOLLECTIONS,
  collectStorageObjects,
  rewriteFields,
  rewriteStoragePath,
  storagePrefixes,
  templateCampaignDoc,
  templateGroupDoc,
} from './templatePlan.mjs'
import { DEMO_CLONED_SUBCOLLECTIONS } from '../../functions/src/demoClone.ts'
import { DEMO_TEMPLATE_CAMPAIGN_ID, DEMO_TEMPLATE_GROUP_ID } from '../../functions/src/demoConstants.ts'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const SOURCE = { groupId: 'src-group', campaignId: 'src-campaign' }
const prefixes = storagePrefixes(SOURCE)

const from = (rest) => `groups/src-group/campaigns/src-campaign/${rest}`
const to = (rest) => `groups/demo-template/campaigns/demo-campaign/${rest}`

describe('the template plan agrees with everything else that names the template', () => {
  it('uses the same ids as the Cloud Functions package', () => {
    expect(TEMPLATE_GROUP_ID).toBe(DEMO_TEMPLATE_GROUP_ID)
    expect(TEMPLATE_CAMPAIGN_ID).toBe(DEMO_TEMPLATE_CAMPAIGN_ID)
  })

  it('carries exactly the collections a clone will copy back out', () => {
    // Anything seeded but not cloned is dead weight in the template; anything
    // cloned but not seeded is a hole in every visitor's sandbox.
    const seeded = JSON.stringify(TEMPLATE_SUBCOLLECTIONS)
    const cloned = JSON.stringify(DEMO_CLONED_SUBCOLLECTIONS)
    expect(seeded).toBe(cloned)
  })

  it('is the group the security rules single out', () => {
    const rules = readFileSync(path.join(repoRoot, 'storage.rules'), 'utf8')
    expect(rules).toContain(`groupId == '${TEMPLATE_GROUP_ID}'`)
  })
})

describe('moving Storage paths', () => {
  it('swaps the campaign prefix and leaves the rest of the path alone', () => {
    expect(rewriteStoragePath(from('maps/m1/fog/17.png'), prefixes)).toBe(to('maps/m1/fog/17.png'))
    expect(rewriteStoragePath(from('characters/c1/portraits/1-a.webp'), prefixes)).toBe(to('characters/c1/portraits/1-a.webp'))
  })

  it('ignores anything outside the source campaign', () => {
    expect(rewriteStoragePath('groups/other/campaigns/x/maps/m1', prefixes)).toBeNull()
    expect(rewriteStoragePath('', prefixes)).toBeNull()
    expect(rewriteStoragePath(undefined, prefixes)).toBeNull()
  })
})

describe('rewriting a document', () => {
  it('re-points storage paths at any depth, including inside maps and arrays', () => {
    const rewritten = rewriteFields(
      {
        portraitPath: { stringValue: from('npcs/n1/portraits/1-a.webp') },
        tokenIcon: {
          mapValue: {
            fields: {
              icon: { stringValue: 'pawn' },
              customImagePath: { stringValue: from('npcs/n1/token-icons/2-b.webp') },
            },
          },
        },
        gallery: {
          arrayValue: { values: [{ stringValue: from('images/i1') }, { stringValue: 'not-a-path' }] },
        },
      },
      prefixes,
    )

    expect(rewritten.portraitPath).toEqual({ stringValue: to('npcs/n1/portraits/1-a.webp') })
    expect(rewritten.tokenIcon.mapValue.fields.customImagePath).toEqual({ stringValue: to('npcs/n1/token-icons/2-b.webp') })
    expect(rewritten.tokenIcon.mapValue.fields.icon).toEqual({ stringValue: 'pawn' })
    expect(rewritten.gallery.arrayValue.values).toEqual([{ stringValue: to('images/i1') }, { stringValue: 'not-a-path' }])
  })

  it('blanks cached download URLs, which cannot follow the object', () => {
    // They embed the source object's encoded path and a per-object token. The
    // app re-resolves an empty one from `imagePath` on first read.
    const rewritten = rewriteFields(
      {
        imagePath: { stringValue: from('maps/m1') },
        imageUrl: { stringValue: 'https://firebasestorage.googleapis.com/v0/b/old/o/x?token=abc' },
        fogImageUrl: { stringValue: 'https://firebasestorage.googleapis.com/v0/b/old/o/y?token=def' },
      },
      prefixes,
    )

    expect(rewritten.imageUrl).toEqual({ stringValue: '' })
    expect(rewritten.fogImageUrl).toEqual({ stringValue: '' })
    expect(rewritten.imagePath).toEqual({ stringValue: to('maps/m1') })
  })

  it('keeps the inline fog data URL, which is not a Storage reference', () => {
    const rewritten = rewriteFields({ fogDataUrl: { stringValue: 'data:image/png;base64,AAAA' } }, prefixes)

    expect(rewritten.fogDataUrl).toEqual({ stringValue: 'data:image/png;base64,AAAA' })
  })

  it('leaves every other typed value untouched', () => {
    const source = {
      width: { integerValue: '2048' },
      visibleToPlayers: { booleanValue: true },
      createdAt: { timestampValue: '2026-08-28T04:25:26.332Z' },
      gmUserId: { nullValue: null },
    }

    expect(rewriteFields(source, prefixes)).toEqual(source)
  })
})

describe('collecting the objects to copy', () => {
  it('lists each referenced object once, deduplicated and sorted', () => {
    const objects = collectStorageObjects(
      [
        { fields: { imagePath: { stringValue: from('maps/m2') } } },
        { fields: { imagePath: { stringValue: from('maps/m1') } } },
        { fields: { imagePath: { stringValue: from('maps/m1') } } },
        { fields: { elsewhere: { stringValue: 'groups/other/campaigns/x/maps/m9' } } },
      ],
      prefixes,
    )

    expect(objects).toEqual([
      { from: from('maps/m1'), to: to('maps/m1') },
      { from: from('maps/m2'), to: to('maps/m2') },
    ])
  })
})

describe('the template documents themselves', () => {
  it('gives the group no owner, so nothing can write to it through the rules', () => {
    const group = templateGroupDoc({ name: { stringValue: 'The Knight Errants' }, createdBy: { stringValue: 'demo-gm-uid' } })

    expect(group.name).toEqual({ stringValue: 'The Knight Errants' })
    expect(group.activeCampaignId).toEqual({ stringValue: TEMPLATE_CAMPAIGN_ID })
    expect(group.createdBy).toBeUndefined()
  })

  it('gives the campaign no GM, and keeps the rest of it', () => {
    const campaign = templateCampaignDoc(
      {
        name: { stringValue: 'The Black Wyrm of Brandonsford' },
        system: { stringValue: 'ose' },
        status: { stringValue: 'draft' },
        gmUserId: { stringValue: 'demo-gm-uid' },
        createdBy: { stringValue: 'demo-gm-uid' },
      },
      prefixes,
    )

    expect(campaign.name).toEqual({ stringValue: 'The Black Wyrm of Brandonsford' })
    expect(campaign.system).toEqual({ stringValue: 'ose' })
    expect(campaign.status).toEqual({ stringValue: 'active' })
    expect(campaign.gmUserId).toEqual({ stringValue: '' })
    expect(campaign.createdBy).toEqual({ stringValue: '' })
  })
})
