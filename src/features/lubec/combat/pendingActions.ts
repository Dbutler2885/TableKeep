import type { Role } from '../../../types/app'
import type { CombatPendingAction } from './engine/combatFeedback'
import type { Combatant, CombatState } from './engine/types'

export type ViewerCombatAction = CombatPendingAction & { name: string; kind?: Combatant['kind'] }

function ownsAction(combatant: Combatant, role: Role | null, userId: string): boolean {
  if (combatant.kind === 'npc') return role === 'gm'
  return combatant.ownerUserId === userId
}

function canAnswer(action: CombatPendingAction, combatant: Combatant, role: Role | null, userId: string): boolean {
  if (combatant.outReason !== null) return false
  if (action.action === 'leave' || action.action === 'range' || action.action === 'reviewDeclaration') return role === 'gm'
  return ownsAction(combatant, role, userId)
}

/** Select every request this viewer owns, without giving a GM another player's controls. */
export function pendingCombatActions(state: CombatState, role: Role | null, userId: string): ViewerCombatAction[] {
  return (state.pendingActions ?? []).flatMap((action) => {
    const actor = state.combatants.find((combatant) => combatant.key === action.combatantKey)
    if (!actor || !canAnswer(action, actor, role, userId)) return []
    return [{ ...action, name: actor.name, kind: actor.kind }]
  })
}

const ACTION_LABELS = {
  initiative: 'roll initiative', movement: 'choose Movement', declare: 'Declare', attack: 'Attack',
  defense: 'roll Defense', catch: 'try a catch', check: 'roll a Check', save: 'roll a Save',
  location: 'place the hit', strength: 'roll Strength', leave: 'confirm Leave', range: 'declare range',
  reviewDeclaration: 'review declaration',
} as const

export const combatActionText = (action: ViewerCombatAction): string => `${action.name}: ${ACTION_LABELS[action.action]}`

const NOTICE_STAGES = { initiative: 'Initiative', movement: 'Movement', declare: 'Declare', reviewDeclaration: 'Declaration review', attack: 'Attack', defense: 'Defense', catch: 'Catch', check: 'Check', save: 'Save', location: 'Hit location', strength: 'Strength', leave: 'Leave', range: 'Range' } as const

const noticeActor = (action: ViewerCombatAction): string => action.kind === 'npc' ? `${action.name} (NPC)` : action.name

export function combatActionNotice(action: ViewerCombatAction, round: number, role: Role | null): string {
  if (action.action === 'leave') return `${noticeActor(action)} asks to Leave.`
  if (action.action === 'range') return `Declare range for ${noticeActor(action)}.`
  if (action.action === 'reviewDeclaration') return `Review ${noticeActor(action)}'s declaration.`
  if (role === 'gm') return `It is ${noticeActor(action)}'s turn to ${ACTION_LABELS[action.action].toLowerCase()}.`
  return `${round > 0 ? `Round ${round}` : 'Before initiative'}, ${NOTICE_STAGES[action.action]}: it is your turn.`
}
