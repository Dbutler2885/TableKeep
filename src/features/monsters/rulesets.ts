export type MonsterRulesetId = 'ose'

export type MonsterFieldDef = {
  key: string
  label: string
  shortLabel: string
  placeholder?: string
}

export type MonsterRulesetDef = {
  id: MonsterRulesetId
  name: string
  fields: MonsterFieldDef[]
  statlineOrder: string[]
}

export const oseMonsterRuleset: MonsterRulesetDef = {
  id: 'ose',
  name: 'Old-School Essentials',
  fields: [
    { key: 'ac', label: 'Armor Class (AC)', shortLabel: 'AC', placeholder: '4 [15]' },
    { key: 'hd', label: 'Hit Dice (HD)', shortLabel: 'HD', placeholder: '6+1**' },
    { key: 'att', label: 'Attacks Per Round (Att)', shortLabel: 'Att', placeholder: '1 x bite' },
    { key: 'dmg', label: 'Damage', shortLabel: 'Dmg', placeholder: '1d10 + petrification' },
    { key: 'thaco', label: 'Attack Roll to Hit AC 0', shortLabel: 'THAC0', placeholder: '13 [+6]' },
    { key: 'mv', label: 'Movement Rate (MV)', shortLabel: 'MV', placeholder: '60\' (20\')' },
    { key: 'sv_d', label: 'Save vs Death/Poison (D)', shortLabel: 'D', placeholder: '10' },
    { key: 'sv_w', label: 'Save vs Wands (W)', shortLabel: 'W', placeholder: '11' },
    { key: 'sv_p', label: 'Save vs Paralysis/Petrification (P)', shortLabel: 'P', placeholder: '12' },
    { key: 'sv_b', label: 'Save vs Breath Attacks (B)', shortLabel: 'B', placeholder: '14' },
    { key: 'sv_s', label: 'Save vs Spells/Rods/Staves (S)', shortLabel: 'S', placeholder: '15' },
    { key: 'ml', label: 'Morale Rating (ML)', shortLabel: 'ML', placeholder: '9' },
    { key: 'al', label: 'Alignment (AL)', shortLabel: 'AL', placeholder: 'Neutral' },
    { key: 'xp', label: 'XP Award', shortLabel: 'XP', placeholder: '950' },
    { key: 'na', label: 'Number Appearing (NA)', shortLabel: 'NA', placeholder: '1d6 (1d6)' },
    { key: 'tt', label: 'Treasure Type (TT)', shortLabel: 'TT', placeholder: 'F' },
  ],
  statlineOrder: ['ac', 'hd', 'att', 'dmg', 'thaco', 'mv', 'ml', 'xp'],
}

export const monsterRulesets: Record<MonsterRulesetId, MonsterRulesetDef> = {
  ose: oseMonsterRuleset,
}
