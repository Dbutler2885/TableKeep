import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Plus, Shield, Trash2, UserRound, X } from 'lucide-react'
import {
  collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import type { Role } from '../../types/app'
import { monsterRulesets, type MonsterRulesetId } from './rulesets'
import { TokenPawnPreview, type TokenIconConfig } from '../tokens/TokenIconEditor'
import { EntityMediaEditor } from '../common/EntityMediaEditor'

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

type MonsterTrait = {
  id: string
  name: string
  trigger: string
  saveType: SaveType | ''
  effect: string
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

type MvOtherEntry = {
  id: string
  type: string
  speed: string
}

type ImmunityEntry = {
  id: string
  text: string
}

type SpellcastingEntry = {
  id: string
  source: string
  casterLevel: string
  spells: string
  notes: string
}

type MonsterRecord = {
  id: string
  rulesetId: MonsterRulesetId
  name: string
  portraitUrl: string | null
  portraitFocusX: number
  portraitFocusY: number
  shortDescription: string
  immunities: ImmunityEntry[]
  attacks: MonsterAttack[]
  traits: MonsterTrait[]
  notes: string
  stats: Record<string, string>
  mvOther: MvOtherEntry[]
  tokenIcon: TokenIconConfig
}

type MonstersTabProps = {
  campaignId: string
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

const newTrait = (): MonsterTrait => ({
  id: crypto.randomUUID(),
  name: '',
  trigger: '',
  saveType: '',
  effect: '',
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

const newSpellcastingEntry = (): SpellcastingEntry => ({
  id: crypto.randomUUID(),
  source: '',
  casterLevel: '',
  spells: '',
  notes: '',
})

const mvTypeOptions: Array<{ value: string; label: string }> = [
  { value: 'fly', label: 'Fly' },
  { value: 'swim', label: 'Swim' },
  { value: 'burrow', label: 'Burrow' },
  { value: 'climb', label: 'Climb' },
  { value: 'web', label: 'Web' },
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
    immunities: [],
    attacks: [newAttack()],
    traits: [],
    notes: '',
    stats,
    mvOther: [],
    tokenIcon: defaultTokenIcon,
  }
}

export function MonstersTab({ campaignId, role }: MonstersTabProps) {
  const [monsters, setMonsters] = useState<MonsterRecord[]>([])
  const [spellcastingDraftByMonsterId, setSpellcastingDraftByMonsterId] = useState<Record<string, SpellcastingEntry[]>>({})
  const [selectedMonsterId, setSelectedMonsterId] = useState<string | null>(null)
  const monstersRef = useRef<MonsterRecord[]>([])
  const pendingWritesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= 900)
  const [mobileMonsterView, setMobileMonsterView] = useState<'list' | 'detail'>('list')

  const canEdit = role === 'gm'
  const sortedMonsters = useMemo(() => [...monsters].sort((a, b) => a.name.localeCompare(b.name)), [monsters])

  const selectedMonster = sortedMonsters.find((monster) => monster.id === selectedMonsterId) ?? null
  const selectedSpellcastingDrafts = selectedMonster ? (spellcastingDraftByMonsterId[selectedMonster.id] ?? []) : []
  const selectedRuleset = selectedMonster ? monsterRulesets[selectedMonster.rulesetId] : monsterRulesets.ose
  const savingThrowKeys = ['sv_d', 'sv_w', 'sv_p', 'sv_b', 'sv_s']

  const renderStatField = (key: string) => {
    const field = selectedRuleset.fields.find((entry) => entry.key === key)
    if (!field || !selectedMonster) return null
    const isWide = key === 'mv_other'
    return (
      <label key={field.key} className={isWide ? 'monster-stat-field wide' : 'monster-stat-field'}>
        {field.shortLabel}
        <input
          type={field.inputType === 'number' ? 'number' : 'text'}
          value={selectedMonster.stats[field.key] ?? ''}
          placeholder={field.placeholder}
          {...(field.inputType === 'number' ? { min: field.min, max: field.max } : {})}
          onChange={(event) => updateSelectedStat(field.key, event.target.value)}
          aria-label={field.label}
        />
      </label>
    )
  }

  const renderHdField = () => {
    if (!selectedMonster) return null
    return (
      <div className="monster-hd-field">
        <div className="hd-inputs">
          <div className="hd-col">
            <span className="monster-stat-label">HD</span>
            <input
              type="number"
              className="hd-dice"
              value={selectedMonster.stats.hd_dice ?? ''}
              min={0}
              placeholder="6"
              onChange={(e) => updateSelectedStat('hd_dice', e.target.value)}
              aria-label="Hit Dice count"
            />
          </div>
          <span className="hd-sep">d8</span>
          <div className="hd-col">
            <span className="hd-sublabel">bonus</span>
            <input
              type="number"
              className="hd-mod"
              value={selectedMonster.stats.hd_mod ?? ''}
              placeholder="0"
              onChange={(e) => updateSelectedStat('hd_mod', e.target.value)}
              aria-label="Hit Dice modifier"
            />
          </div>
          <select
            className="hd-special"
            value={selectedMonster.stats.hd_special ?? ''}
            onChange={(e) => updateSelectedStat('hd_special', e.target.value)}
            aria-label="Hit Dice special ability marker"
          >
            <option value="">—</option>
            <option value="*">*</option>
            <option value="**">**</option>
          </select>
        </div>
      </div>
    )
  }

  const renderNaField = () => {
    if (!selectedMonster) return null
    const naDieOptions = dieTypeOptions.filter((d) => ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'].includes(d.value))
    return (
      <div className="monster-na-field">
        <span className="monster-stat-label">Appearing</span>
        <div className="na-inputs">
          <div className="na-col">
            <span className="na-sublabel">Lair</span>
            <div className="na-dice-row">
              <input
                type="number"
                className="na-count"
                value={selectedMonster.stats.na_dungeon_count ?? ''}
                min={0}
                placeholder="1"
                onChange={(e) => updateSelectedStat('na_dungeon_count', e.target.value)}
                aria-label="Lair count"
              />
              <select
                className="na-die"
                value={selectedMonster.stats.na_dungeon_die ?? ''}
                onChange={(e) => updateSelectedStat('na_dungeon_die', e.target.value)}
                aria-label="Lair die"
              >
                <option value="">—</option>
                {naDieOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>
          <span className="na-sep">/</span>
          <div className="na-col">
            <span className="na-sublabel">Wild</span>
            <div className="na-dice-row">
              <input
                type="number"
                className="na-count"
                value={selectedMonster.stats.na_wilderness_count ?? ''}
                min={0}
                placeholder="1"
                onChange={(e) => updateSelectedStat('na_wilderness_count', e.target.value)}
                aria-label="Wilderness count"
              />
              <select
                className="na-die"
                value={selectedMonster.stats.na_wilderness_die ?? ''}
                onChange={(e) => updateSelectedStat('na_wilderness_die', e.target.value)}
                aria-label="Wilderness die"
              >
                <option value="">—</option>
                {naDieOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const ttOptions = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V']

  const renderTtField = () => {
    if (!selectedMonster) return null
    return (
      <label className="monster-tt-field">
        <span className="monster-stat-label">Treasure</span>
        <select
          value={selectedMonster.stats.tt ?? ''}
          onChange={(e) => updateSelectedStat('tt', e.target.value)}
          aria-label="Treasure Type"
        >
          <option value="">—</option>
          {ttOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
    )
  }

  const renderMvOtherField = () => {
    if (!selectedMonster) return null
    return (
      <div className="monster-mvother-field">
        <span className="monster-stat-label">MV+</span>
        {selectedMonster.mvOther.length === 0 ? (
          <button type="button" className="mv-other-add-empty" onClick={addMvOther} aria-label="Add movement">
            <Plus size={10} />
          </button>
        ) : (
          <div className="mv-other-entries">
            {selectedMonster.mvOther.map((entry) => (
              <div key={entry.id} className="mv-other-row">
                <select
                  className="mv-other-type"
                  value={entry.type}
                  onChange={(e) => updateMvOther(entry.id, { type: e.target.value })}
                  aria-label="Movement type"
                >
                  {mvTypeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <input
                  type="number"
                  className="mv-other-speed"
                  value={entry.speed}
                  min={0}
                  placeholder="120"
                  onChange={(e) => updateMvOther(entry.id, { speed: e.target.value })}
                  aria-label="Movement speed"
                />
                <button
                  type="button"
                  className="icon-btn mv-other-remove-btn"
                  onClick={() => removeMvOther(entry.id)}
                  aria-label="Remove movement"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <button type="button" className="mv-other-add" onClick={addMvOther} aria-label="Add movement">
              <Plus size={9} />
            </button>
          </div>
        )}
      </div>
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

  // Keep monstersRef in sync so debounced writes always use the latest state.
  useEffect(() => {
    monstersRef.current = monsters
  }, [monsters])

  // Firestore subscription — loads monsters for this campaign.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'campaigns', campaignId, 'monsters'), (snap) => {
      setMonsters(
        snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            rulesetId: data.rulesetId ?? 'ose',
            name: typeof data.name === 'string' ? data.name : '',
            portraitUrl: typeof data.portraitUrl === 'string' ? data.portraitUrl : null,
            portraitFocusX: typeof data.portraitFocusX === 'number' ? data.portraitFocusX : 50,
            portraitFocusY: typeof data.portraitFocusY === 'number' ? data.portraitFocusY : 50,
            shortDescription: typeof data.shortDescription === 'string' ? data.shortDescription : '',
            immunities: Array.isArray(data.immunities) ? data.immunities : [],
            attacks: Array.isArray(data.attacks) ? data.attacks : [newAttack()],
            traits: Array.isArray(data.traits) ? data.traits : [],
            notes: typeof data.notes === 'string' ? data.notes : '',
            stats: typeof data.stats === 'object' && data.stats !== null ? data.stats as Record<string, string> : {},
            mvOther: Array.isArray(data.mvOther) ? data.mvOther : [],
            tokenIcon: data.tokenIcon ?? defaultTokenIcon,
          } as MonsterRecord
        })
      )
    })
    return () => unsub()
  }, [campaignId])

  const scheduleMonsterWrite = (monsterId: string) => {
    if (pendingWritesRef.current[monsterId]) clearTimeout(pendingWritesRef.current[monsterId])
    pendingWritesRef.current[monsterId] = setTimeout(() => {
      delete pendingWritesRef.current[monsterId]
      const monster = monstersRef.current.find((m) => m.id === monsterId)
      if (!monster) return
      const { id, ...data } = monster
      void setDoc(doc(db, 'campaigns', campaignId, 'monsters', id), { ...data, updatedAt: serverTimestamp() })
    }, 500)
  }

  const showListPane = !isMobile || mobileMonsterView === 'list'
  const showDetailPane = !isMobile || mobileMonsterView === 'detail'

  const addMonster = () => {
    const nextMonster = newMonsterTemplate('ose')
    // Optimistic add to local state for instant UI.
    setMonsters((current) => [nextMonster, ...current])
    setSelectedMonsterId(nextMonster.id)
    if (isMobile) setMobileMonsterView('detail')
    const { id, ...data } = nextMonster
    void setDoc(doc(db, 'campaigns', campaignId, 'monsters', id), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  const updateSelectedMonster = (updates: Partial<MonsterRecord>) => {
    if (!selectedMonsterId) return
    setMonsters((current) =>
      current.map((monster) => (monster.id === selectedMonsterId ? { ...monster, ...updates } : monster)),
    )
    scheduleMonsterWrite(selectedMonsterId)
  }

  const deleteMonster = (monsterId: string) => {
    // Cancel any pending write before deleting.
    if (pendingWritesRef.current[monsterId]) {
      clearTimeout(pendingWritesRef.current[monsterId])
      delete pendingWritesRef.current[monsterId]
    }
    setMonsters((current) => current.filter((m) => m.id !== monsterId))
    setSpellcastingDraftByMonsterId((current) => {
      const next = { ...current }
      delete next[monsterId]
      return next
    })
    if (selectedMonsterId === monsterId) {
      setSelectedMonsterId(null)
      if (isMobile) setMobileMonsterView('list')
    }
    void deleteDoc(doc(db, 'campaigns', campaignId, 'monsters', monsterId))
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

  const addImmunity = () => {
    if (!selectedMonster) return
    updateSelectedMonster({ immunities: [...selectedMonster.immunities, newImmunity()] })
  }

  const updateImmunity = (immunityId: string, text: string) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      immunities: selectedMonster.immunities.map((entry) => (entry.id === immunityId ? { ...entry, text } : entry)),
    })
  }

  const removeImmunity = (immunityId: string) => {
    if (!selectedMonster) return
    updateSelectedMonster({ immunities: selectedMonster.immunities.filter((entry) => entry.id !== immunityId) })
  }

  const addMvOther = () => {
    if (!selectedMonster) return
    updateSelectedMonster({
      mvOther: [...selectedMonster.mvOther, { id: crypto.randomUUID(), type: 'fly', speed: '' }],
    })
  }

  const removeMvOther = (entryId: string) => {
    if (!selectedMonster) return
    updateSelectedMonster({ mvOther: selectedMonster.mvOther.filter((e) => e.id !== entryId) })
  }

  const updateMvOther = (entryId: string, updates: Partial<MvOtherEntry>) => {
    if (!selectedMonster) return
    updateSelectedMonster({
      mvOther: selectedMonster.mvOther.map((e) => (e.id === entryId ? { ...e, ...updates } : e)),
    })
  }

  const addTrait = () => {
    if (!selectedMonster) return
    updateSelectedMonster({ traits: [...selectedMonster.traits, newTrait()] })
  }

  const addSpellcasting = () => {
    if (!selectedMonster) return
    setSpellcastingDraftByMonsterId((current) => ({
      ...current,
      [selectedMonster.id]: [...(current[selectedMonster.id] ?? []), newSpellcastingEntry()],
    }))
  }

  const removeSpellcasting = (entryId: string) => {
    if (!selectedMonster) return
    setSpellcastingDraftByMonsterId((current) => ({
      ...current,
      [selectedMonster.id]: (current[selectedMonster.id] ?? []).filter((entry) => entry.id !== entryId),
    }))
  }

  const updateSpellcasting = (entryId: string, updates: Partial<SpellcastingEntry>) => {
    if (!selectedMonster) return
    setSpellcastingDraftByMonsterId((current) => ({
      ...current,
      [selectedMonster.id]: (current[selectedMonster.id] ?? []).map((entry) =>
        entry.id === entryId ? { ...entry, ...updates } : entry,
      ),
    }))
  }

  const removeTrait = (traitId: string) => {
    if (!selectedMonster) return
    updateSelectedMonster({ traits: selectedMonster.traits.filter((t) => t.id !== traitId) })
  }

  const updateTrait = (traitId: string, updates: Partial<MonsterTrait>) => {
    if (!selectedMonster) return
    updateSelectedMonster({ traits: selectedMonster.traits.map((t) => (t.id === traitId ? { ...t, ...updates } : t)) })
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

  const monsterStatline = (monster: MonsterRecord) => {
    const ruleset = monsterRulesets[monster.rulesetId]
    return ruleset.statlineOrder
      .map((key) => {
        if (key === 'hd') {
          const dice = monster.stats.hd_dice?.trim()
          if (!dice) return ''
          const modRaw = monster.stats.hd_mod?.trim()
          const special = monster.stats.hd_special?.trim() ?? ''
          let display = dice
          if (modRaw) {
            const modNum = parseInt(modRaw, 10)
            if (!isNaN(modNum) && modNum !== 0) {
              display += modNum > 0 ? `+${modNum}` : `${modNum}`
            }
          }
          return `HD ${display}${special}`
        }
        if (key === 'mv') {
          const land = monster.stats.mv_land?.trim()
          const otherParts = monster.mvOther
            .filter((e) => e.speed)
            .map((e) => {
              const label = mvTypeOptions.find((o) => o.value === e.type)?.label ?? e.type
              return `${label.toLowerCase()} ${e.speed}'`
            })
          const other = otherParts.join(', ')
          if (!land && !other) return ''
          if (land && other) return `MV ${land}' / ${other}`
          return land ? `MV ${land}'` : `MV ${other}`
        }
        if (key === 'att') {
          const parts = monster.attacks
            .filter((attack) => attack.count)
            .map((attack) => {
              const typeLabel =
                attack.attackType === 'custom'
                  ? attack.customAttackType
                  : (attackTypeOptions.find((opt) => opt.value === attack.attackType)?.label.toLowerCase() ?? attack.attackType)
              return `${attack.count} × ${typeLabel}`
            })
          return parts.length ? `Att ${parts.join(' / ')}` : ''
        }
        if (key === 'dmg') {
          const parts = monster.attacks
            .filter((attack) => attack.damageDiceCount && attack.damageDie)
            .map((attack) => `${attack.damageDiceCount}${attack.damageDie}`)
          return parts.length ? `Dmg ${parts.join(' / ')}` : ''
        }
        const field = ruleset.fields.find((entry) => entry.key === key)
        if (!field) return ''
        const value = monster.stats[key]?.trim()
        return value ? `${field.shortLabel} ${value}` : ''
      })
      .filter(Boolean)
      .join(', ')
  }

  const portraitObjectPosition = (monster: MonsterRecord) =>
    `${monster.portraitFocusX ?? 50}% ${monster.portraitFocusY ?? 50}%`

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
            <div className="monster-detail-header-row">
              {isMobile && selectedMonster ? (
                <button
                  type="button"
                  className="back-link monster-mobile-back"
                  onClick={() => setMobileMonsterView('list')}
                  aria-label="Back to monster list"
                >
                  <ChevronLeft size={16} />
                </button>
              ) : <span />}
              {selectedMonster ? (
                <button
                  type="button"
                  className="icon-btn remove-btn"
                  onClick={() => deleteMonster(selectedMonster.id)}
                  aria-label="Delete monster"
                  title="Delete monster"
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>

            {!selectedMonster ? (
              <p>Select a monster from the list or click + to create one.</p>
            ) : (
              <div className="monster-editor-grid">
              <div className="monster-top-row">
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
                  {monsterStatline(selectedMonster) ? (
                    <div className="monster-statline-preview">{monsterStatline(selectedMonster)}</div>
                  ) : null}
                </div>
                <EntityMediaEditor
                  entityName={selectedMonster.name || 'monster'}
                  portraitUrl={selectedMonster.portraitUrl}
                  portraitFocusX={selectedMonster.portraitFocusX}
                  portraitFocusY={selectedMonster.portraitFocusY}
                  tokenIcon={selectedMonster.tokenIcon}
                  onChange={(updates) => updateSelectedMonster(updates)}
                  portraitAltLabel="Monster portrait"
                  tokenButtonAriaLabel="Edit monster token icon"
                  removePortraitMessage="Remove the portrait image from this monster?"
                />
              </div>

              <h3 className="monster-section-title">Stats</h3>
              <div className="monster-stat-layout">
                <section className="monster-stat-group monster-stat-group-combat">
                  <h4>Combat Core</h4>
                  <div className="monster-stats-grid-combat">
                    {renderStatField('ac')}
                    {renderStatField('thac0')}
                    {renderHdField()}
                    {renderStatField('mv_land')}
                    {renderMvOtherField()}
                    {renderStatField('ml')}
                    {renderStatField('xp')}
                  </div>
                </section>
                <section className="monster-stat-group">
                  <h4>Saving Throws</h4>
                  <div className="monster-stats-grid-saving">{savingThrowKeys.map(renderStatField)}</div>
                </section>
                <section className="monster-stat-group">
                  <h4>Encounter & Treasure</h4>
                  <div className="monster-stats-grid-encounter">
                    {renderNaField()}
                    {renderTtField()}
                  </div>
                </section>
              </div>

              <section className="monster-section-block">
                <div className="section-head">
                  <h3 className="monster-section-title">
                    Spellcasting <span className="monster-ruleset-badge">UNFINISHED</span>
                  </h3>
                  <button type="button" className="icon-btn add-btn" onClick={addSpellcasting} aria-label="Add spellcasting profile">
                    <Plus size={13} />
                  </button>
                </div>
                {selectedSpellcastingDrafts.length === 0 ? <p>No spellcasting profiles yet.</p> : null}
                <div className="monster-trait-list">
                  {selectedSpellcastingDrafts.map((entry) => (
                    <article key={entry.id} className="monster-trait-card">
                      <div className="monster-step-header">
                        <strong>Spellcasting Profile</strong>
                        <button type="button" className="icon-btn remove-btn" onClick={() => removeSpellcasting(entry.id)} aria-label="Remove spellcasting profile">
                          <X size={13} />
                        </button>
                      </div>
                      <label>
                        Source
                        <input
                          type="text"
                          value={entry.source}
                          onChange={(event) => updateSpellcasting(entry.id, { source: event.target.value })}
                          placeholder="Cleric 1"
                        />
                      </label>
                      <label>
                        Caster Level
                        <input
                          type="text"
                          value={entry.casterLevel}
                          onChange={(event) => updateSpellcasting(entry.id, { casterLevel: event.target.value })}
                          placeholder="1"
                        />
                      </label>
                      <label>
                        Spells
                        <input
                          type="text"
                          value={entry.spells}
                          onChange={(event) => updateSpellcasting(entry.id, { spells: event.target.value })}
                          placeholder="Choose or roll from cleric list"
                        />
                      </label>
                      <label>
                        Notes
                        <input
                          type="text"
                          value={entry.notes}
                          onChange={(event) => updateSpellcasting(entry.id, { notes: event.target.value })}
                          placeholder="Any special casting rules"
                        />
                      </label>
                    </article>
                  ))}
                </div>
              </section>

              <section className="monster-section-block">
                <div className="section-head">
                  <h3 className="monster-section-title">Attacks</h3>
                  <button type="button" className="icon-btn add-btn" onClick={addAttack} aria-label="Add attack">
                    <Plus size={13} />
                  </button>
                </div>
                <div className="monster-abilities-builder">
                  <div className="monster-ability-list monster-attack-list">
                    {selectedMonster.attacks.map((attack, attackIndex) => (
                      <article key={attack.id} className="monster-ability-card">
                        <div className="monster-attack-header">
                          <strong>Attack {attackIndex + 1}</strong>
                          <button type="button" className="icon-btn remove-btn" onClick={() => removeAttack(attack.id)} aria-label="Remove attack">
                            <X size={13} />
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
                          Notes
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
                            <button type="button" className="icon-btn add-btn" onClick={() => addOnHitEffect(attack.id)} aria-label="Add on-hit effect">
                              <Plus size={13} />
                            </button>
                          </div>

                          {attack.onHitEffects.length > 0 ? (
                            <div className="monster-on-hit-list">
                              {attack.onHitEffects.map((effect, effectIndex) => (
                                <div key={effect.id} className="monster-step-card">
                                  <div className="monster-step-header monster-on-hit-step-header">
                                    <strong>Effect {effectIndex + 1}</strong>
                                    <button type="button" className="icon-btn remove-btn" onClick={() => removeOnHitEffect(attack.id, effect.id)} aria-label="Remove effect">
                                      <X size={13} />
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
                                      Notes
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
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </section>

              <section className="monster-section-block">
                <div className="section-head">
                  <h3 className="monster-section-title">Immunities</h3>
                  <button type="button" className="icon-btn add-btn" onClick={addImmunity} aria-label="Add immunity">
                    <Plus size={13} />
                  </button>
                </div>
                {selectedMonster.immunities.length > 0 && (
                  <div className="monster-immunity-list">
                    {selectedMonster.immunities.map((immunity) => (
                      <div key={immunity.id} className="immunity-row">
                        <select
                          value={immunityOptions.includes(immunity.text as (typeof immunityOptions)[number]) ? immunity.text : 'Custom'}
                          onChange={(e) => updateImmunity(immunity.id, e.target.value === 'Custom' ? '' : e.target.value)}
                        >
                          {immunityOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                        {!immunityOptions.includes(immunity.text as (typeof immunityOptions)[number]) && (
                          <input
                            type="text"
                            value={immunity.text}
                            onChange={(e) => updateImmunity(immunity.id, e.target.value)}
                            placeholder="Describe immunity..."
                          />
                        )}
                        <button type="button" className="icon-btn remove-btn" onClick={() => removeImmunity(immunity.id)} aria-label="Remove">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="monster-section-block">
                <div className="section-head">
                  <h3 className="monster-section-title">Traits</h3>
                  <button type="button" className="icon-btn add-btn" onClick={addTrait} aria-label="Add trait">
                    <Plus size={13} />
                  </button>
                </div>
                <div className="monster-trait-list">
                  {selectedMonster.traits.map((trait) => (
                    <article key={trait.id} className="monster-trait-card">
                      <div className="trait-header">
                        <input
                          className="trait-name-input"
                          type="text"
                          value={trait.name}
                          onChange={(e) => updateTrait(trait.id, { name: e.target.value })}
                          placeholder="Trait name"
                        />
                        {trait.saveType ? (
                          <span className="trait-save-badge">
                            Save vs {saveTypeOptions.find((o) => o.value === trait.saveType)?.label ?? trait.saveType}
                          </span>
                        ) : null}
                        <button type="button" className="icon-btn remove-btn" onClick={() => removeTrait(trait.id)} aria-label="Remove trait">
                          <X size={13} />
                        </button>
                      </div>
                      <div className="trait-body">
                        <div className="trait-meta">
                          <div className="trait-field">
                            <span className="trait-field-label">When</span>
                            <input
                              type="text"
                              value={trait.trigger}
                              onChange={(e) => updateTrait(trait.id, { trigger: e.target.value })}
                              placeholder="each round in melee, on surprise, passive..."
                            />
                          </div>
                          <div className="trait-field trait-save-field">
                            <span className="trait-field-label">Save</span>
                            <select
                              value={trait.saveType}
                              onChange={(e) => updateTrait(trait.id, { saveType: e.target.value as SaveType | '' })}
                            >
                              <option value="">—</option>
                              {saveTypeOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <textarea
                          className="trait-effect"
                          value={trait.effect}
                          onChange={(e) => updateTrait(trait.id, { effect: e.target.value })}
                          placeholder="What happens — what to call for, what to apply, player options..."
                        />
                      </div>
                    </article>
                  ))}
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
    </div>
  )
}
