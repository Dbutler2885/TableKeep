import type { Combatant, CombatDeclaration, CombatFrozenAim, CombatState } from '../engine/types'
import { combatantName, controlsAttacker, type CombatViewer } from './attackWords'

type MiniPart = { kind: string; width: number }

/** The declared split as a small bar: Defense lines from 0, then the attack, then the unused rest; Full Defense is one hatched line. */
export function miniParts(declaration: CombatDeclaration): MiniPart[] {
  // One Defense line at most, so the prototype's alternate line colour never shows.
  const defense = declaration.lines.map((line) => ({ kind: declaration.full ? 'f' : 'd', width: line.amount }))
  const used = declaration.lines.reduce((sum, line) => sum + line.amount, 0)
  const attack = declaration.full ? [] : [{ kind: 'a', width: declaration.total - used }]
  return [...defense, ...attack, { kind: 'u', width: 100 - declaration.total }].filter((part) => part.width > 0)
}

/** Whether a declaration aims at, or guards against, someone this viewer controls. */
export function declaredAt(declaration: CombatDeclaration, mine: readonly string[]): boolean {
  const target = declaration.aim?.targetKey
  return (target !== undefined && mine.includes(target)) || declaration.lines.some((line) => mine.includes(line.against))
}

/** The keys of the combatants this viewer controls, for "YOU" and "AT YOU". */
export const viewerKeys = (state: CombatState, viewer: CombatViewer): string[] =>
  state.combatants.filter((entry) => entry.kind === 'character' && controlsAttacker(entry, viewer)).map((entry) => entry.key)

/** Declare's order, slowest first; before initiative there is none. */
export const slowestFirst = (state: CombatState): Combatant[] =>
  [...(state.order ?? [])].reverse().map((key) => state.combatants.find((entry) => entry.key === key)!)


/** "Throw with the Dodgeball", or a use with no weapon of its own ("Punch"), as a declaration names it. */
export const declaredUse = (frozen: CombatFrozenAim): string =>
  (frozen.weaponName === frozen.choice.name ? frozen.choice.name : `${frozen.choice.name} with the ${frozen.weaponName}`)

/** What someone declared at `mine`, after their name: Full Defense against them, an attack at them, or a line guarding against them. */
export function aimedText(state: CombatState, declaration: CombatDeclaration, mine: string): string {
  if (declaration.full) return 'has declared Full Defense against you.'
  const line = declaration.lines[0]
  const defense = line ? `, Defense ${line.amount} against ${line.against === mine ? 'you' : combatantName(state, line.against)}` : ''
  const what = declaration.aim!.targetKey === mine ? `a ${declaration.frozen!.choice.name.toLowerCase()} at you` : 'Defense against you'
  return `has declared ${what} (ATK ${declaration.frozen!.attack}${defense}).`
}

const thenNames = (combatants: readonly Combatant[]): string => combatants.map((entry) => entry.name).join(', then ')

/** "Roy Carver is declaring now. Then Dale Ricker." or the last declarer's words. */
export function nextDeclarerWords(waiting: readonly Combatant[]): string {
  const [now, ...rest] = waiting
  if (!rest.length) return `${now.name} is the last to declare. After GM approval, the attacks begin, fastest first.`
  return `${now.name} is declaring now. Then ${thenNames(rest)}.`
}

const andList = (names: readonly string[]): string =>
  (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0])

/** "Dale Ricker and Roy Carver have declared. Wayne Gardner is next, then Dottie Haskell." for the GM's wait. */
export function gmDeclareWords(state: CombatState, waiting: readonly Combatant[]): string {
  const done = state.combatants.filter((entry) => entry.declaration && !entry.declaration.ran).map((entry) => entry.name)
  const declared = done.length ? `${andList(done)} ${done.length > 1 ? 'have' : 'has'} declared.` : 'Nobody has declared yet.'
  const [now, ...rest] = waiting
  return `${declared} ${now.name} is next${rest.length ? `, then ${thenNames(rest)}` : ''}.`
}

/** "Throws at you" on the target list for someone who declared an attack at this declarer; a blow or a shot "Attacks you". */
export function attackBadge(state: CombatState, targetKey: string, mine: string): string | null {
  const declaration = state.combatants.find((entry) => entry.key === targetKey)!.declaration
  if (declaration?.aim?.targetKey !== mine) return null
  return attackVerb(declaration.frozen!)
}

const attackVerb = (frozen: CombatFrozenAim): string => (frozen.choice.ranged && !frozen.choice.firearm ? 'Throws at you' : 'Attacks you')
