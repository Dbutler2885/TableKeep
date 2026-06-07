import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../../firebase'
import type { InviteCode } from '../../types/app'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function generateToken(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID().replace(/-/g, '')
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

function normalizeInvite(token: string, data: Record<string, unknown>): InviteCode | null {
  const groupId = typeof data.groupId === 'string' ? data.groupId : null
  if (!groupId) return null
  const expiresAtTs = data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : null
  const createdAtTs = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : null
  const redeemedAtTs = data.redeemedAt instanceof Timestamp ? data.redeemedAt.toMillis() : null
  return {
    token,
    groupId,
    groupName: typeof data.groupName === 'string' ? data.groupName : '',
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : '',
    createdByName: typeof data.createdByName === 'string' ? data.createdByName : '',
    createdAt: createdAtTs ?? 0,
    expiresAt: expiresAtTs ?? 0,
    redeemedBy: typeof data.redeemedBy === 'string' ? data.redeemedBy : null,
    redeemedAt: redeemedAtTs,
    revoked: data.revoked === true,
  }
}

export function useGroupInvites(user: User, groupId: string | null) {
  const [invites, setInvites] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState<boolean>(Boolean(groupId))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!groupId) {
      setInvites([])
      setLoading(false)
      return
    }
    setLoading(true)
    const q = query(
      collection(db, 'inviteCodes'),
      where('groupId', '==', groupId),
      orderBy('createdAt', 'desc'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: InviteCode[] = []
        snap.forEach((d) => {
          const inv = normalizeInvite(d.id, d.data() as Record<string, unknown>)
          if (inv) next.push(inv)
        })
        setInvites(next)
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return () => {
      unsub()
    }
  }, [groupId, user.uid])

  const createInvite = async (params: {
    groupId: string
    groupName: string
    createdByName: string
  }): Promise<string> => {
    const token = generateToken()
    const expiresAt = Timestamp.fromMillis(Date.now() + INVITE_TTL_MS)
    await setDoc(doc(db, 'inviteCodes', token), {
      groupId: params.groupId,
      groupName: params.groupName,
      createdBy: user.uid,
      createdByName: params.createdByName,
      createdAt: serverTimestamp(),
      expiresAt,
      redeemedBy: null,
      redeemedAt: null,
      revoked: false,
    })
    return token
  }

  const revokeInvite = async (token: string) => {
    await updateDoc(doc(db, 'inviteCodes', token), { revoked: true })
  }

  return { invites, loading, error, createInvite, revokeInvite }
}

export async function lookupInvite(token: string): Promise<InviteCode | null> {
  const snap = await getDoc(doc(db, 'inviteCodes', token))
  if (!snap.exists()) return null
  return normalizeInvite(snap.id, snap.data() as Record<string, unknown>)
}

export function inviteState(invite: InviteCode): 'redeemed' | 'revoked' | 'expired' | 'active' {
  if (invite.redeemedBy) return 'redeemed'
  if (invite.revoked) return 'revoked'
  if (invite.expiresAt && invite.expiresAt <= Date.now()) return 'expired'
  return 'active'
}

export async function redeemInvite(user: User, token: string): Promise<{ groupId: string }> {
  const inviteRef = doc(db, 'inviteCodes', token)
  const inviteSnap = await getDoc(inviteRef)
  if (!inviteSnap.exists()) {
    throw new Error('This invite no longer exists.')
  }
  const invite = normalizeInvite(inviteSnap.id, inviteSnap.data() as Record<string, unknown>)
  if (!invite) {
    throw new Error('This invite is malformed.')
  }
  const state = inviteState(invite)
  if (state === 'redeemed') throw new Error('This invite has already been redeemed.')
  if (state === 'revoked') throw new Error('This invite has been revoked.')
  if (state === 'expired') throw new Error('This invite has expired.')

  const memberRef = doc(db, 'groups', invite.groupId, 'members', user.uid)
  const memberSnap = await getDoc(memberRef)
  if (memberSnap.exists()) {
    return { groupId: invite.groupId }
  }

  const batch = writeBatch(db)
  batch.update(inviteRef, {
    redeemedBy: user.uid,
    redeemedAt: serverTimestamp(),
  })
  batch.set(memberRef, {
    userId: user.uid,
    status: 'active',
    role: 'member',
    invitedVia: token,
    joinedAt: serverTimestamp(),
  })
  await batch.commit()

  return { groupId: invite.groupId }
}
