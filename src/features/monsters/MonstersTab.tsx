import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronUp, ImagePlus, Plus, Shield, UserRound } from 'lucide-react'
import type { Role } from '../../types/app'
import { monsterRulesets, type MonsterRulesetId } from './rulesets'
import { TokenIconEditor, TokenPawnPreview, type TokenIconConfig } from '../tokens/TokenIconEditor'

type SaveType = 'death_poison' | 'wands' | 'paralysis_petrification' | 'breath' | 'spells' | 'custom'
type OnHitEffectClass = 'save' | 'effect'
type AttackClass = 'melee' | 'missile' | 'spell' | 'special'
type AttackType =
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
type DieType = 'd2' | 'd3' | 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100'

type AbilityMode = 'text' | 'rules'
type AbilityTrigger = 'manual' | 'on_attack_hit' | 'on_turn_start' | 'on_exposed_to_gaze'
type PrimitiveType =
  | 'roll_attack'
  | 'roll_damage'
  | 'request_saving_throw'
  | 'apply_condition'
  | 'prompt_gm_choice'

type PrimitiveStep = {
  id: string
  type: PrimitiveType
  params: Record<string, string>
}

type MonsterAbility = {
  id: string
  name: string
  mode: AbilityMode
  text: string
  trigger: AbilityTrigger
  steps: PrimitiveStep[]
}

type PrimitiveFieldDef = {
  key: string
  label: string
  placeholder?: string
}

type PrimitiveDef = {
  type: PrimitiveType
  label: string
  fields: PrimitiveFieldDef[]
}

type OnHitEffect = {
  id: string
  effectClass: OnHitEffectClass
  effectType: string
  customType: string
  notes: string
}

type MonsterAttack = {
  id: string
  count: string
  attackClass: AttackClass
  attackType: AttackType
  customAttackType: string
  damageDiceCount: string
  damageDie: DieType | ''
  customDamageDie: string
  attackBonus: string
  onHitEffects: OnHitEffect[]
  notes: string
}

type WeakSpot = {
  id: string
  label: string
  toHitModifier: string
}

type ImmunityEntry = {
  id: string
  text: string
}

type UnusualTraitKey = 'weak_spots' | 'immunities'

type MonsterRecord = {
  id: string
  rulesetId: MonsterRulesetId
  name: string
  portraitUrl: string | null
  portraitFocusX: number
  portraitFocusY: number
  shortDescription: string
  unusualTraits: UnusualTraitKey[]
  immunities: ImmunityEntry[]
  weakSpots: WeakSpot[]
  attacks: MonsterAttack[]
  abilities: MonsterAbility[]
  notes: string
  stats: Record<string, string>
  tokenIcon: TokenIconConfig
}

type MonstersTabProps = {
  role: Role | null
}

const defaultTokenIcon: TokenIconConfig = {
  icon: 'pawn',
  color: '#bf2f2a',
  size: 34,
}

const saveTypeOptions: Array<{ value: SaveType; label: string }> = [
  { value: 'death_poison', label: 'Death/Poison (D)' },
  { value: 'wands', label: 'Wands (W)' },
  { value: 'paralysis_petrification', label: 'Paralysis/Petrification (P)' },
  { value: 'breath', label: 'Breath (B)' },
  { value: 'spells', label: 'Spells/Rods/Staves (S)' },
  { value: 'custom', label: 'Custom' },
]

const onHitEffectClassOptions: Array<{ value: OnHitEffectClass; label: string }> = [
  { value: 'save', label: 'Save' },
  { value: 'effect', label: 'Effect' },
]

const onHitEffectTypeOptions: Array<{ value: string; label: string }> = [
  { value: 'extra_damage', label: 'Extra Damage' },
  { value: 'poison', label: 'Poison' },
  { value: 'petrify', label: 'Petrify' },
  { value: 'paralyze', label: 'Paralyze' },
  { value: 'stun', label: 'Stun' },
  { value: 'blind', label: 'Blind' },
  { value: 'drain', label: 'Drain' },
  { value: 'knockdown', label: 'Knockdown' },
  { value: 'grapple', label: 'Grapple' },
  { value: 'custom', label: 'Custom' },
]

const attackTypeOptions: Array<{ value: AttackType; label: string }> = [
  { value: 'bite', label: 'Bite' },
  { value: 'claw', label: 'Claw' },
  { value: 'slam', label: 'Slam' },
  { value: 'weapon', label: 'Weapon' },
  { value: 'touch', label: 'Touch' },
  { value: 'bow', label: 'Bow' },
  { value: 'crossbow', label: 'Crossbow' },
  { value: 'thrown', label: 'Thrown' },
  { value: 'sling', label: 'Sling' },
  { value: 'spell', label: 'Spell' },
  { value: 'spell_like', label: 'Spell-like' },
  { value: 'breath_cone', label: 'Breath (Cone)' },
  { value: 'breath_line', label: 'Breath (Line)' },
  { value: 'gaze', label: 'Gaze' },
  { value: 'aura', label: 'Aura' },
  { value: 'swallow', label: 'Swallow' },
  { value: 'constrict', label: 'Constrict' },
  { value: 'custom', label: 'Custom' },
]

const attackClassOptions: Array<{ value: AttackClass; label: string }> = [
  { value: 'melee', label: 'Melee' },
  { value: 'missile', label: 'Missile' },
  { value: 'spell', label: 'Spell' },
  { value: 'special', label: 'Special' },
]

const attackTypeByClass: Record<AttackClass, AttackType[]> = {
  melee: ['bite', 'claw', 'slam', 'weapon', 'touch', 'custom'],
  missile: ['bow', 'crossbow', 'thrown', 'sling', 'custom'],
  spell: ['spell', 'spell_like', 'breath_cone', 'breath_line', 'custom'],
  special: ['gaze', 'aura', 'swallow', 'constrict', 'custom'],
}

const dieTypeOptions: Array<{ value: DieType; label: string }> = [
  { value: 'd2', label: 'd2' },
  { value: 'd3', label: 'd3' },
  { value: 'd4', label: 'd4' },
  { value: 'd6', label: 'd6' },
  { value: 'd8', label: 'd8' },
  { value: 'd10', label: 'd10' },
  { value: 'd12', label: 'd12' },
  { value: 'd20', label: 'd20' },
  { value: 'd100', label: 'd100' },
]

