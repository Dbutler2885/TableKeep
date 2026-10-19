import type { inviteState } from '../invites/useInvites'

type InviteState = ReturnType<typeof inviteState>

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const STATE_LABELS: Record<InviteState, string> = {
  active: 'Active',
  redeemed: 'Redeemed',
  revoked: 'Revoked',
  expired: 'Expired',
}

export const inviteUrl = (token: string) => `${window.location.origin}/join/${token}`

/** Resolves without copying when the browser has no clipboard at all. */
export async function copyToClipboard(text: string) {
  await navigator.clipboard?.writeText(text)
}

/** An active invite just copied reads "Copied" in place of "Active". */
export const inviteStateLabel = (state: InviteState, copied: boolean) =>
  state === 'active' && copied ? 'Copied' : STATE_LABELS[state]

/** Whole days left, else whole hours but never under one; blank once expired or without an expiry. */
export function inviteExpiresIn(expiresAt: number, now: number) {
  if (!expiresAt) return ''
  const ms = expiresAt - now
  if (ms <= 0) return ''
  const days = Math.floor(ms / DAY_MS)
  if (days >= 1) return `${days}d left`
  return `${Math.max(1, Math.floor(ms / HOUR_MS))}h left`
}
