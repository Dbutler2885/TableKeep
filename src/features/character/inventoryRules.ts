// Pure inventory rules — template application, parsing, class restrictions.
// No React, no Firebase.

import type {
  CharacterWeaponItem,
  CharacterArmourItem,
} from '../../types/app'
import { weaponCatalogById } from './weaponCatalog'
import { armourCatalogById } from './armourCatalog'

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

export const parseDamageDice = (value: string): { damageDiceCount: string; damageDiceSides: string } => {
  const match = value.trim().match(/^(\d+)\s*d\s*(\d+)$/i)
  if (!match) return { damageDiceCount: '', damageDiceSides: '' }
  return {
    damageDiceCount: match[1],
    damageDiceSides: match[2],
  }
}

export const parseRangeBands = (value: string): { rangeShort: string; rangeMedium: string; rangeLong: string } => {
  const parts = value
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (parts.length !== 3) return { rangeShort: '', rangeMedium: '', rangeLong: '' }
  const parsed = parts.map((part) => {
    const match = part.match(/(\d+)(?!.*\d)/)
    return match?.[1] ?? ''
  })
  if (parsed.some((part) => part.length === 0)) return { rangeShort: '', rangeMedium: '', rangeLong: '' }
  return {
    rangeShort: parsed[0],
    rangeMedium: parsed[1],
    rangeLong: parsed[2],
  }
}

export const parseArmourTemplateValues = (acValue: string): { armourClass: string; shieldMod: string; magicMod: string } => {
  const trimmed = acValue.trim()
  const numeric = trimmed.match(/^-?\d+$/)
  if (numeric) return { armourClass: trimmed, shieldMod: '', magicMod: '' }

  const bonus = trimmed.match(/^([+-]?\d+)\s*bonus$/i)
  if (bonus) {
    const parsed = Number.parseInt(bonus[1], 10)
    return {
      armourClass: '',
      shieldMod: Number.isNaN(parsed) ? '' : String(-parsed),
      magicMod: '',
    }
  }

  return { armourClass: '', shieldMod: '', magicMod: '' }
}

export const armourTypeFromTemplateId = (templateId: string): 'body' | 'shield' =>
  armourCatalogById[templateId]?.armourType ?? 'body'

export const resolveArmourType = (item: CharacterArmourItem): 'body' | 'shield' =>
  item.armourType === 'shield' ? 'shield' : armourTypeFromTemplateId(item.typeId)

export const normalizeTemplateArmourValues = (
  values: { armourClass: string; shieldMod: string; magicMod: string },
  armourType: 'body' | 'shield',
): { armourClass: string; shieldMod: string; magicMod: string } => {
  if (armourType === 'shield') {
    return { armourClass: '', shieldMod: values.shieldMod, magicMod: '' }
  }
  return { armourClass: values.armourClass, shieldMod: '', magicMod: values.magicMod }
}

// ---------------------------------------------------------------------------
// Template application
// ---------------------------------------------------------------------------

export const applyWeaponTemplateToItem = (item: CharacterWeaponItem, templateId: string): CharacterWeaponItem => {
  if (!templateId || templateId === 'custom') {
    return {
      ...item,
      typeId: 'custom',
      typeName: item.typeName,
      damageDiceCount: '',
      damageDiceSides: '',
      rangeShort: '',
      rangeMedium: '',
      rangeLong: '',
      slow: false,
      twoHanded: false,
    }
  }
  const template = weaponCatalogById[templateId]
  if (!template) return item
  const parsedDamage = parseDamageDice(template.damage)
  return {
    ...item,
    typeId: template.id,
    typeName: template.name,
    costGp: Number.parseInt(template.costGp, 10) || 0,
    ...parsedDamage,
    ...parseRangeBands(template.range),
    slow: template.qualities.includes('Slow'),
    twoHanded: template.twoHanded,
  }
}

export const applyArmourTemplateToItem = (item: CharacterArmourItem, templateId: string): CharacterArmourItem => {
  if (!templateId || templateId === 'custom') {
    return { ...item, typeId: 'custom', typeName: item.typeName }
  }
  const template = armourCatalogById[templateId]
  if (!template) return item
  const parsedArmour = parseArmourTemplateValues(template.ac)
  const templateArmourType = armourTypeFromTemplateId(template.id)
  const normalized = normalizeTemplateArmourValues(parsedArmour, templateArmourType)
  return {
    ...item,
    typeId: template.id,
    typeName: template.name,
    costGp: template.costGp,
    armourType: templateArmourType,
    ...normalized,
  }
}

// ---------------------------------------------------------------------------
// Class restriction checks
// ---------------------------------------------------------------------------

export const isWeaponTemplateAllowedForClass = (weaponId: string, className: string) => {
  if (!weaponId || weaponId === 'custom') return true
  const template = weaponCatalogById[weaponId]
  if (!template) return true
  if (className === 'Dwarf') {
    const dwarfDisallowedLargeWeapons = new Set(['long-bow', 'pole-arm', 'two-handed-sword'])
    return !dwarfDisallowedLargeWeapons.has(template.id)
  }
  if (className === 'Cleric') return template.qualities.includes('Blunt')
  if (className === 'Magic-User') return template.id === 'dagger'
  if (className === 'Halfling') return !template.twoHanded
  return true
}

export const isArmourTemplateAllowedForClass = (armourId: string, className: string) => {
  if (className === 'Thief') return armourId === 'leather'
  if (className === 'Magic-User') return false
  if (!armourId || armourId === 'custom') return true
  return !!armourCatalogById[armourId]
}
