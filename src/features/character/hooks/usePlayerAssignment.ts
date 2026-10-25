// Owns player-assignment modal state and its async submit handler.
// Step 0 removed its reset effect, so this hook owns no effect relative to justSeeded.

import { useMemo, useState } from 'react'
import type { CharacterRecord } from '../../../types/app'
import type { CampaignPlayerOption } from '../lib/characterTabTypes'

// Only the fields assignment reads and writes, so any rule set's character can be given to a player.
type AssignableCharacter = Pick<CharacterRecord, 'id' | 'ownerUserId'>
type OwnerUpdate = { ownerUserId: string; ownerUsername: string }

type Params = { effectiveSelected: AssignableCharacter | null; campaignPlayers: CampaignPlayerOption[]; updateCharacter: (id: string, updates: OwnerUpdate) => void }

export function usePlayerAssignment({ effectiveSelected, campaignPlayers, updateCharacter }: Params) {
  const [playerAssignmentOpen, setPlayerAssignmentOpen] = useState(false)
  const [assignmentTargetUserId, setAssignmentTargetUserId] = useState('')
  const [assignmentBusy, setAssignmentBusy] = useState(false)
  const assignmentOptions = useMemo(() => campaignPlayers.filter((player) => player.userId !== effectiveSelected?.ownerUserId), [campaignPlayers, effectiveSelected?.ownerUserId])
  const effectiveAssignmentTargetUserId = assignmentOptions.some((player) => player.userId === assignmentTargetUserId) ? assignmentTargetUserId : (assignmentOptions[0]?.userId ?? '')
  const openPlayerAssignment = () => { setAssignmentTargetUserId(assignmentOptions[0]?.userId ?? ''); setPlayerAssignmentOpen(true) }
  const closePlayerAssignment = () => { if (assignmentBusy) return; setPlayerAssignmentOpen(false); setAssignmentTargetUserId('') }
  const submitPlayerAssignment = async () => {
    if (!effectiveSelected || !effectiveAssignmentTargetUserId) return
    const target = campaignPlayers.find((player) => player.userId === effectiveAssignmentTargetUserId)
    if (!target) return
    setAssignmentBusy(true)
    try {
      updateCharacter(effectiveSelected.id, { ownerUserId: target.userId, ownerUsername: target.username ?? target.userId })
      setPlayerAssignmentOpen(false)
      setAssignmentTargetUserId('')
    } finally { setAssignmentBusy(false) }
  }
  return { playerAssignmentOpen, assignmentTargetUserId, assignmentBusy, assignmentOptions, effectiveAssignmentTargetUserId, setAssignmentTargetUserId, openPlayerAssignment, closePlayerAssignment, submitPlayerAssignment }
}
