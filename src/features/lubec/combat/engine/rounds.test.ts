/**
 * Round 1 played through the engine with scripted dice: Movement's private
 * choices and its automatic settlement, Run's settled cost, and Declare
 * slowest first with one named Defense line frozen from the canonical sheet.
 */
import { describe, expect, it } from 'vitest'
import { lubecDetachedItem } from '../../../ruleSets/lubec/gear/detachedItems'
import { parseLubecGear, type LubecItem } from '../../../ruleSets/lubec/gear/gearRecord'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { combatEntropy } from './commandEntropy'
import { RAN } from './declare'
import { planCombatCommand } from './lifecycle'
import type { CombatAuthority, CombatCommand, Combatant, CombatPlan, CombatRecords, CombatSheet, CombatState } from './types'

const gm: CombatAuthority = { userId: 'gm', isGm: true }
const player: CombatAuthority = { userId: 'player', isGm: false }
const HERO = 'character:hero'
const ROY = 'npc:roy'
const DALE = 'npc:dale'

const inHand = (id: string, name: string, slot: number, extra: Record<string, unknown> = {}) =>
  ({ id, kind: 'weapon', carrier: 'hands', slot, name, size: 1, qty: 1, weight: 'normal', note: '', ...extra })
const ball = (id = 'ball', slot = 0, extra: Record<string, unknown> = {}) =>
  inHand(id, 'Dodgeball', slot, { mode: 'thrown', impact: 0, wounds: ['blunt'], table: 'dodgeball', catchChance: 50, catchPutsThrowerOut: true, ...extra })
const knife = inHand('knife', 'Knife', 1, { mode: 'melee', impact: 1, wounds: ['cut'] })
// A Working Kid's class adds 5: Handle 45 reads 50, Speed 51 reads 56.
const base = { ...lubecCharacterSheet().base, Handle: 45, Speed: 51 }
const sheetOf = (sheetId: string, name: string, kind: 'character' | 'npc', items: Record<string, unknown>[] = [], revision = 1): CombatSheet => ({
  kind, sheetId, name, ownerUserId: kind === 'npc' ? 'gm' : 'player', portraitPath: '', revision,
  sheet: lubecCharacterSheet({ base, skills: { free: 'Athletics', picked: ['Throwing Arm'] }, gear: parseLubecGear({ items }) }),
})
const hero = (items: Record<string, unknown>[] = [ball('hero-ball'), knife]) => sheetOf('hero', 'Wayne', 'character', items)
const roy = (items: Record<string, unknown>[] = [ball('roy-ball')], revision = 1) => sheetOf('roy', 'Roy', 'npc', items, revision)
const dale = (items: Record<string, unknown>[] = []) => sheetOf('dale', 'Dale', 'npc', items)

/** One unplaced Floor record of `qty` dodgeballs. */
const floorBall = (id: string, qty = 1) => lubecDetachedItem(parseLubecGear({ items: [ball(id, 0, { qty })] }).items[0] as LubecItem, [])

function envelope(state: CombatState | null, actorKey: string | null, id: string) {
  return {
    id, groupId: 'g', campaignId: 'c', fightId: 'fight', round: state?.round ?? 0, phase: state?.phase ?? 'setup',
    stageInstanceId: state?.stageInstanceId ?? 'setup', actorKey, interactionSequence: state?.combatants.find((entry) => entry.key === actorKey)?.interactionSequence ?? 0,
  }
}

type Step = { type: string; actor?: string | null; by?: CombatAuthority; dice?: number[]; stage?: string; [key: string]: unknown }
let counter = 0

function act(records: CombatRecords, { type, actor = null, by = gm, dice = [], stage, ...payload }: Step): { plan: CombatPlan; records: CombatRecords } {
  const at = envelope(records.fight!.state, actor, `${type}-${counter++}`)
  const command: CombatCommand = { envelope: stage ? { ...at, stageInstanceId: stage } : at, seed: 's', payload: { type, ...payload } }
  const entropy = combatEntropy(command)
  const queue = [...dice]
  const scripted = { ...entropy, die: (purpose: string) => { const value = queue.shift(); if (value === undefined) throw new Error(`Unscripted ${purpose}`); return value } }
  const plan = planCombatCommand(command, records, by, undefined, scripted)
  return { plan, records: { ...records, fight: plan.fight } }
}

