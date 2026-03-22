import type { OseMonsterNormalizationDecision } from './oseMonsterTypes'

export const OSE_MONSTER_NORMALIZATION_DECISIONS: OseMonsterNormalizationDecision[] = [
  {
    rawMonsterId: 'ose-monster-acolyte',
    name: 'Acolyte',
    status: 'deferred',
    reason: 'Leader generation adds higher-level clerics and spell selection beyond the base stat block.',
  },
  {
    rawMonsterId: 'ose-monster-ape-white',
    name: 'Ape, White',
    status: 'normal',
    reason: 'Single straightforward stat block with only light behavioral notes.',
  },
  {
    rawMonsterId: 'ose-monster-bandit',
    name: 'Bandit',
    status: 'deferred',
    reason: 'Treasure and leader rules add conditional hoard logic beyond the main stat block.',
  },
  {
    rawMonsterId: 'ose-monster-basilisk',
    name: 'Basilisk',
    status: 'normal',
    reason: 'The current monster editor can carry the gaze and petrification rules as attacks and traits without needing a new structure.',
  },
  {
    rawMonsterId: 'ose-monster-bat',
    name: 'Bat',
    status: 'normal',
    reason: 'Multi-variant page, but each variant is still just a standard stat block plus notes.',
  },
  {
    rawMonsterId: 'ose-monster-bear',
    name: 'Bear',
    status: 'normal',
    reason: 'Multi-variant page, but each bear is still representable as stats plus simple traits.',
  },
  {
    rawMonsterId: 'ose-monster-beetle-giant',
    name: 'Beetle, Giant',
    status: 'normal',
    reason: 'Each variant fits the current monster model with attacks, traits, and notes.',
  },
  {
    rawMonsterId: 'ose-monster-berserker',
    name: 'Berserker',
    status: 'deferred',
    reason: 'Treasure type exception adds conditional hoard handling beyond the base stat block.',
  },
  {
    rawMonsterId: 'ose-monster-black-pudding',
    name: 'Black Pudding',
    status: 'normal',
    reason: 'Division and erosion rules are strong mechanics, but they still fit as attack and trait text in the current editor.',
  },
  {
    rawMonsterId: 'ose-monster-blink-dog',
    name: 'Blink Dog',
    status: 'normal',
    reason: 'Single stat block with special movement and behavior notes that fit the current editor.',
  },
]
