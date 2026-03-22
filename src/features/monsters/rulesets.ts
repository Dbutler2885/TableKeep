export type MonsterRulesetId = 'ose'

export type MonsterFieldDef = {
  key: string
  label: string
  shortLabel: string
  placeholder?: string
  inputType?: 'number'
  min?: number
  max?: number
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
    { key: 'ac', label: 'Armor Class (AC)', shortLabel: 'AC', placeholder: '4', inputType: 'number' },
    { key: 'thac0', label: 'THAC0', shortLabel: 'THAC0', placeholder: '19', inputType: 'number' },
    { key: 'hd_dice', label: 'HD Dice Count', shortLabel: 'HD dice', placeholder: '6', inputType: 'number', min: 0 },
    { key: 'hd_mod', label: 'HD Modifier', shortLabel: 'HD mod', placeholder: '' },
    { key: 'mv_land', label: 'Land Movement (ft/turn)', shortLabel: 'MV', placeholder: '60', inputType: 'number', min: 0 },
    { key: 'sv_d', label: 'Save vs Death/Poison (D)', shortLabel: 'D', placeholder: '10', inputType: 'number' },
    { key: 'sv_w', label: 'Save vs Wands (W)', shortLabel: 'W', placeholder: '11', inputType: 'number' },
    { key: 'sv_p', label: 'Save vs Paralysis/Petrification (P)', shortLabel: 'P', placeholder: '12', inputType: 'number' },
    { key: 'sv_b', label: 'Save vs Breath Attacks (B)', shortLabel: 'B', placeholder: '14', inputType: 'number' },
    { key: 'sv_s', label: 'Save vs Spells/Rods/Staves (S)', shortLabel: 'S', placeholder: '15', inputType: 'number' },
    { key: 'ml', label: 'Morale Rating (ML)', shortLabel: 'ML', placeholder: '9', inputType: 'number', min: 2, max: 12 },
    { key: 'al', label: 'Alignment (AL)', shortLabel: 'AL', placeholder: 'Neutral' },
    { key: 'xp', label: 'XP Award', shortLabel: 'XP', placeholder: '950', inputType: 'number', min: 0 },
    { key: 'na_dungeon_count', label: 'NA Dungeon Count', shortLabel: 'NA-dc', placeholder: '1' },
    { key: 'na_dungeon_die', label: 'NA Dungeon Die', shortLabel: 'NA-dd', placeholder: 'd6' },
    { key: 'na_wilderness_count', label: 'NA Wilderness Count', shortLabel: 'NA-wc', placeholder: '1' },
    { key: 'na_wilderness_die', label: 'NA Wilderness Die', shortLabel: 'NA-wd', placeholder: 'd6' },
    { key: 'tt', label: 'Treasure Type (TT)', shortLabel: 'TT', placeholder: 'F' },
  ],
  statlineOrder: ['ac', 'thac0', 'hd', 'att', 'dmg', 'mv', 'ml', 'xp'],
}

export const monsterRulesets: Record<MonsterRulesetId, MonsterRulesetDef> = {
  ose: oseMonsterRuleset,
}