const state = (records: CombatRecords) => records.fight!.state
const who = (records: CombatRecords, key: string): Combatant => state(records).combatants.find((entry) => entry.key === key)!

/** Start, roll initiative (Dale 30, Roy 20, Wayne 10: fastest first Dale, Roy, Wayne) and arrive at round 1's Movement. */
function movement(sheets: CombatSheet[] = [hero(), roy(), dale()], floor = [floorBall('floor-ball')]): CombatRecords {
  const start: CombatCommand = { envelope: envelope(null, null, 'start'), seed: 's', payload: { type: 'start', combatants: sheets.map(({ kind, sheetId }) => ({ kind, sheetId })), floor: [], dodgeball: true } }
  let records: CombatRecords = { activeFightId: 'fight', fight: planCombatCommand(start, { activeFightId: null, fight: null, sheets, items: new Map() }, gm).fight, sheets, items: new Map() }
  records.fight!.state.floor = floor
  records = act(records, { type: 'begin' }).records
  records = act(records, { type: 'npcInitiative', dice: [20, 30] }).records
  return act(records, { type: 'initiative', actor: HERO, by: player, dice: [10] }).records
}

const stay = { choice: 'stay', pickup: null }
const claim = (itemId = 'floor-ball') => ({ choice: 'pickup', pickup: { itemId, qty: 1 } })
const npcs = (choices: Record<string, object>) => ({ type: 'npcMovement', choices })

/** Everyone confirmed: Wayne `heroChoice`, and the NPCs as given. */
function confirmed(records = movement(), heroChoice: object = stay, npcChoices: Record<string, object> = { [ROY]: stay, [DALE]: stay }) {
  const moved = act(records, { type: 'move', actor: HERO, by: player, ...heroChoice }).records
  return act(moved, npcs(npcChoices)).records
}
const settled = (records: CombatRecords) => act(records, { type: 'settleMovement' })

