import { OSE_NORMALIZED_MONSTERS } from './oseNormalizedMonsters'
import type { OseImportMonsterRecord } from './oseMonsterTypes'

export const OSE_MONSTER_CATALOG: OseImportMonsterRecord[] = OSE_NORMALIZED_MONSTERS

export const oseMonsterCatalogById: Record<string, OseImportMonsterRecord> = Object.fromEntries(
  OSE_MONSTER_CATALOG.map((m) => [m.id, m]),
)

export type MonsterTemplatePatch = {
  typeId: string
  typeName: string
  name: string
  shortDescription: string
  stats: Record<string, string>
  attacks: typeof OSE_MONSTER_CATALOG[number]['attacks']
  traits: typeof OSE_MONSTER_CATALOG[number]['traits']
  immunities: typeof OSE_MONSTER_CATALOG[number]['immunities']
  mvOther: typeof OSE_MONSTER_CATALOG[number]['mvOther']
  treasureTypes: typeof OSE_MONSTER_CATALOG[number]['treasureTypes']
  notes: string
}

export const applyMonsterTemplate = (templateId: string): MonsterTemplatePatch | null => {
  const template = oseMonsterCatalogById[templateId]
  if (!template) return null

  return {
    typeId: template.id,
    typeName: template.name,
    name: '',
    shortDescription: template.shortDescription,
    stats: { ...template.stats },
    attacks: template.attacks.map((a) => ({
      ...a,
      id: crypto.randomUUID(),
      onHitEffects: a.onHitEffects.map((e) => ({ ...e, id: crypto.randomUUID() })),
    })),
    traits: template.traits.map((t) => ({ ...t, id: crypto.randomUUID() })),
    immunities: template.immunities.map((i) => ({ ...i, id: crypto.randomUUID() })),
    mvOther: template.mvOther.map((m) => ({ ...m, id: crypto.randomUUID() })),
    treasureTypes: template.treasureTypes.map((tt) => ({ ...tt, id: crypto.randomUUID() })),
    notes: template.notes,
  }
}
