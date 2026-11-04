/** A committed roll's public presentation, shared by its card and log row. */
export type CombatRoll = {
  who: string
  what: string
  roll: string
  target: string
  result: string
  tone: 'ok' | 'bad' | 'neutral'
  extra?: string
}

export type CombatLog = { event: string; actor: string | null; roll?: CombatRoll }

/** Engine-owned requests. Later phase handlers publish these with their state change. */
export type CombatAction = 'initiative' | 'movement' | 'declare' | 'attack' | 'defense' | 'catch' | 'check' | 'save' | 'location' | 'strength' | 'leave' | 'range'
export type CombatPendingAction = { combatantKey: string; action: CombatAction }
