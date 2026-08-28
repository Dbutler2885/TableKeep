import type { CharacterArmourItem, CharacterWeaponItem } from '../../../types/app'

export const weaponTypeLabel = (weapon: CharacterWeaponItem) => weapon.typeName || 'Weapon'
export const weaponCoreStatsLabel = (weapon: CharacterWeaponItem) => {
  const count = (weapon.damageDiceCount ?? '').trim()
  const sides = (weapon.damageDiceSides ?? '').trim()
  const short = (weapon.rangeShort ?? '').trim()
  const medium = (weapon.rangeMedium ?? '').trim()
  const long = (weapon.rangeLong ?? '').trim()
  const hasDamage = count.length > 0 && sides.length > 0
  const hasRange = short.length > 0 && medium.length > 0 && long.length > 0
  if (!hasDamage && !hasRange) return ''
  if (hasDamage && hasRange) return `${count}d${sides} ${short}/${medium}/${long}`
  if (hasDamage) return `${count}d${sides} Mel`
  return `${short}/${medium}/${long}`
}
export const weaponStatsLabel = (weapon: CharacterWeaponItem) => {
  const stats = [weaponCoreStatsLabel(weapon)]
  const bonus = (weapon.attackBonus ?? '').trim()
  if (bonus) stats.push(`+${bonus.replace(/^\+/, '')}`)
  if (weapon.slow) stats.push('Slow')
  if (weapon.twoHanded) stats.push('2H')
  return stats.join(' | ')
}
export const armourTypeLabel = (armour: CharacterArmourItem) => armour.typeName || 'Armour'
export const armourStatsLabel = (armour: CharacterArmourItem) => {
  const stats: string[] = []
  const armourClass = (armour.armourClass ?? '').trim()
  const shieldMod = (armour.shieldMod ?? '').trim()
  if (armour.armourType === 'shield') {
    if (shieldMod) stats.push(`AC ${shieldMod}`)
  } else if (armourClass) stats.push(`AC ${armourClass}`)
  const magic = (armour.magicMod ?? '').trim()
  if (magic) stats.push(`Magic ${magic}`)
  return stats.join(' | ')
}
type WeaponEffect = NonNullable<CharacterWeaponItem['weaponEffects']>[number]
export const formatWeaponEffectConditionLabel = (effect: WeaponEffect) => {
  if (effect.conditionType === 'none' || effect.conditionValues.length === 0) return ''
  const values = effect.conditionValues.map((value) => {
    if (effect.conditionType === 'armour_state') {
      if (value === 'natural_armour') return 'Natural Armour'
      if (value === 'unarmoured') return 'Unarmoured'
      if (value === 'armoured') return 'Armoured'
    }
    if (effect.conditionType === 'alignment') return value.charAt(0).toUpperCase() + value.slice(1)
    return value.split(/[_-]/g).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
  })
  return ['alignment', 'armour_state', 'creature_type'].includes(effect.conditionType)
    ? `vs ${values.join(', ')}`
    : values.join(', ')
}
export const formatWeaponEffectOutcomeLabel = (weapon: CharacterWeaponItem, effect: WeaponEffect) => {
  if (effect.outcomeType === 'attack_bonus') return `${effect.outcomeValue} to attack`
  if (effect.outcomeType === 'damage_bonus') return `${effect.outcomeValue} to damage`
  if (effect.outcomeType === 'replace_damage') return `damage becomes ${effect.outcomeValue}`
  if (effect.outcomeType === 'extra_damage') return `extra ${effect.outcomeValue}`
  if (effect.outcomeType === 'roll_table') {
    const table = weapon.weaponRollTables?.find((entry) => entry.id === effect.outcomeValue) ?? null
    if (!table) return 'roll table'
    return `roll ${table.name || `d${table.dieSides}`}${table.dieSides ? ` (d${table.dieSides})` : ''}`
  }
  return effect.outcomeValue
}
export const formatWeaponEffectLine = (weapon: CharacterWeaponItem, effect: WeaponEffect) => {
  const condition = formatWeaponEffectConditionLabel(effect)
  const outcome = formatWeaponEffectOutcomeLabel(weapon, effect)
  const note = effect.notes.trim()
  const body = condition ? `${condition}: ${outcome}` : outcome
  if (effect.trigger === 'on_crit') return `On crit: ${body}${note ? ` (${note})` : ''}`
  if (effect.trigger === 'on_hit') return `On hit: ${body}${note ? ` (${note})` : ''}`
  if (effect.trigger === 'passive') return `Passive: ${body}${note ? ` (${note})` : ''}`
  return `${body}${note ? ` (${note})` : ''}`
}
