// NPC portraits and token images in Cloud Storage.
import type { NpcRecord, Role } from '../../../types/app'
import type { CampaignScope } from '../../campaign/firestorePaths'
import { resolveStoragePathUrl, uploadEntityImage } from '../../common/mediaStorage'

const resolveOptionalPath = (path: string | undefined) =>
  path ? resolveStoragePathUrl(path) : Promise.resolve<string | null>(null)

// [portrait URL, token image URL]; a missing path resolves to null.
export const resolveNpcMediaUrls = (npc: NpcRecord) =>
  Promise.all([resolveOptionalPath(npc.portraitPath), resolveOptionalPath(npc.tokenIcon.customImagePath)])

// A player's upload names its authority; the GM's is held to the GM check.
const uploadAuthority = (role: Role | null) => (role === 'gm' ? undefined : 'player' as const)

export async function uploadNpcPortrait(scope: CampaignScope, role: Role | null, npcId: string, file: File) {
  const { path, url } = await uploadEntityImage({
    campaignId: scope.campaignId,
    groupId: scope.groupId,
    collectionName: 'npcs',
    entityId: npcId,
    uploadAuthority: uploadAuthority(role),
    mediaKind: 'portraits',
    file,
    maxWidth: 600,
    maxHeight: 800,
  })
  return {
    portraitPath: path,
    portraitUrl: url,
  }
}

export async function uploadNpcTokenImage(scope: CampaignScope, role: Role | null, npcId: string, file: File) {
  const { path, url, name } = await uploadEntityImage({
    campaignId: scope.campaignId,
    groupId: scope.groupId,
    collectionName: 'npcs',
    entityId: npcId,
    uploadAuthority: uploadAuthority(role),
    mediaKind: 'token-icons',
    file,
    maxWidth: 1024,
    maxHeight: 1024,
  })
  return {
    customImagePath: path,
    customImageUrl: url,
    customImageName: name,
  }
}
