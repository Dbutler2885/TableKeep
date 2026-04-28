import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../../firebase'
import type { Campaign, GroupRecord, GroupMemberRole } from '../../types/app'

function normalizeCampaign(id: string, groupId: string, data: Record<string, unknown>): Campaign {
  return {
    id,
    groupId,
    name: typeof data.name === 'string' ? data.name : id,
    slug: typeof data.slug === 'string' ? data.slug : undefined,
    status: typeof data.status === 'string' ? data.status : 'inactive',
    system: typeof data.system === 'string' ? data.system : undefined,
    gmUserId: typeof data.gmUserId === 'string' ? data.gmUserId : null,
  }
}

export function useGroupAccess(user: User) {
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const unsub = onSnapshot(
      collection(db, 'groups'),
      (snap) => {
        void (async () => {
          try {
            const nextGroups = await Promise.all(
              snap.docs.map(async (groupDoc) => {
                const groupId = groupDoc.id
                const groupData = groupDoc.data() as Record<string, unknown>
                const memberSnap = await getDoc(doc(db, 'groups', groupId, 'members', user.uid))
                if (!memberSnap.exists()) return null

                const memberData = memberSnap.data() as Record<string, unknown>
                if (memberData.status !== 'active') return null

                const campaignsSnap = await getDocs(collection(db, 'groups', groupId, 'campaigns'))
                const campaigns = campaignsSnap.docs.map((campaignSnap) =>
                  normalizeCampaign(campaignSnap.id, groupId, campaignSnap.data() as Record<string, unknown>),
                )

                const activeCampaignId = typeof groupData.activeCampaignId === 'string'
                  ? groupData.activeCampaignId
                  : typeof groupData.currentCampaignId === 'string'
                    ? groupData.currentCampaignId
                  : null
                const activeCampaign = activeCampaignId
                  ? campaigns.find((campaign) => campaign.id === activeCampaignId) ?? null
                  : null
                const drafts = campaigns.filter((campaign) => campaign.status === 'draft' && campaign.gmUserId === user.uid)
                const inactiveCampaigns = campaigns.filter((campaign) => campaign.status === 'inactive')

                return {
                  id: groupId,
                  name: typeof groupData.name === 'string' ? groupData.name : groupId,
                  slug: typeof groupData.slug === 'string' ? groupData.slug : groupId,
                  activeCampaignId,
                  activeCampaign,
                  drafts,
                  inactiveCampaigns,
                  memberRole: (memberData.role === 'admin' ? 'admin' : 'member') as GroupMemberRole,
                  source: 'group' as const,
                }
              }),
            )

            if (cancelled) return
            const filteredGroups = nextGroups.filter((group) => group !== null) as GroupRecord[]
            setGroups(filteredGroups)
            setError(null)
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to load groups.'
            if (!cancelled) setError(message)
          } finally {
            if (!cancelled) setLoading(false)
          }
        })()
      },
      (err) => {
        const message = err instanceof Error ? err.message : 'Unable to load groups.'
        if (!cancelled) {
          setError(message)
          setLoading(false)
        }
      },
    )

    return () => {
      cancelled = true
      unsub()
    }
  }, [user.uid])

  const createGroup = async (name: string) => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      throw new Error('Group name is required.')
    }

    const slugBase = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'group'
    const slug = `${slugBase}-${Date.now().toString(36)}`

    const groupRef = await addDoc(collection(db, 'groups'), {
      name: trimmedName,
      slug,
      activeCampaignId: null,
      currentCampaignId: null,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    await setDoc(doc(db, 'groups', groupRef.id, 'members', user.uid), {
      userId: user.uid,
      role: 'admin',
      status: 'active',
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    setGroups((current) => {
      if (current.some((group) => group.id === groupRef.id)) return current
      return [
        ...current,
        {
          id: groupRef.id,
          name: trimmedName,
          slug,
          activeCampaignId: null,
          activeCampaign: null,
          drafts: [],
          inactiveCampaigns: [],
          memberRole: 'admin',
          source: 'group',
        },
      ]
    })

    return groupRef.id
  }

  const createCampaign = async (groupId: string, name: string, system: string) => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      throw new Error('Campaign name is required.')
    }
    if (!system.trim()) {
      throw new Error('System is required.')
    }

    const slugBase = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'campaign'
    const slug = `${slugBase}-${Date.now().toString(36)}`

    const campaignRef = await addDoc(collection(db, 'groups', groupId, 'campaigns'), {
      groupId,
      name: trimmedName,
      slug,
      system,
      status: 'draft',
      createdBy: user.uid,
      gmUserId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    const draft: Campaign = {
      id: campaignRef.id,
      groupId,
      name: trimmedName,
      slug,
      system,
      status: 'draft',
      gmUserId: user.uid,
    }

    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              drafts: [...group.drafts, draft],
            }
          : group,
      ),
    )

    return campaignRef.id
  }

  const setActiveCampaign = async (groupId: string, campaignId: string) => {
    const targetGroup = groups.find((group) => group.id === groupId) ?? null
    if (!targetGroup) {
      throw new Error('Group not found.')
    }

    const allCampaigns = [
      ...(targetGroup.activeCampaign ? [targetGroup.activeCampaign] : []),
      ...targetGroup.drafts,
      ...targetGroup.inactiveCampaigns,
    ]
    const nextActiveCampaign = allCampaigns.find((campaign) => campaign.id === campaignId) ?? null
    if (!nextActiveCampaign) {
      throw new Error('Campaign not found.')
    }

    const batch = writeBatch(db)
    const groupRef = doc(db, 'groups', groupId)
    const nextCampaignRef = doc(db, 'groups', groupId, 'campaigns', campaignId)

    batch.update(groupRef, {
      activeCampaignId: campaignId,
      currentCampaignId: campaignId,
      updatedAt: serverTimestamp(),
    })
    batch.update(nextCampaignRef, {
      status: 'active',
      updatedAt: serverTimestamp(),
    })

    if (targetGroup.activeCampaign && targetGroup.activeCampaign.id !== campaignId) {
      batch.update(doc(db, 'groups', groupId, 'campaigns', targetGroup.activeCampaign.id), {
        status: 'inactive',
        updatedAt: serverTimestamp(),
      })
    }

    await batch.commit()

    setGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group

        const previousActive = group.activeCampaign
        const campaigns = [
          ...(previousActive ? [previousActive] : []),
          ...group.drafts,
          ...group.inactiveCampaigns,
        ]

        const updatedCampaigns = campaigns.reduce<Campaign[]>((acc, campaign) => {
          if (campaign.id === campaignId) {
            acc.push({ ...campaign, status: 'active' })
            return acc
          }
          if (previousActive && campaign.id === previousActive.id && campaign.id !== campaignId) {
            acc.push({ ...campaign, status: 'inactive' })
            return acc
          }
          acc.push(campaign)
          return acc
        }, [])

        const activeCampaign = updatedCampaigns.find((campaign) => campaign.id === campaignId) ?? null

        return {
          ...group,
          activeCampaignId: campaignId,
          activeCampaign,
          drafts: updatedCampaigns.filter((campaign) => campaign.status === 'draft' && campaign.gmUserId === user.uid),
          inactiveCampaigns: updatedCampaigns.filter((campaign) => campaign.status === 'inactive'),
        }
      }),
    )
  }

  const deactivateCampaign = async (groupId: string, campaignId: string) => {
    const targetGroup = groups.find((group) => group.id === groupId) ?? null
    if (!targetGroup) {
      throw new Error('Group not found.')
    }
    if (!targetGroup.activeCampaign || targetGroup.activeCampaign.id !== campaignId) {
      throw new Error('Campaign is not currently active.')
    }

    const batch = writeBatch(db)
    const groupRef = doc(db, 'groups', groupId)
    const campaignRef = doc(db, 'groups', groupId, 'campaigns', campaignId)

    batch.update(groupRef, {
      activeCampaignId: null,
      currentCampaignId: null,
      updatedAt: serverTimestamp(),
    })
    batch.update(campaignRef, {
      status: 'inactive',
      updatedAt: serverTimestamp(),
    })

    await batch.commit()

    setGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group
        const previousActive = group.activeCampaign
        if (!previousActive) return group
        const newlyInactive: Campaign = { ...previousActive, status: 'inactive' }
        return {
          ...group,
          activeCampaignId: null,
          activeCampaign: null,
          inactiveCampaigns: [newlyInactive, ...group.inactiveCampaigns],
        }
      }),
    )
  }

  const deleteInactiveCampaign = async (groupId: string, campaignId: string) => {
    const targetGroup = groups.find((group) => group.id === groupId) ?? null
    const inactive = targetGroup?.inactiveCampaigns.find((campaign) => campaign.id === campaignId) ?? null
    if (!targetGroup || !inactive) {
      throw new Error('Inactive campaign not found.')
    }

    await deleteDoc(doc(db, 'groups', groupId, 'campaigns', campaignId))

    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              inactiveCampaigns: group.inactiveCampaigns.filter((campaign) => campaign.id !== campaignId),
            }
          : group,
      ),
    )
  }

  const deleteDraftCampaign = async (groupId: string, campaignId: string) => {
    const targetGroup = groups.find((group) => group.id === groupId) ?? null
    const draft = targetGroup?.drafts.find((campaign) => campaign.id === campaignId) ?? null
    if (!targetGroup || !draft) {
      throw new Error('Draft not found.')
    }
    if (draft.gmUserId !== user.uid) {
      throw new Error('Only the draft owner can delete it.')
    }

    await deleteDoc(doc(db, 'groups', groupId, 'campaigns', campaignId))

    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              drafts: group.drafts.filter((campaign) => campaign.id !== campaignId),
            }
          : group,
      ),
    )
  }

  const deleteGroup = async (groupId: string) => {
    const target = groups.find((group) => group.id === groupId) ?? null
    if (!target) {
      throw new Error('Group not found.')
    }
    if (target.memberRole !== 'admin') {
      throw new Error('Only group admins can delete groups.')
    }
    if (target.activeCampaign || target.drafts.length > 0 || target.inactiveCampaigns.length > 0) {
      throw new Error('Only empty groups can be deleted right now.')
    }

    const [membersSnap, invitesSnap] = await Promise.all([
      getDocs(collection(db, 'groups', groupId, 'members')),
      getDocs(collection(db, 'groups', groupId, 'invites')),
    ])

    const selfMemberDoc = membersSnap.docs.find((memberDoc) => memberDoc.id === user.uid) ?? null
    const otherMemberDocs = membersSnap.docs.filter((memberDoc) => memberDoc.id !== user.uid)

    await Promise.all(invitesSnap.docs.map((inviteDoc) => deleteDoc(inviteDoc.ref)))
    await Promise.all(otherMemberDocs.map((memberDoc) => deleteDoc(memberDoc.ref)))
    await deleteDoc(doc(db, 'groups', groupId))
    if (selfMemberDoc) {
      await deleteDoc(selfMemberDoc.ref)
    }

    setGroups((current) => current.filter((group) => group.id !== groupId))
  }

  return {
    groups,
    loading,
    error,
    createGroup,
    createCampaign,
    setActiveCampaign,
    deactivateCampaign,
    deleteInactiveCampaign,
    deleteDraftCampaign,
    deleteGroup,
    setError,
  }
}