const abilityTriggerOptions: Array<{ value: AbilityTrigger; label: string }> = [
  { value: 'manual', label: 'Manual (GM click)' },
  { value: 'on_attack_hit', label: 'On attack hit' },
  { value: 'on_turn_start', label: 'On turn start' },
  { value: 'on_exposed_to_gaze', label: 'On gaze exposure' },
]

const primitiveDefinitions: PrimitiveDef[] = [
  {
    type: 'roll_attack',
    label: 'Roll Attack',
    fields: [
      { key: 'bonus', label: 'Attack Bonus', placeholder: '+0' },
      { key: 'target', label: 'Target', placeholder: 'selected_target' },
    ],
  },
  {
    type: 'roll_damage',
    label: 'Roll Damage',
    fields: [
      { key: 'dice', label: 'Damage Dice', placeholder: '1d6' },
      { key: 'damageType', label: 'Type', placeholder: 'slashing' },
    ],
  },
  {
    type: 'request_saving_throw',
    label: 'Request Saving Throw',
    fields: [
      { key: 'saveType', label: 'Save Type', placeholder: 'paralysis/petrification' },
      { key: 'dcHint', label: 'DC Hint', placeholder: 'use monster HD' },
      { key: 'onFail', label: 'On Fail', placeholder: 'apply_condition:petrified' },
    ],
  },
  {
    type: 'apply_condition',
    label: 'Apply Condition',
    fields: [
      { key: 'condition', label: 'Condition', placeholder: 'petrified' },
      { key: 'duration', label: 'Duration', placeholder: 'permanent' },
      { key: 'target', label: 'Target', placeholder: 'last_failed_save_target' },
    ],
  },
  {
    type: 'prompt_gm_choice',
    label: 'Prompt GM Choice',
    fields: [
      { key: 'prompt', label: 'Prompt', placeholder: 'Who is exposed to gaze?' },
      { key: 'options', label: 'Options', placeholder: 'avert_eyes,mirror,direct_view' },
    ],
  },
]

const primitiveByType = Object.fromEntries(
  primitiveDefinitions.map((entry) => [entry.type, entry]),
) as Record<PrimitiveType, PrimitiveDef>


const newAbility = (mode: AbilityMode): MonsterAbility => ({
  id: crypto.randomUUID(),
  name: mode === 'text' ? 'Special Note' : 'New Ability',
  mode,
  text: '',
  trigger: 'manual',
  steps: [],
})

const newOnHitEffect = (): OnHitEffect => ({
  id: crypto.randomUUID(),
  effectClass: 'save',
  effectType: 'petrify',
  customType: '',
  notes: '',
})

const newAttack = (): MonsterAttack => ({
  id: crypto.randomUUID(),
  count: '1',
  attackClass: 'melee',
  attackType: 'weapon',
  customAttackType: '',
  damageDiceCount: '1',
  damageDie: 'd6',
  customDamageDie: '',
  attackBonus: '',
  onHitEffects: [],
  notes: '',
})

const newStep = (type: PrimitiveType = 'prompt_gm_choice'): PrimitiveStep => {
  const def = primitiveByType[type]
  return {
    id: crypto.randomUUID(),
    type,
    params: Object.fromEntries(def.fields.map((field) => [field.key, ''])),
  }
}

const newWeakSpot = (): WeakSpot => ({
  id: crypto.randomUUID(),
  label: '',
  toHitModifier: '',
})

const immunityOptions = [
  'Non-magical weapons',
  'Poison',
  'Sleep',
  'Charm',
  'Paralysis',
  'Cold',
  'Fire',
  'Lightning',
  'Custom',
] as const

const newImmunity = (text = 'Non-magical weapons'): ImmunityEntry => ({
  id: crypto.randomUUID(),
  text,
})

const unusualTraitOptions: Array<{ key: UnusualTraitKey; label: string }> = [
  { key: 'weak_spots', label: 'Weak Spots' },
  { key: 'immunities', label: 'Immunities' },
]

const newMonsterTemplate = (rulesetId: MonsterRulesetId): MonsterRecord => {
  const ruleset = monsterRulesets[rulesetId]
  const stats = Object.fromEntries(ruleset.fields.map((field) => [field.key, '']))

  return {
    id: crypto.randomUUID(),
    rulesetId,
    name: 'New Monster',
    portraitUrl: null,
    portraitFocusX: 50,
    portraitFocusY: 50,
    shortDescription: '',
    unusualTraits: [],
    immunities: [],
    weakSpots: [newWeakSpot()],
    attacks: [newAttack()],
    abilities: [newAbility('text')],
    notes: '',
    stats,
    tokenIcon: defaultTokenIcon,
  }
}