describe('Movement', () => {
  it('opens on round 1 asking everyone in the fight for a choice', () => {
    const records = movement()
    expect(state(records)).toMatchObject({ phase: 'movement', round: 1, order: [DALE, ROY, HERO], movementComplete: false })
    expect(state(records).pendingActions).toEqual([HERO, ROY, DALE].map((combatantKey) => ({ combatantKey, action: 'movement' })))
  })

  it('records a confirmed choice privately: the table only learns that it is in', () => {
    const { plan } = act(movement(), { type: 'move', actor: HERO, by: player, choice: 'run' })
    expect(plan.fight.state.combatants[0].movement).toEqual({ choice: 'run', pickup: null, leave: null })
    expect(plan.logs).toEqual([{ event: 'Wayne confirmed Movement.', actor: HERO }])
    expect(plan.fight.state.pendingActions!.map((entry) => entry.combatantKey)).toEqual([ROY, DALE])
  })

  it('refuses an unknown choice, a second confirmation, someone else\'s combatant and a previous stage', () => {
    const records = movement()
    expect(() => act(records, { type: 'move', actor: HERO, by: player, choice: 'evade' })).toThrow('Choose Move or stay, Run, Pick up or Leave the fight.')
    const moved = act(records, { type: 'move', actor: HERO, by: player, ...stay }).records
    expect(() => act(moved, { type: 'move', actor: HERO, by: player, ...stay })).toThrow('Wayne has already confirmed Movement.')
    expect(() => act(records, { type: 'move', actor: ROY, by: player, ...stay })).toThrow('belongs to someone else')
    expect(() => act(records, { type: 'move', actor: HERO, by: player, ...stay, stage: 'an-earlier-movement' })).toThrow('That fight stage is stale.')
    const out = movement()
    out.fight!.state.combatants[0].outReason = 'gm'
    expect(() => act(out, { type: 'move', actor: HERO, ...stay })).toThrow('Wayne is Out.')
  })

  it('needs a free hand for a pickup and an exact Floor record still there', () => {
    expect(() => act(movement(), { type: 'move', actor: HERO, by: player, ...claim() })).toThrow('Wayne has no free hand for the Dodgeball.')
    const freeHand = movement([hero([ball('hero-ball')]), roy(), dale()])
    expect(act(freeHand, { type: 'move', actor: HERO, by: player, ...claim() }).plan.fight.state.combatants[0].movement).toEqual({ choice: 'pickup', pickup: { itemId: 'floor-ball', qty: 1 }, leave: null })
    expect(() => act(freeHand, { type: 'move', actor: HERO, by: player, ...claim('gone') })).toThrow('That item is no longer on the Floor.')
    expect(() => act(freeHand, { type: 'move', actor: HERO, by: player, choice: 'pickup' })).toThrow('That item is no longer on the Floor.')
    expect(() => act(freeHand, { type: 'move', actor: HERO, by: player, choice: 'pickup', pickup: { itemId: 'floor-ball', qty: 2 } })).toThrow('no longer on the Floor')
  })

  it('names the sheet to repair when a pickup cannot read it', () => {
    const records = movement()
    expect(() => act({ ...records, sheets: records.sheets.filter((sheet) => sheet.sheetId !== 'dale') }, npcs({ [ROY]: stay, [DALE]: claim() }))).toThrow("Dale's sheet is missing or unreadable")
  })

  it('lets the GM confirm every NPC at once, and only the GM', () => {
    const records = movement()
    expect(() => act(records, { ...npcs({ [ROY]: stay, [DALE]: stay }), by: player })).toThrow('Only the GM')
    expect(() => act(records, npcs({ [ROY]: stay }))).toThrow('Choose Move or stay')
    const { plan } = act(records, npcs({ [ROY]: { choice: 'leave' }, [DALE]: claim() }))
    expect(plan.fight.state.combatants.map((entry) => entry.movement)).toEqual([undefined, { choice: 'leave', pickup: null, leave: 'confirmed' }, { choice: 'pickup', pickup: { itemId: 'floor-ball', qty: 1 }, leave: null }])
    expect(plan.logs.map((entry) => entry.event)).toEqual(['Roy confirmed Movement.', 'Dale confirmed Movement.'])
    expect(() => act(records, { type: 'npcMovement' })).toThrow('Choose Move or stay')
    expect(() => act(act(records, npcs({ [ROY]: stay, [DALE]: stay })).records, npcs({}))).toThrow('No NPC is waiting to choose Movement.')
  })

  it('holds the stage open on a Leave until the GM answers; a refusal sends the player back to choose', () => {
    const asked = confirmed(movement(), { choice: 'leave' })
    expect(state(asked)).toMatchObject({ movementComplete: false, pendingActions: [{ combatantKey: HERO, action: 'leave' }] })
    expect(() => act(asked, { type: 'answerLeave', combatantKey: HERO, confirm: true, by: player })).toThrow('Only the GM')
    expect(() => act(asked, { type: 'answerLeave', combatantKey: ROY, confirm: true })).toThrow('Roy has not asked to Leave.')
    const refused = act(asked, { type: 'answerLeave', combatantKey: HERO, confirm: false })
    expect(who(refused.records, HERO).movement).toBeNull()
    expect(refused.plan.logs).toEqual([{ event: "The GM refused Wayne's Leave.", actor: null }])
    expect(state(refused.records).pendingActions).toEqual([{ combatantKey: HERO, action: 'movement' }])
    const confirmedLeave = act(asked, { type: 'answerLeave', combatantKey: HERO, confirm: true }).records
    expect(state(confirmedLeave)).toMatchObject({ movementComplete: true, pendingActions: [] })
    expect(who(confirmedLeave, HERO).outReason).toBeNull()
  })

  it('never completes with nobody left in the fight', () => {
    const records = movement()
    records.fight!.state.combatants.forEach((entry) => { entry.outReason = 'gm' })
    expect(() => settled(records)).toThrow('Movement is not ready to settle.')
  })
})

