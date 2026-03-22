export type OseMonsterNormalizationStatus = 'normal' | 'deferred'

export type OseMonsterNormalizationDecision = {
  rawMonsterId: string
  name: string
  status: OseMonsterNormalizationStatus
  reason: string
}

export type OseImportSaveType =
  | 'death_poison'
  | 'wands'
  | 'paralysis_petrification'
  | 'breath'
  | 'spells'
  | 'custom'

export type OseImportOnHitEffectClass = 'save' | 'effect'

export type OseImportAttackClass = 'melee' | 'missile' | 'spell' | 'special'

export type OseImportAttackType =
  | 'bite'
  | 'claw'
  | 'slam'
  | 'weapon'
  | 'touch'
  | 'bow'
  | 'crossbow'
  | 'thrown'
  | 'sling'
  | 'spell'
  | 'spell_like'
  | 'breath_cone'
  | 'breath_line'
  | 'gaze'
  | 'aura'
  | 'swallow'
  | 'constrict'
  | 'custom'

export type OseImportDieType = 'd2' | 'd3' | 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100'

export type OseImportMonsterTrait = {
  id: string
  name: string
  trigger: string
  saveType: OseImportSaveType | ''
  effect: string
}

export type OseImportOnHitEffect = {
  id: string
  effectClass: OseImportOnHitEffectClass
  effectType: string
  customType: string
  notes: string
}

export type OseImportMonsterAttack = {
  id: string
  count: string
  attackClass: OseImportAttackClass
  attackType: OseImportAttackType
  customAttackType: string
  damageDiceCount: string
  damageDie: OseImportDieType | ''
  customDamageDie: string
  attackBonus: string
  onHitEffects: OseImportOnHitEffect[]
  notes: string
}

export type OseImportMvOtherEntry = {
  id: string
  type: string
  speed: string
}

export type OseImportImmunityEntry = {
  id: string
  text: string
}

export type OseImportTreasureTypeEntry = {
  id: string
  code: string
  treasureTableId: string | null
  notes: string
}

export type OseImportMonsterRecord = {
  id: string
  rulesetId: 'ose'
  name: string
  shortDescription: string
  immunities: OseImportImmunityEntry[]
  attacks: OseImportMonsterAttack[]
  traits: OseImportMonsterTrait[]
  notes: string
  stats: Record<string, string>
  mvOther: OseImportMvOtherEntry[]
  treasureTypes: OseImportTreasureTypeEntry[]
}
