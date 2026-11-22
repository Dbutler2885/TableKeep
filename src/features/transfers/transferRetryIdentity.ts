import type { CampaignScope } from '../campaign/firestorePaths'
export type TransferRetryIdentity = { fromCharacterId: string; toCharacterId: string }
const retained = new Map<string, TransferRetryIdentity>()
const keyFor = (scope: CampaignScope, id: string) => `tablekeep-transfer:${scope.groupId}:${scope.campaignId}:${id}`

/** Keep the receiver/source pair even when the accepted offer disappears before its RPC acknowledgement. */
export function retainTransferIdentity(scope: CampaignScope, id: string, identity?: TransferRetryIdentity) {
  const key = keyFor(scope, id)
  if (identity) {
    retained.set(key, identity)
    persistIdentity(key, identity)
  }
  return retained.get(key) ?? readIdentity(key)
}

function persistIdentity(key: string, identity: TransferRetryIdentity) {
  try { sessionStorage.setItem(key, JSON.stringify(identity)) } catch { /* The live map still retains uncertain operations. */ }
}
function readIdentity(key: string): TransferRetryIdentity | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null') as TransferRetryIdentity | null
    if (validIdentity(value)) return value
  } catch { /* Unavailable or malformed storage never grants authority. */ }
}

function validIdentity(value: unknown): value is TransferRetryIdentity {
  return value !== null && typeof value === 'object'
    && typeof (value as TransferRetryIdentity).fromCharacterId === 'string'
    && typeof (value as TransferRetryIdentity).toCharacterId === 'string'
}