describe('settling Movement', () => {
  it('waits for every choice, and is the GM\'s system work', () => {
    expect(() => settled(movement())).toThrow('Movement is not ready to settle.')
    expect(() => act(declaring(), { type: 'move', actor: HERO, by: player, ...stay })).toThrow('Movement is not open.')
    expect(() => act(confirmed(), { type: 'settleMovement', by: player })).toThrow('Only the GM')
    expect(() => act(confirmed(), { type: 'move', actor: HERO, ...stay })).toThrow('Movement is set; the GM is settling it.')
  })

  it('gives a contested item to the faster claimant and tells the slower one why', () => {
    const { plan } = settled(confirmed(movement([hero(), roy([]), dale()]), stay, { [ROY]: claim(), [DALE]: claim() }))
    expect(plan.fight.state.floor).toEqual([])
    expect(plan.sheets).toHaveLength(1)
    expect(plan.sheets![0].selection).toEqual({ kind: 'npc', sheetId: 'dale' })
    expect(plan.sheets![0].gear.items).toEqual([expect.objectContaining({ id: 'floor-ball', name: 'Dodgeball', carrier: 'hands' })])
    expect(plan.logs.map((entry) => entry.event)).toEqual([
      'Dale picked up the Dodgeball.', 'Roy reached for the Dodgeball, but someone faster took it.', 'Wayne moved or stayed.', 'Round 1, Declare. Slowest first.',
    ])
  })

  it('takes one from a stack under a new identity and leaves the rest as the same record', () => {
    const { plan } = settled(confirmed(movement([hero(), roy([]), dale()], [floorBall('stack', 3)]), stay, { [ROY]: claim('stack'), [DALE]: claim('stack') }))
    expect(plan.fight.state.floor.map((record) => [record.item.id, record.item.qty])).toEqual([['stack', 1]])
    expect(plan.sheets!.map((sheet) => sheet.gear.items[0].qty)).toEqual([1, 1])
    expect(new Set(plan.sheets!.map((sheet) => sheet.gear.items[0].id)).size).toBe(2)
  })

  it('passes a claim to the next eligible claimant when the faster one\'s hands filled before settlement', () => {
    const records = confirmed(movement([hero(), roy([]), dale()]), stay, { [ROY]: claim(), [DALE]: claim() })
    const full = { ...records, sheets: records.sheets.map((sheet) => (sheet.sheetId === 'dale' ? dale([ball('a', 0), knife]) : sheet)) }
    const { plan } = settled(full)
    expect(plan.sheets!.map((sheet) => sheet.selection.sheetId)).toEqual(['roy'])
    expect(plan.logs.slice(0, 2).map((entry) => entry.event)).toEqual(['Dale could not pick up the Dodgeball: no free hand.', 'Roy picked up the Dodgeball.'])
  })

  it('explains a claimant whose sheet cannot be read', () => {
    const records = confirmed(movement([hero(), roy([]), dale()]), stay, { [ROY]: stay, [DALE]: claim() })
    const { plan } = settled({ ...records, sheets: records.sheets.filter((sheet) => sheet.sheetId !== 'dale') })
    expect(plan.logs[0].event).toBe('Dale could not pick up the Dodgeball: the sheet could not be read.')
    expect(plan.fight.state.floor).toHaveLength(1)
  })

  it('reveals every choice, puts a confirmed Leave Out, records Run\'s empty declaration and opens Declare slowest first', () => {
    const asked = confirmed(movement(), { choice: 'leave' }, { [ROY]: stay, [DALE]: { choice: 'run' } })
    const { plan } = settled(act(asked, { type: 'answerLeave', combatantKey: HERO, confirm: true }).records)
    const [wayne, roy, dale] = plan.fight.state.combatants
    expect(wayne.outReason).toBe('left')
    expect(dale.declaration).toEqual(RAN)
    expect(roy.declaration).toBeUndefined()
    expect(plan.fight.state).toMatchObject({ phase: 'declare', movementComplete: false, pendingActions: [{ combatantKey: ROY, action: 'declare' }] })
    expect(plan.fight.state.stageInstanceId).not.toBe(asked.fight!.state.stageInstanceId)
    expect(plan.logs.map((entry) => entry.event)).toEqual(['Dale ran.', 'Roy moved or stayed.', 'Wayne left the fight.', 'Round 1, Declare. Slowest first.'])
  })

  it('leaves anyone already Out as they are', () => {
    const records = movement()
    records.fight!.state.combatants[2].outReason = 'gm'
    const moved = act(act(records, { type: 'move', actor: HERO, by: player, ...stay }).records, npcs({ [ROY]: stay })).records
    const { plan } = settled(moved)
    expect(plan.fight.state.combatants[2]).toEqual(moved.fight!.state.combatants[2])
    expect(plan.logs.map((entry) => entry.event)).toEqual(['Roy moved or stayed.', 'Wayne moved or stayed.', 'Round 1, Declare. Slowest first.'])
  })

  it('goes through Attack to the next round by itself when nobody is left to declare', () => {
    const { plan } = settled(confirmed(movement(), { choice: 'run' }, { [ROY]: { choice: 'run' }, [DALE]: { choice: 'run' } }))
    expect(plan.fight.state).toMatchObject({ phase: 'movement', round: 2, movementComplete: false })
    expect(plan.fight.state.combatants.every((entry) => entry.movement === null && entry.declaration === null)).toBe(true)
    expect(plan.logs.slice(-2).map((entry) => entry.event)).toEqual(['Round 1, Attack. Nobody declared an attack.', 'Round 2, Movement.'])
  })
})

