import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from '../../firebase'
import type { Campaign, Role } from '../../types/app'

const gmEmails = (import.meta.env.VITE_GM_EMAILS ?? '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)

export function useCampaignAccess(user: User) {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const initCampaignAccess = async () => {
      setLoading(true)
      setError(null)

      try {
        const email = (user.email ?? '').toLowerCase()
        const desiredRole: Role = gmEmails.includes(email) ? 'gm' : 'player'

        const activeCampaignSnap = await getDocs(
          query(collection(db, 'campaigns'), where('status', '==', 'active'), limit(1)),
        )

        let campaignId = activeCampaignSnap.docs[0]?.id ?? null

        if (!campaignId) {
          if (desiredRole !== 'gm') {
            throw new Error('No active campaign exists yet. Ask the GM to sign in first.')
          }

          const createdCampaign = await addDoc(collection(db, 'campaigns'), {
            name: 'My OSE Module',
            slug: 'my-ose-module',
            status: 'active',
            createdBy: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            activeMapId: null,
          })

          campaignId = createdCampaign.id
        }

        await setDoc(
          doc(db, 'campaigns', campaignId, 'members', user.uid),
          {
            userId: user.uid,
            role: desiredRole,
            status: 'active',
            joinedAt: serverTimestamp(),
          },
          { merge: true },
        )

        await setDoc(
          doc(db, 'users', user.uid, 'campaignMemberships', campaignId),
          {
            campaignId,
            userId: user.uid,
            role: desiredRole,
            status: 'active',
            joinedAt: serverTimestamp(),
          },
          { merge: true },
        )

        const campaignDoc = await getDoc(doc(db, 'campaigns', campaignId))
        if (!campaignDoc.exists()) {
          throw new Error('Active campaign document could not be loaded.')
        }

        const data = campaignDoc.data() as { name?: string; status?: string }

        if (!cancelled) {
          setCampaign({
            id: campaignId,
            name: data.name ?? campaignId,
            status: data.status ?? 'active',
          })
          setRole(desiredRole)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        if (!cancelled) {
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void initCampaignAccess()

    return () => {
      cancelled = true
    }
  }, [user.email, user.uid])

  return { campaign, role, loading, error, setError }
}