export function MonstersTab({ role }: MonstersTabProps) {
  const [monsters, setMonsters] = useState<MonsterRecord[]>([])
  const [selectedMonsterId, setSelectedMonsterId] = useState<string | null>(null)
  const [tokenEditorOpen, setTokenEditorOpen] = useState(false)
  const [portraitError, setPortraitError] = useState<string | null>(null)
  const [portraitDraft, setPortraitDraft] = useState<{
    imageUrl: string
    focusX: number
    focusY: number
  } | null>(null)
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= 900)
  const [mobileMonsterView, setMobileMonsterView] = useState<'list' | 'detail'>('list')

  const canEdit = role === 'gm'
  const sortedMonsters = useMemo(() => [...monsters].sort((a, b) => a.name.localeCompare(b.name)), [monsters])

  const selectedMonster = sortedMonsters.find((monster) => monster.id === selectedMonsterId) ?? null
  const selectedMonsterTokenAssets =
    selectedMonster?.tokenIcon.customImageUrl
      ? [
          {
            id: 'monster-custom',
            name: selectedMonster.name.trim() || selectedMonster.tokenIcon.customImageName || 'Custom Icon',
            imageUrl: selectedMonster.tokenIcon.customImageUrl,
          },
        ]
      : []
  const selectedMonsterTokenAssetId = selectedMonster?.tokenIcon.icon === 'custom' ? 'monster-custom' : ''
  const selectedMonsterTokenImageUrl = selectedMonster?.tokenIcon.customImageUrl ?? ''
  const orderedUnusualTraits = selectedMonster ? [...selectedMonster.unusualTraits].reverse() : []
  const splitUnusualTraits = orderedUnusualTraits.length > 1
  const selectedRuleset = selectedMonster ? monsterRulesets[selectedMonster.rulesetId] : monsterRulesets.ose
  const wideFieldKeys = new Set(['att', 'dmg', 'na'])
  const combatCoreKeys = ['ac', 'hd', 'thaco', 'mv', 'ml', 'xp']
  const savingThrowKeys = ['sv_d', 'sv_w', 'sv_p', 'sv_b', 'sv_s']
  const encounterTreasureKeys = ['na', 'tt']

  const renderStatField = (key: string) => {
    const field = selectedRuleset.fields.find((entry) => entry.key === key)
    if (!field || !selectedMonster) return null
    return (
      <label key={field.key} className={wideFieldKeys.has(field.key) ? 'monster-stat-field wide' : 'monster-stat-field'}>
        {field.shortLabel}
        <input
          type="text"
          value={selectedMonster.stats[field.key] ?? ''}
          placeholder={field.placeholder}
          onChange={(event) => updateSelectedStat(field.key, event.target.value)}
          aria-label={field.label}
        />
      </label>
    )
  }

  useEffect(() => {
    const updateMobileState = () => {
      const mobile = window.innerWidth <= 900
      setIsMobile(mobile)
      if (!mobile) {
        setMobileMonsterView('list')
      }
    }

    updateMobileState()
    window.addEventListener('resize', updateMobileState)
    return () => window.removeEventListener('resize', updateMobileState)
  }, [])

  const showListPane = !isMobile || mobileMonsterView === 'list'
  const showDetailPane = !isMobile || mobileMonsterView === 'detail'

  const addMonster = () => {
    const nextMonster = newMonsterTemplate('ose')
    setMonsters((current) => [nextMonster, ...current])
    setSelectedMonsterId(nextMonster.id)
    setTokenEditorOpen(false)
    setPortraitError(null)
    if (isMobile) setMobileMonsterView('detail')
  }

  const updateSelectedMonster = (updates: Partial<MonsterRecord>) => {
    if (!selectedMonsterId) return
    setMonsters((current) =>
      current.map((monster) => (monster.id === selectedMonsterId ? { ...monster, ...updates } : monster)),
    )
  }

  const updateSelectedStat = (key: string, value: string) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      stats: {
        ...selectedMonster.stats,
        [key]: value,
      },
    })
  }

  const addAttack = () => {
    if (!selectedMonster) return
    updateSelectedMonster({
      attacks: [...selectedMonster.attacks, newAttack()],
    })
  }

  const addWeakSpot = () => {
    if (!selectedMonster) return
    updateSelectedMonster({
      weakSpots: [...selectedMonster.weakSpots, newWeakSpot()],
    })
  }

  const removeWeakSpot = (weakSpotId: string) => {
    if (!selectedMonster) return
    const nextWeakSpots = selectedMonster.weakSpots.filter((entry) => entry.id !== weakSpotId)
    updateSelectedMonster({
      weakSpots: nextWeakSpots,
      unusualTraits:
        nextWeakSpots.length === 0
          ? selectedMonster.unusualTraits.filter((entry) => entry !== 'weak_spots')
          : selectedMonster.unusualTraits,
    })
  }

  const updateWeakSpot = (weakSpotId: string, updates: Partial<WeakSpot>) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      weakSpots: selectedMonster.weakSpots.map((entry) =>
        entry.id === weakSpotId ? { ...entry, ...updates } : entry,
      ),
    })
  }

  const addImmunity = () => {
    if (!selectedMonster) return
    updateSelectedMonster({
      immunities: [...selectedMonster.immunities, newImmunity()],
      unusualTraits: selectedMonster.unusualTraits.includes('immunities')
        ? selectedMonster.unusualTraits
        : [...selectedMonster.unusualTraits, 'immunities'],
    })
  }

  const updateImmunity = (immunityId: string, text: string) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      immunities: selectedMonster.immunities.map((entry) => (entry.id === immunityId ? { ...entry, text } : entry)),
    })
  }

  const removeImmunity = (immunityId: string) => {
    if (!selectedMonster) return
    const next = selectedMonster.immunities.filter((entry) => entry.id !== immunityId)
    updateSelectedMonster({
      immunities: next,
      unusualTraits:
        next.length === 0
          ? selectedMonster.unusualTraits.filter((entry) => entry !== 'immunities')
          : selectedMonster.unusualTraits,
    })
  }

  const addUnusualTrait = (trait: UnusualTraitKey) => {
    if (!selectedMonster) return
    if (selectedMonster.unusualTraits.includes(trait)) return
    updateSelectedMonster({
      unusualTraits: [...selectedMonster.unusualTraits, trait],
      weakSpots: trait === 'weak_spots' && selectedMonster.weakSpots.length === 0 ? [newWeakSpot()] : selectedMonster.weakSpots,
      immunities: trait === 'immunities' && selectedMonster.immunities.length === 0 ? [newImmunity()] : selectedMonster.immunities,
    })
  }

  const removeAttack = (attackId: string) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      attacks: selectedMonster.attacks.filter((attack) => attack.id !== attackId),
    })
  }

  const updateAttack = (attackId: string, updates: Partial<MonsterAttack>) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      attacks: selectedMonster.attacks.map((attack) =>
        attack.id === attackId ? { ...attack, ...updates } : attack,
      ),
    })
  }

  const updateAttackClass = (attackId: string, nextClass: AttackClass) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      attacks: selectedMonster.attacks.map((attack) => {
        if (attack.id !== attackId) return attack
        const allowed = attackTypeByClass[nextClass]
        const nextType = allowed.includes(attack.attackType) ? attack.attackType : allowed[0]
        return {
          ...attack,
          attackClass: nextClass,
          attackType: nextType,
          customAttackType: nextType === 'custom' ? attack.customAttackType : '',
        }
      }),
    })
  }

  const addOnHitEffect = (attackId: string) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      attacks: selectedMonster.attacks.map((attack) =>
        attack.id === attackId ? { ...attack, onHitEffects: [...attack.onHitEffects, newOnHitEffect()] } : attack,
      ),
    })
  }

  const removeOnHitEffect = (attackId: string, effectId: string) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      attacks: selectedMonster.attacks.map((attack) =>
        attack.id === attackId
          ? { ...attack, onHitEffects: attack.onHitEffects.filter((effect) => effect.id !== effectId) }
          : attack,
      ),
    })
  }

  const updateOnHitEffect = (attackId: string, effectId: string, updates: Partial<OnHitEffect>) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      attacks: selectedMonster.attacks.map((attack) =>
        attack.id === attackId
          ? {
              ...attack,
              onHitEffects: attack.onHitEffects.map((effect) =>
                effect.id === effectId ? { ...effect, ...updates } : effect,
              ),
            }
          : attack,
      ),
    })
  }

  const loadBasiliskExample = () => {
    if (!selectedMonster) return
    updateSelectedMonster({
      name: 'Basilisk',
      shortDescription:
        "10' long, serpentine lizard. Unintelligent, but highly magical. Dwells in caverns and twisted brambles.",
      unusualTraits: ['weak_spots', 'immunities'],
      immunities: [newImmunity('Immune to normal weapons except where scales are absent.')],
      weakSpots: [
        { id: crypto.randomUUID(), label: 'Mouth', toHitModifier: '-4' },
        { id: crypto.randomUUID(), label: 'Eyes', toHitModifier: '-6' },
      ],
      stats: {
        ...selectedMonster.stats,
        ac: '4 [15]',
        hd: '6+1** (28hp)',
        att: '1 x bite',
        dmg: '1d10 + petrification',
        thaco: '13 [+6]',
        mv: "60' (20')",
        sv_d: '10',
        sv_w: '11',
        sv_p: '12',
        sv_b: '13',
        sv_s: '14',
        ml: '9',
        al: 'Neutrality',
        xp: '950',
        na: '1d6 (1d6)',
        tt: 'F',
      },
      attacks: [
        {
          id: crypto.randomUUID(),
          count: '1',
          attackClass: 'melee',
          attackType: 'bite',
          customAttackType: '',
          damageDiceCount: '1',
          damageDie: 'd10',
          customDamageDie: '',
          attackBonus: '+0',
          onHitEffects: [
            {
              id: crypto.randomUUID(),
              effectClass: 'save',
              effectType: 'petrify',
              customType: '',
              notes: 'On hit, target saves or is turned to stone.',
            },
          ],
          notes: 'Primary bite attack includes petrification rider.',
        },
      ],
      abilities: [
        {
          id: crypto.randomUUID(),
          name: 'Surprise',
          mode: 'text',
          text: 'Characters surprised by a basilisk meet its gaze.',
          trigger: 'manual',
          steps: [],
        },
        {
          id: crypto.randomUUID(),
          name: 'Petrifying Gaze',
          mode: 'rules',
          trigger: 'on_exposed_to_gaze',
          text: '',
          steps: [
            {
              id: crypto.randomUUID(),
              type: 'prompt_gm_choice',
              params: {
                prompt: 'Who is exposed to gaze? Any avert eyes or mirror use?',
                options: 'direct_view,avert_eyes,mirror',
              },
            },
            {
              id: crypto.randomUUID(),
              type: 'request_saving_throw',
              params: {
                saveType: 'paralysis/petrification',
                dcHint: 'use monster HD',
                onFail: 'apply_condition:petrified',
              },
            },
          ],
        },
        {
          id: crypto.randomUUID(),
          name: 'Mirrors',
          mode: 'text',
          text: 'Mirror fighting imposes -1 to attack; if it sees its own reflection (2-in-6), basilisk saves or is petrified.',
          trigger: 'manual',
          steps: [],
        },
      ],
    })
  }

  const addAbility = (mode: AbilityMode) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      abilities: [...selectedMonster.abilities, newAbility(mode)],
    })
  }

  const removeAbility = (abilityId: string) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      abilities: selectedMonster.abilities.filter((ability) => ability.id !== abilityId),
    })
  }

  const updateAbility = (abilityId: string, updates: Partial<MonsterAbility>) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      abilities: selectedMonster.abilities.map((ability) =>
        ability.id === abilityId ? { ...ability, ...updates } : ability,
      ),
    })
  }

  const addAbilityStep = (abilityId: string, type: PrimitiveType = 'prompt_gm_choice') => {
    if (!selectedMonster) return
    updateSelectedMonster({
      abilities: selectedMonster.abilities.map((ability) =>
        ability.id === abilityId ? { ...ability, steps: [...ability.steps, newStep(type)] } : ability,
      ),
    })
  }

  const removeAbilityStep = (abilityId: string, stepId: string) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      abilities: selectedMonster.abilities.map((ability) =>
        ability.id === abilityId
          ? { ...ability, steps: ability.steps.filter((step) => step.id !== stepId) }
          : ability,
      ),
    })
  }

  const updateAbilityStepType = (abilityId: string, stepId: string, type: PrimitiveType) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      abilities: selectedMonster.abilities.map((ability) =>
        ability.id === abilityId
          ? {
              ...ability,
              steps: ability.steps.map((step) => (step.id === stepId ? newStep(type) : step)),
            }
          : ability,
      ),
    })
  }

  const updateAbilityStepParam = (abilityId: string, stepId: string, key: string, value: string) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      abilities: selectedMonster.abilities.map((ability) =>
        ability.id === abilityId
          ? {
              ...ability,
              steps: ability.steps.map((step) =>
                step.id === stepId
                  ? {
                      ...step,
                      params: {
                        ...step.params,
                        [key]: value,
                      },
                    }
                  : step,
              ),
            }
          : ability,
      ),
    })
  }

  const monsterStatline = (monster: MonsterRecord) => {
    const ruleset = monsterRulesets[monster.rulesetId]
    return ruleset.statlineOrder
      .map((key) => {
        const field = ruleset.fields.find((entry) => entry.key === key)
        if (!field) return ''
        const value = monster.stats[key]?.trim()
        return value ? `${field.shortLabel} ${value}` : ''
      })
      .filter(Boolean)
      .join(', ')
  }

  const handlePortraitFile = (file: File | null) => {
    if (!file || !selectedMonster) return
    if (!file.type.startsWith('image/')) {
      setPortraitError('Please choose an image file.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPortraitDraft({ imageUrl: reader.result, focusX: selectedMonster.portraitFocusX, focusY: selectedMonster.portraitFocusY })
        setPortraitError(null)
      }
    }
    reader.readAsDataURL(file)
  }

  const applyPortraitDraft = () => {
    if (!portraitDraft) return
    updateSelectedMonster({
      portraitUrl: portraitDraft.imageUrl,
      portraitFocusX: portraitDraft.focusX,
      portraitFocusY: portraitDraft.focusY,
    })
    setPortraitDraft(null)
  }

  const portraitObjectPosition = (monster: MonsterRecord) =>
    `${monster.portraitFocusX ?? 50}% ${monster.portraitFocusY ?? 50}%`

  const handleMonsterTokenImageUpload = (file: File, assetName?: string) => {
    if (!selectedMonster) return
    if (!file.type.startsWith('image/')) {
      setPortraitError('Please choose an image file.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      updateSelectedMonster({
        tokenIcon: {
          ...selectedMonster.tokenIcon,
          icon: 'custom',
          customImageUrl: reader.result,
          customImageName: assetName?.trim() || selectedMonster.name.trim() || file.name.replace(/\.[^/.]+$/, ''),
        },
      })
      setPortraitError(null)
    }
    reader.readAsDataURL(file)
  }

  if (!canEdit) {
    return (
      <div className="stack-tight">
        <h2>Monsters</h2>
        <p>Only the GM can create and edit monsters.</p>
      </div>
    )
  }

  return (
    <div className="maps-layout monsters-layout">
      {showListPane ? (
        <aside className="maps-sidebar monsters-sidebar">
          <div className="maps-sidebar-header">
            <h2>Monsters</h2>
            <button type="button" className="monster-add-btn" onClick={addMonster} aria-label="Add monster">
              <Plus size={16} />
            </button>
          </div>

          {sortedMonsters.length === 0 ? <p>No monsters yet. Click + to create one.</p> : null}

          <div className="monster-list-grid">
            {sortedMonsters.map((monster) => (
              <button
                key={monster.id}
                type="button"
                className={monster.id === selectedMonsterId ? 'monster-list-item active' : 'monster-list-item'}
                onClick={() => {
                  setSelectedMonsterId(monster.id)
                  if (isMobile) setMobileMonsterView('detail')
                  setPortraitError(null)
                  setTokenEditorOpen(false)
                }}
              >
                <div className="monster-card-portrait">
                  {monster.portraitUrl ? (
                    <img
                      src={monster.portraitUrl}
                      alt={`${monster.name} portrait`}
                      className="monster-portrait"
                      style={{ objectPosition: portraitObjectPosition(monster) }}
                    />
                  ) : (
                    <div className="monster-portrait-empty small">
                      <UserRound size={14} />
                    </div>
                  )}
                </div>

                <div className="monster-card-main">
                  <h4>{monster.name || 'Unnamed Monster'}</h4>
                  <p className="monster-card-statline">{monsterStatline(monster) || 'No stats yet'}</p>
                  <div className="monster-card-token-row">
                    <Shield size={14} />
                    <TokenPawnPreview
                      color={monster.tokenIcon.color}
                      size={18}
                      imageUrl={monster.tokenIcon.icon === 'custom' ? monster.tokenIcon.customImageUrl : undefined}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>
      ) : null}

      {showDetailPane ? (
        <div className="monsters-detail">
          <div className="monsters-detail-inner">
            {isMobile && selectedMonster ? (
              <button
                type="button"
                className="back-link monster-mobile-back"
                onClick={() => setMobileMonsterView('list')}
                aria-label="Back to monster list"
              >
                <ChevronLeft size={16} />
              </button>
            ) : null}

            {!selectedMonster ? (
              <p>Select a monster from the list or click + to create one.</p>
            ) : (
              <div className="monster-editor-grid">
              <div className="monster-editor-header-row">
                <label>
                  Ruleset
                  <select value={selectedMonster.rulesetId} disabled>
                    <option value="ose">Old-School Essentials</option>
                  </select>
                </label>
                <button type="button" onClick={loadBasiliskExample}>
                  Load Basilisk Example
                </button>
              </div>

              <div className="monster-top-row">
                <div className="monster-media-column">
                  <div className="monster-portrait-row">
                    <div className="monster-portrait-frame">
                      {selectedMonster.portraitUrl ? (
                        <img
                          src={selectedMonster.portraitUrl}
                          alt="Monster portrait"
                          className="monster-portrait"
                          style={{ objectPosition: portraitObjectPosition(selectedMonster) }}
                        />
                      ) : null}
                      {!selectedMonster.portraitUrl ? (
                        <div className="monster-portrait-empty">
                          <ImagePlus size={18} />
                          <span>No portrait</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="monster-token-thumb-frame" aria-label="Selected token icon">
                      <TokenPawnPreview
                        color={selectedMonster.tokenIcon.color}
                        size={40}
                        imageUrl={selectedMonster.tokenIcon.icon === 'custom' ? selectedMonster.tokenIcon.customImageUrl : undefined}
                      />
                    </div>
                  </div>
                  <div className="monster-media-actions">
                    <label className="upload-trigger monster-upload-trigger monster-portrait-upload">
                      <ImagePlus size={16} />
                      Upload picture
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => handlePortraitFile(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    <button type="button" className="monster-token-editor-toggle" onClick={() => setTokenEditorOpen((current) => !current)}>
                      Token icon
                      {tokenEditorOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                  {tokenEditorOpen ? (
                    <TokenIconEditor
                      className="monster-token-icon-editor"
                      value={selectedMonster.tokenIcon}
                      disabled={!canEdit}
                      onChange={(tokenIcon) => updateSelectedMonster({ tokenIcon })}
                      tokenAssets={selectedMonsterTokenAssets}
                      selectedTokenAssetId={selectedMonsterTokenAssetId}
                      onSelectedTokenAssetIdChange={(assetId) =>
                        updateSelectedMonster({
                          tokenIcon: {
                            ...selectedMonster.tokenIcon,
                            icon: assetId ? 'custom' : 'pawn',
                          },
                        })
                      }
                      selectedTokenImageUrl={selectedMonsterTokenImageUrl}
                      uploadLabel="Upload Token Image"
                      onUploadTokenImage={handleMonsterTokenImageUpload}
                    />
                  ) : null}
                </div>
                <div className="monster-editor-fields monster-identity-column">
                  <h3 className="monster-section-title">Identity</h3>
                  <div className="monster-identity-grid">
                    <label className="monster-identity-name">
                      Monster Name
                      <input
                        type="text"
                        value={selectedMonster.name}
                        onChange={(event) => {
                          const nextName = event.target.value
                          const oldName = selectedMonster.name
                          const tokenIcon = selectedMonster.tokenIcon
                          const shouldSyncIconName =
                            tokenIcon.icon === 'custom' &&
                            (!!tokenIcon.customImageUrl &&
                              (!tokenIcon.customImageName || tokenIcon.customImageName === oldName))
                          updateSelectedMonster({
                            name: nextName,
                            tokenIcon: shouldSyncIconName
                              ? {
                                  ...tokenIcon,
                                  customImageName: nextName.trim(),
                                }
                              : tokenIcon,
                          })
                        }}
                        placeholder="Basilisk"
                      />
                    </label>

                    <label className="monster-identity-alignment">
                      Alignment
                      <select
                        value={
                          ['Law', 'Neutrality', 'Chaos'].includes(selectedMonster.stats.al ?? '')
                            ? selectedMonster.stats.al ?? 'Neutrality'
                            : 'Neutrality'
                        }
                        onChange={(event) => updateSelectedStat('al', event.target.value)}
                      >
                        <option value="Law">Law</option>
                        <option value="Neutrality">Neutrality</option>
                        <option value="Chaos">Chaos</option>
                      </select>
                    </label>

                    <label className="monster-identity-description">
                      Description
                      <input
                        type="text"
                        value={selectedMonster.shortDescription}
                        onChange={(event) => updateSelectedMonster({ shortDescription: event.target.value })}
                        placeholder="10' long serpentine lizard. Highly magical."
                      />
                    </label>
                  </div>
                </div>
              </div>

              {portraitError ? <p className="error">{portraitError}</p> : null}

              {monsterStatline(selectedMonster) ? (
                <div className="monster-statline-preview">{monsterStatline(selectedMonster)}</div>
              ) : null}

              <div className="monster-stat-layout">
                <section className="monster-stat-group monster-stat-group-combat">
                  <h4>Combat Core</h4>
                  <div className="monster-stats-grid-combat">{combatCoreKeys.map(renderStatField)}</div>
                </section>
                <section className="monster-stat-group">
                  <h4>Saving Throws</h4>
                  <div className="monster-stats-grid-saving">{savingThrowKeys.map(renderStatField)}</div>
                </section>
                <section className="monster-stat-group">
                  <h4>Encounter & Treasure</h4>
                  <div className="monster-stats-grid-encounter">{encounterTreasureKeys.map(renderStatField)}</div>
                </section>
              </div>

              <section className="monster-section-block">
                <h3 className="monster-section-title">Attacks</h3>
                <div className="monster-abilities-builder">
                  <div className="monster-abilities-toolbar">
                    <button type="button" onClick={addAttack}>
                      + Add Attack
                    </button>
                  </div>

                  <div className="monster-ability-list monster-attack-list">
                    {selectedMonster.attacks.map((attack, attackIndex) => (
                      <article key={attack.id} className="monster-ability-card">
                        <div className="monster-attack-header">
                          <strong>Attack {attackIndex + 1}</strong>
                          <button type="button" onClick={() => removeAttack(attack.id)}>
                            Remove
                          </button>
                        </div>

                        <div
                          className={`monster-attack-grid${attack.attackType === 'custom' ? ' has-custom' : ''}`}
                        >
                          <label className="monster-attack-field count">
                            #
                            <input
                              type="text"
                              value={attack.count}
                              onChange={(event) => updateAttack(attack.id, { count: event.target.value })}
                              placeholder="1"
                            />
                          </label>
                          <label className="monster-attack-field class">
                            Class
                            <select
                              value={attack.attackClass}
                              onChange={(event) => updateAttackClass(attack.id, event.target.value as AttackClass)}
                            >
                              {attackClassOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="monster-attack-field type">
                            Type
                            <select
                              value={attack.attackType}
                              onChange={(event) =>
                                updateAttack(attack.id, { attackType: event.target.value as AttackType })
                              }
                            >
                              {attackTypeByClass[attack.attackClass].map((value) => {
                                const option = attackTypeOptions.find((entry) => entry.value === value)
                                if (!option) return null
                                return (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                )
                              })}
                            </select>
                          </label>
                          {attack.attackType === 'custom' ? (
                            <label className="monster-attack-field type-custom">
                              Custom Type
                              <input
                                className="monster-custom-type-input"
                                type="text"
                                value={attack.customAttackType}
                                onChange={(event) =>
                                  updateAttack(attack.id, { customAttackType: event.target.value })
                                }
                                placeholder="Custom type"
                              />
                            </label>
                          ) : null}
                          <div className="monster-attack-field damage monster-damage-field">
                            <span className="monster-damage-label">Damage</span>
                            <div className="monster-damage-head">
                              <span>Die Count</span>
                              <span>Die Type</span>
                            </div>
                            <div className="monster-damage-row">
                              <select
                                className="monster-damage-count-select"
                                value={attack.damageDiceCount}
                                onChange={(event) => {
                                  const nextCount = event.target.value
                                  updateAttack(attack.id, {
                                    damageDiceCount: nextCount,
                                    damageDie: nextCount ? attack.damageDie || 'd6' : '',
                                    customDamageDie: nextCount ? attack.customDamageDie : '',
                                  })
                                }}
                                aria-label="Number of damage dice"
                              >
                                <option value="">⊘</option>
                                {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((count) => (
                                  <option key={count} value={count}>
                                    {count}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="monster-damage-type-select"
                                value={attack.damageDie}
                                onChange={(event) =>
                                  updateAttack(attack.id, { damageDie: event.target.value as DieType | '' })
                                }
                                aria-label="Damage die type"
                                disabled={!attack.damageDiceCount}
                              >
                                <option value="">⊘</option>
                                {dieTypeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <label className="monster-attack-field attack-bonus">
                            Atk +
                            <input
                              type="number"
                              step={1}
                              value={attack.attackBonus}
                              onChange={(event) => updateAttack(attack.id, { attackBonus: event.target.value })}
                              placeholder="0"
                            />
                          </label>
                        </div>

                        <label>
                          Attack Notes
                          <input
                            type="text"
                            value={attack.notes}
                            onChange={(event) => updateAttack(attack.id, { notes: event.target.value })}
                            placeholder="Any attack-specific caveat..."
                          />
                        </label>

                        <div className="monster-on-hit-section">
                          <div className="monster-on-hit-header">
                            <strong>On-Hit Effects</strong>
                            <button type="button" onClick={() => addOnHitEffect(attack.id)}>
                              + Effect
                            </button>
                          </div>

                          {attack.onHitEffects.length === 0 ? (
                            <p>No on-hit saves/effects.</p>
                          ) : (
                            <div className="monster-on-hit-list">
                              {attack.onHitEffects.map((effect, effectIndex) => (
                                <div key={effect.id} className="monster-step-card">
                                  <div className="monster-step-header monster-on-hit-step-header">
                                    <strong>Effect {effectIndex + 1}</strong>
                                    <button type="button" onClick={() => removeOnHitEffect(attack.id, effect.id)}>
                                      Remove
                                    </button>
                                  </div>

                                  <div className="monster-step-fields monster-on-hit-fields">
                                    <label className="monster-on-hit-class-field">
                                      Class
                                      <select
                                        value={effect.effectClass}
                                        onChange={(event) =>
                                          updateOnHitEffect(attack.id, effect.id, {
                                            effectClass: event.target.value as OnHitEffectClass,
                                          })
                                        }
                                      >
                                        {onHitEffectClassOptions.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>

                                    <label className="monster-on-hit-type-field">
                                      Type
                                      <select
                                        value={
                                          effect.effectClass === 'save'
                                            ? (saveTypeOptions.some((option) => option.value === effect.effectType)
                                                ? effect.effectType
                                                : 'custom')
                                            : effect.effectType
                                        }
                                        onChange={(event) =>
                                          updateOnHitEffect(attack.id, effect.id, {
                                            effectType: event.target.value,
                                          })
                                        }
                                      >
                                        {effect.effectClass === 'save'
                                          ? saveTypeOptions.map((option) => (
                                              <option key={option.value} value={option.value}>
                                                {option.label}
                                              </option>
                                            ))
                                          : onHitEffectTypeOptions.map((option) => (
                                              <option key={option.value} value={option.value}>
                                                {option.label}
                                              </option>
                                            ))}
                                      </select>
                                    </label>

                                    {effect.effectType === 'custom' ? (
                                      <label className="monster-on-hit-custom-type-field">
                                        Custom Type
                                        <input
                                          type="text"
                                          value={effect.customType}
                                          onChange={(event) =>
                                            updateOnHitEffect(attack.id, effect.id, {
                                              customType: event.target.value,
                                            })
                                          }
                                          placeholder="custom save/effect type"
                                        />
                                      </label>
                                    ) : null}

                                    <label className="monster-on-hit-notes-field">
                                      Effect Notes
                                      <input
                                        type="text"
                                        value={effect.notes}
                                        onChange={(event) =>
                                          updateOnHitEffect(attack.id, effect.id, { notes: event.target.value })
                                        }
                                        placeholder="Save vs petrification"
                                      />
                                    </label>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </section>

              <section className="monster-section-block">
                <div className="monster-unusual-traits-body">
                  <label className="monster-unusual-traits-picker">
                    Unusual Traits
                    <select
                      value=""
                      onChange={(event) => {
                        const nextTrait = event.target.value as UnusualTraitKey | ''
                        if (!nextTrait) return
                        addUnusualTrait(nextTrait)
                      }}
                    >
                      <option value="">Select trait...</option>
                      {unusualTraitOptions
                        .filter((option) => !selectedMonster.unusualTraits.includes(option.key))
                        .map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                    </select>
                  </label>

                  <div className={splitUnusualTraits ? 'monster-unusual-traits-widgets split' : 'monster-unusual-traits-widgets'}>
                    {orderedUnusualTraits.map((trait) =>
                      trait === 'immunities' ? (
                        <div key="immunities" className="monster-trait-widget">
                          <div className="monster-abilities-builder">
                            <div className="monster-abilities-toolbar">
                              <button type="button" onClick={addImmunity}>
                                + Add Immunity
                              </button>
                            </div>
                            <div className={splitUnusualTraits ? 'monster-ability-list monster-trait-list-split' : 'monster-ability-list monster-trait-list-full'}>
                              {selectedMonster.immunities.length === 0 ? <p>No immunities defined.</p> : null}
                              {selectedMonster.immunities.map((immunity, index) => (
                                <article key={immunity.id} className="monster-ability-card">
                                  <div className="monster-attack-header">
                                    <strong>Immunity {index + 1}</strong>
                                    <button type="button" onClick={() => removeImmunity(immunity.id)}>
                                      Remove
                                    </button>
                                  </div>
                                  <label>
                                    Rule
                                    <select
                                      value={immunityOptions.includes(immunity.text as (typeof immunityOptions)[number]) ? immunity.text : 'Custom'}
                                      onChange={(event) =>
                                        updateImmunity(
                                          immunity.id,
                                          event.target.value === 'Custom' ? '' : event.target.value,
                                        )
                                      }
                                    >
                                      {immunityOptions.map((option) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  {immunityOptions.includes(immunity.text as (typeof immunityOptions)[number]) ? null : (
                                    <label>
                                      Custom Immunity
                                      <input
                                        type="text"
                                        value={immunity.text}
                                        onChange={(event) => updateImmunity(immunity.id, event.target.value)}
                                        placeholder="Describe immunity..."
                                      />
                                    </label>
                                  )}
                                </article>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div key="weak_spots" className="monster-trait-widget">
                          <div className="monster-abilities-builder">
                            <div className="monster-abilities-toolbar">
                              <button type="button" onClick={addWeakSpot}>
                                + Add Weak Spot
                              </button>
                            </div>
                            <div className={splitUnusualTraits ? 'monster-ability-list monster-trait-list-split' : 'monster-ability-list monster-trait-list-full'}>
                              {selectedMonster.weakSpots.length === 0 ? <p>No weak spots defined.</p> : null}
                              {selectedMonster.weakSpots.map((weakSpot, index) => (
                                <article key={weakSpot.id} className="monster-ability-card">
                                  <div className="monster-attack-header">
                                    <strong>Weak Spot {index + 1}</strong>
                                    <button type="button" onClick={() => removeWeakSpot(weakSpot.id)}>
                                      Remove
                                    </button>
                                  </div>
                                  <div className="monster-weakspot-grid">
                                    <label>
                                      Spot
                                      <input
                                        type="text"
                                        value={weakSpot.label}
                                        onChange={(event) => updateWeakSpot(weakSpot.id, { label: event.target.value })}
                                        placeholder="Eyes"
                                      />
                                    </label>
                                    <label>
                                      To-Hit Mod
                                      <input
                                        type="number"
                                        step={1}
                                        value={weakSpot.toHitModifier}
                                        onChange={(event) =>
                                          updateWeakSpot(weakSpot.id, {
                                            toHitModifier: event.target.value,
                                          })
                                        }
                                        placeholder="-6"
                                      />
                                    </label>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </section>

              <section className="monster-section-block">
                <h3 className="monster-section-title">Abilities</h3>
                <div className="monster-abilities-builder">
                  <div className="monster-abilities-toolbar">
                    <button type="button" onClick={() => addAbility('text')}>
                      + Text Ability
                    </button>
                    <button type="button" onClick={() => addAbility('rules')}>
                      + Rules Ability
                    </button>
                  </div>

                  {selectedMonster.abilities.length === 0 ? (
                    <p>No abilities yet.</p>
                  ) : (
                    <div className="monster-ability-list">
                      {selectedMonster.abilities.map((ability) => (
                        <article key={ability.id} className="monster-ability-card">
                          <div className="monster-ability-header">
                            <input
                              type="text"
                              value={ability.name}
                              onChange={(event) => updateAbility(ability.id, { name: event.target.value })}
                              placeholder="Ability name"
                            />
                            <select
                              value={ability.mode}
                              onChange={(event) =>
                                updateAbility(ability.id, { mode: event.target.value as AbilityMode })
                              }
                            >
                              <option value="text">Text</option>
                              <option value="rules">Rules</option>
                            </select>
                            <button type="button" onClick={() => removeAbility(ability.id)}>
                              Remove
                            </button>
                          </div>

                          {ability.mode === 'text' ? (
                            <textarea
                              className="monster-notes"
                              value={ability.text}
                              onChange={(event) => updateAbility(ability.id, { text: event.target.value })}
                              placeholder="Trickery, leader, hoard, etc."
                            />
                          ) : (
                            <div className="monster-ability-rules">
                              <label>
                                Trigger
                                <select
                                  value={ability.trigger}
                                  onChange={(event) =>
                                    updateAbility(ability.id, { trigger: event.target.value as AbilityTrigger })
                                  }
                                >
                                  {abilityTriggerOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <div className="monster-ability-steps">
                                {ability.steps.map((step, index) => {
                                  const def = primitiveByType[step.type]
                                  return (
                                    <div key={step.id} className="monster-step-card">
                                      <div className="monster-step-header">
                                        <strong>Step {index + 1}</strong>
                                        <select
                                          value={step.type}
                                          onChange={(event) =>
                                            updateAbilityStepType(
                                              ability.id,
                                              step.id,
                                              event.target.value as PrimitiveType,
                                            )
                                          }
                                        >
                                          {primitiveDefinitions.map((primitive) => (
                                            <option key={primitive.type} value={primitive.type}>
                                              {primitive.label}
                                            </option>
                                          ))}
                                        </select>
                                        <button type="button" onClick={() => removeAbilityStep(ability.id, step.id)}>
                                          Remove
                                        </button>
                                      </div>

                                      <div className="monster-step-fields">
                                        {def.fields.map((field) => (
                                          <label key={`${step.id}-${field.key}`}>
                                            {field.label}
                                            <input
                                              type="text"
                                              value={step.params[field.key] ?? ''}
                                              placeholder={field.placeholder}
                                              onChange={(event) =>
                                                updateAbilityStepParam(
                                                  ability.id,
                                                  step.id,
                                                  field.key,
                                                  event.target.value,
                                                )
                                              }
                                            />
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>

                              <button type="button" onClick={() => addAbilityStep(ability.id)}>
                                + Add Step
                              </button>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <label>
                Notes
                <textarea
                  className="monster-notes"
                  value={selectedMonster.notes}
                  onChange={(event) => updateSelectedMonster({ notes: event.target.value })}
                  placeholder="Encounter notes, lair details, encounter script..."
                />
              </label>

            </div>
            )}
          </div>
        </div>
      ) : null}
      {portraitDraft && selectedMonster ? (
        <div className="monster-portrait-modal-overlay" role="dialog" aria-modal="true" aria-label="Adjust portrait fit">
          <div className="monster-portrait-modal">
            <h3>Adjust portrait fit</h3>
            <div className="monster-portrait-modal-preview">
              <img
                src={portraitDraft.imageUrl}
                alt=""
                className="monster-portrait"
                style={{ objectPosition: `${portraitDraft.focusX}% ${portraitDraft.focusY}%` }}
              />
            </div>
            <div className="monster-portrait-modal-controls">
              <label>
                Horizontal
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={portraitDraft.focusX}
                  onChange={(event) =>
                    setPortraitDraft((current) => (current ? { ...current, focusX: Number(event.target.value) } : current))
                  }
                />
              </label>
              <label>
                Vertical
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={portraitDraft.focusY}
                  onChange={(event) =>
                    setPortraitDraft((current) => (current ? { ...current, focusY: Number(event.target.value) } : current))
                  }
                />
              </label>
            </div>
            <div className="monster-portrait-modal-actions">
              <button type="button" onClick={() => setPortraitDraft(null)}>
                Cancel
              </button>
              <button type="button" onClick={applyPortraitDraft}>
                Save portrait
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