const declaring = (records = movement()) => settled(confirmed(records)).records
const throwAt = (targetKey: string, defense: object | null = null) => ({ targetKey, weaponItemId: 'roy-ball', attackId: 'throw', defense })

describe('Declare, slowest first', () => {
  it('asks the slowest first and refuses anyone out of turn', () => {
    const records = declaring()
    expect(state(records).pendingActions).toEqual([{ combatantKey: HERO, action: 'declare' }])
    expect(() => act(records, { type: 'declare', actor: ROY, aim: throwAt(HERO) })).toThrow("It is Wayne's turn to declare.")
    expect(() => act(movement(), { type: 'declare', actor: HERO, by: player })).toThrow('Declaring is not open.')
  })

  it('freezes the aim, the pool and its revision, and one named Defense line, for everyone to see', () => {
    const afterWayne = act(declaring(), { type: 'declare', actor: HERO, by: player, aim: { targetKey: ROY, weaponItemId: 'hero-ball', attackId: 'throw', defense: { against: DALE, amount: 20 } } })
    const wayne = afterWayne.plan.fight.state.combatants[0]
    expect(wayne.declaration).toBeUndefined()
    expect(wayne.proposedDeclaration).toMatchObject({ ran: false, full: false, aim: { targetKey: ROY, weaponItemId: 'hero-ball' }, total: 65, lines: [{ against: DALE, amount: 20 }], sourceRevision: 1, frozen: { attack: 45, total: 65 } })
    expect(afterWayne.plan.fight.state.pendingActions).toEqual([{ combatantKey: HERO, action: 'reviewDeclaration' }])
    const approved = act(afterWayne.records, { type: 'answerDeclaration', combatantKey: HERO, approve: true })
    expect(who(approved.records, HERO).declaration).toEqual(wayne.proposedDeclaration)
    expect(approved.plan.logs).toEqual([{ event: 'Wayne declared: Throw at Roy, ATK 45, Defense 20 against Dale.', actor: HERO }])
    expect(state(approved.records).pendingActions).toEqual([{ combatantKey: ROY, action: 'declare' }])
  })

  it('keeps Defense in tens, leaves the attack something, and only aims at an opponent', () => {
    const records = declaring()
    const aim = (defense: object | null, targetKey = ROY) => ({ targetKey, weaponItemId: 'hero-ball', attackId: 'throw', defense })
    expect(() => act(records, { type: 'declare', actor: HERO, by: player, aim: aim({ against: ROY, amount: 15 }) })).toThrow('splits Handle in tens')
    expect(() => act(records, { type: 'declare', actor: HERO, by: player, aim: aim({ against: ROY, amount: 70 }) })).toThrow('Leave some of your Handle for the attack.')
    expect(() => act(records, { type: 'declare', actor: HERO, by: player, aim: aim(null, HERO) })).toThrow('Wayne cannot aim at Wayne.')
  })

  it('takes Full Defense as no attack and the whole pool on one named line', () => {
    const records = declaring()
    expect(() => act(records, { type: 'declare', actor: HERO, by: player, full: true })).toThrow('Full Defense names the one person you guard against.')
    const withWeapon = act(records, { type: 'declare', actor: HERO, by: player, full: true, against: ROY, aim: { weaponItemId: 'hero-ball', attackId: 'throw' } })
    expect(withWeapon.plan.fight.state.combatants[0].proposedDeclaration).toEqual({ ran: false, full: true, aim: null, frozen: null, total: 65, lines: [{ against: ROY, amount: 65 }], sourceRevision: 1 })
    expect(state(withWeapon.records).pendingActions).toEqual([{ combatantKey: HERO, action: 'reviewDeclaration' }])
    const bare = act(records, { type: 'declare', actor: HERO, by: player, full: true, against: ROY })
    expect(bare.plan.fight.state.combatants[0].proposedDeclaration!.total).toBe(50)
    const unrevised = { ...records, sheets: records.sheets.map((sheet) => ({ ...sheet, revision: undefined })) }
    expect(act(unrevised, { type: 'declare', actor: HERO, by: player, full: true, against: ROY }).plan.fight.state.combatants[0].proposedDeclaration!.sourceRevision).toBe(0)
  })

  it('waits for every wound due by this round to reach the sheet, and reads the sheet at that delivery', () => {
    const records = declaring()
    const wound = { id: 'w', target: { kind: 'character' as const, sheetId: 'hero' }, originatingRound: 0, effectiveRound: 1, traumaDelta: 1, stressDelta: 0, effect: { id: 'e', name: 'Bonk', cause: 'row', steps: [] } }
    const aim = { targetKey: ROY, weaponItemId: 'hero-ball', attackId: 'throw', defense: null }
    records.fight!.state.woundOutbox = [wound]
    expect(() => act(records, { type: 'declare', actor: HERO, by: player, aim })).toThrow('Waiting for wounds to reach the sheet')
    records.fight!.state.woundOutbox = [{ ...wound, originatingRound: 1, effectiveRound: 2 }]
    expect(act(records, { type: 'declare', actor: HERO, by: player, aim }).plan.fight.state.combatants[0].proposedDeclaration).toBeTruthy()
    records.fight!.state.woundOutbox = []
    records.fight!.state.woundAcknowledgements = [{ id: 'w', target: wound.target, targetRevision: 2, originatingRound: 0, effectiveRound: 1, operationId: 'op' }]
    expect(() => act(records, { type: 'declare', actor: HERO, by: player, aim })).toThrow('Waiting for wounds to reach the sheet')
  })

  it('names the repair when the declarer\'s sheet cannot be read', () => {
    const records = declaring()
    expect(() => act({ ...records, sheets: records.sheets.filter((sheet) => sheet.sheetId !== 'hero') }, { type: 'declare', actor: HERO, by: player, aim: throwAt(ROY) })).toThrow("Wayne's sheet is missing or unreadable")
  })

  it('skips runners and moves on to Attack, fastest first, after the last declaration', () => {
    const records = settled(confirmed(movement(), stay, { [ROY]: stay, [DALE]: { choice: 'run' } })).records
    let current = act(records, { type: 'declare', actor: HERO, by: player, full: true, against: ROY }).records
    current = act(current, { type: 'answerDeclaration', combatantKey: HERO, approve: true }).records
    expect(state(current).pendingActions).toEqual([{ combatantKey: ROY, action: 'declare' }])
    const proposed = act(current, { type: 'declare', actor: ROY, aim: throwAt(HERO) }).records
    expect(state(proposed)).toMatchObject({ phase: 'declare', attack: null, pendingActions: [{ combatantKey: ROY, action: 'reviewDeclaration' }] })
    const last = act(proposed, { type: 'answerDeclaration', combatantKey: ROY, approve: true })
    current = last.records
    expect(state(current)).toMatchObject({ phase: 'attack', attacked: [ROY], attack: { attackerKey: ROY, grantId: null, step: 'aim' } })
    expect(state(current).pendingActions).toEqual([{ combatantKey: ROY, action: 'attack' }, { combatantKey: ROY, action: 'range' }])
    expect(state(current).stageInstanceId).not.toBe(state(records).stageInstanceId)
    expect(last.plan.logs.map((entry) => entry.event)).toEqual(['Roy declared: Throw at Wayne, ATK 65, no Defense.', 'Round 1, Attack. Fastest first: Roy.', "Roy's turn to attack."])
  })

  it('holds the order for GM review, rejects forged decisions and returns a rejected choice to the same player', () => {
    const original = declaring()
    const pending = act(original, { type: 'declare', actor: HERO, by: player, full: true, against: ROY }).records
    expect(() => act(pending, { type: 'declare', actor: ROY, aim: throwAt(HERO) })).toThrow("It is Wayne's turn to declare.")
    expect(() => act(pending, { type: 'declare', actor: HERO, by: player, full: true, against: DALE })).toThrow('Waiting for the GM')
    expect(() => act(pending, { type: 'answerDeclaration', combatantKey: HERO, approve: true, by: player })).toThrow('Only the GM')
    expect(() => act(pending, { type: 'answerDeclaration', combatantKey: HERO, approve: 'yes' })).toThrow('Approve or reject')
    expect(() => act(pending, { type: 'answerDeclaration', combatantKey: ROY, approve: true })).toThrow('not waiting for approval')
    expect(() => act(original, { type: 'answerDeclaration', combatantKey: HERO, approve: true })).toThrow('not waiting for approval')
    const rejected = act(pending, { type: 'answerDeclaration', combatantKey: HERO, approve: false }).records
    expect(state(rejected).pendingActions).toEqual([{ combatantKey: HERO, action: 'declare' }])
    expect(who(rejected, HERO)).toMatchObject({ declaration: null, proposedDeclaration: null, declarationRejected: true })
    const replacement = act(rejected, { type: 'declare', actor: HERO, by: player, full: true, against: DALE }).records
    expect(who(replacement, HERO)).toMatchObject({ declarationRejected: false, proposedDeclaration: { lines: [{ against: DALE, amount: 50 }] } })
    expect(() => act(replacement, { type: 'answerDeclaration', combatantKey: HERO, approve: true, stage: state(pending).stageInstanceId })).toThrow('stage is stale')
    expect(() => act(replacement, { type: 'declare', actor: HERO, by: player, full: true, against: ROY, stage: state(original).stageInstanceId })).toThrow('stage is stale')
    const approved = act(replacement, { type: 'answerDeclaration', combatantKey: HERO, approve: true }).records
    expect(who(approved, HERO).declaration!.lines).toEqual([{ against: DALE, amount: 50 }])
    expect(() => act(approved, { type: 'answerDeclaration', combatantKey: HERO, approve: false })).toThrow('not waiting for approval')
    expect(() => act(movement(), { type: 'answerDeclaration', combatantKey: HERO, approve: true })).toThrow('Declaring is not open')
  })

  it('moves past a pending review if the GM takes its declarer Out', () => {
    const pending = act(declaring(), { type: 'declare', actor: HERO, full: true, against: ROY }).records
    const removed = act(pending, { type: 'takeOut', combatantKey: HERO }).records
    expect(state(removed).pendingActions).toEqual([{ combatantKey: ROY, action: 'declare' }])
    expect(() => act(removed, { type: 'answerDeclaration', combatantKey: HERO, approve: true })).toThrow('not waiting for approval')
  })
})
