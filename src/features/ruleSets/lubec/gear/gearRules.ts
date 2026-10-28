/* =============================================================================================
   LUBEC 1977: THE INVENTORY RULES
   Every rule this sheet carries out, in plain words, so Table Keep can take them over as written.
   Each rule says where it came from: "captain, round N" is a decision from review, "plan" is the
   captain's design record, and GUESS means it is built as a guess (the report lists every guess,
   and the page's Open questions list the ones still waiting on an answer).
   The code that carries out a rule names it, like "Rule M2". Numbers a game might tune are in RULES.

   S. SIZE
   S1. A thing's size is in slots: Small (0), 1, 2, 4 or 8. (plan)
   S2. Weight is separate from size: Normal, Heavy or Extra heavy. (plan)
   S3. Anything that comes in numbers says how many fit in one slot (or in one space of its size).
       More than that splits into stacks, each taking its own space. Small things never split.
       At most 40 stacks at once. (captain, round 18)
   S4. A small thing takes no slot in a bag, however many. Held or on the body, it takes that slot. (plan)

   W. WHERE THINGS GO ON YOU
   W1. The backpack: a main pocket of 5 slots for things up to 4, two front pockets of 1 slot for
       1-slot things, and small stuff, which takes no slots. An 8-slot thing never goes in it. (plan)
   W2. In the main pocket a 4-slot thing fills the 2x2 block, a 2-slot thing two boxes side by side or
       one above the other, and the box under the block takes a 1-slot thing. The player arranges it by
       dragging; anything not arranged is packed around the rest, biggest first. (captain, round 25;
       one-above-the-other pairs are a GUESS)
   W3. Hands: each holds one 1-slot or small thing. Anything bigger takes both hands, and so does anything
       heavy or extra heavy, whatever its size. (plan; heavy: captain, round 26)
   W4. Body: two slots, for 1-slot or small things. Clothes are Things kept in a body slot. (plan)
   W5. Worn armor takes no slots. Armor kept anywhere else does. (plan)
   W6. A full inventory is a full backpack, full body slots and full hands. Carriers don't count. (captain, round 20)

   C. CARRIERS
   C1. A carrier is a name and pockets, each with a slot count and a largest size. A thing fits inside one pocket. (plan)
   C2. A carrier has an owner, a list of who else can get into it, and is known to all or hidden. (plan)
   C3. Carrying a carrier is the one way past the carry limit, by special dispensation. It takes no hands,
       and what's in it doesn't slow you. (plan; the captain left carriers out of scope in round 20)
   C4. A carrier over 24 slots has "plenty of room"; big things in it are settled at the table. (plan)

   E. EFFECTS ON YOU (the Core sheet reads these)
   E1. Heavy and Strength failed: Speed -20 while it's on you. Heavy and passed: nothing. (plan)
   E2. Extra heavy and Strength passed: Speed -20, always. Failed: you can't carry it. (plan)
   E3. Any 8-slot thing on you: Speed -20. (plan)
   E4. A full inventory (W6): a flat Speed -10, no roll. (captain, round 20)
   E5. Strength is rolled at the table when a heavy or extra-heavy thing comes onto you: added, moved or edited. (plan)
   E6. Armor on a hand: Handle -10 a layer. Exclusive armor counts all of that hand's layers. (plan; the exclusive count is a GUESS)
   E7. Worn armor counts as on you for weight. (captain, round 20)

   A. ARMOR
   A1. Armor covers body parts, and each part has a layer limit (RULES.layers). Ordinary armor takes one
       layer; exclusive armor takes every layer where it covers. (plan)
   A2. Armor has a number for each kind of wound: cutting, piercing, blunt and gunshot. On one part the
       numbers add up, and come off Impact for that kind of wound. (captain, round 20)
   A3. Putting armor on with no free layer is refused, with no override. (plan)
   A4. Putting armor on doesn't need empty hands. (captain, round 24: maybe later, only during combat)

   M. MOVING (costs in actions; a kid takes one action a turn) (captain, round 21)
   M1. Body to hand: free. Hand to body: 1. (captain, round 20)
   M2. Into or out of the backpack: 2. Moving things inside the backpack is free: it's only arranging. (captain, rounds 20 and 21)
   M3. Hand to worn: 1. Body to worn: 2. Taking armor off costs what putting it on does. (captain, rounds 20 and 21)
   M4. Dropping from a hand or the body: free. From the backpack: 2. (captain, round 21)
   M5. Moving a thing to the other hand: free. (GUESS, an open question)
   M6. Moves to and from carriers, and picking things up, aren't counted here.
   M7. Dragging a thing on the On you view moves it, and costs what the Move button would. (captain, round 25)
   M8. A dropped thing leaves the sheet and goes to the GM's Items tab as a dropped item, in the same move
       that takes it off. It is never lost: only the GM removes it. (captain, second round, 2026-10-25)
   M9. Two things in your hands, body slots or backpack (not its small stuff) can swap places, so a full inventory never locks
       anything in: drag one onto the other, or pick "Swap with" in the Move list. Each has to fit where the
       other was. A swap costs both moves added up; inside the backpack it's only arranging, and free.
       (captain, round 27; the added-up cost is a GUESS)

   K. KINDS OF ITEM
   K1. Thing: the plain case. (plan)
   K2. Weapon: melee or firearm, with a base Impact, a results table and the wounds it deals. Melee adds
       Strength; a firearm doesn't. It must be in hand to attack. (plan; wounds: captain, round 20)
   K3. Armor: see A.
   K4. Consumable: a count that goes down. At 0 it is used up and leaves the sheet. (captain, round 24)
   K5. Holder: a thing that holds a supply, is emptied and refilled, and is never used up itself. It is
       loaded (a flashlight and its batteries), filled (a canteen of water) or a box (a box of rounds).
       An empty holder stays. (captain, round 25; the name "Holder" and the three ways are a GUESS)
   K6. A firearm is a weapon that also holds a supply: its rounds.

   L. SUPPLIES, LOADING AND UNLOADING
   L1. Supplies are one list in the game's rules settings: rounds, shells, batteries, water. A gun or a
       holder and what goes into it match by that list, never by spelling. Anyone can add one. (captain, chat 2026-10-17)
   L2. A supply is either loose (a consumable of that supply, like D batteries) or in a holder (a box of rounds).
       Some supplies can't be loose: water is in something or poured out.
   L3. Loading a gun takes 1 action with the supply in the other hand, 2 on the body and 3 in the backpack.
       Supplies in a carrier don't count. The other hand holds them or is empty to fetch them. The nearest
       are used first, and the farthest place drawn from sets the cost. (captain, round 20)
   L4. Loading anything else that's loaded, like a flashlight, works the same way. (GUESS)
   L5. Loose or boxed ammo has one Load button: it finds a gun (or holder) on you that takes it, or is
       greyed out and says why. With more than one, it asks which, so the card never grows. (captain, rounds 25 and 26)
   L10. A loose supply has no "Use one": its count is changed with - and +. (captain, round 26)
   L6. Unloading, or taking some out of a box: they go into a box or loose stack of the same supply with
       room, or into a new loose stack at the nearest place with room, and cost what moving there costs (M).
       Whatever can't be loose is poured out. (GUESS)
   L7. Putting loose ones into a box costs what moving them there costs (M). (GUESS)
   L8. Filling up a canteen and emptying it happen at the table, so the sheet doesn't count them. (GUESS)
   L9. Reloading and firing in one action requires special dispensation. (plan)

   V. WHO SEES WHAT
   V1. A hidden carrier and what's in it are seen only by the people with access, and the GM. (plan)
   V2. The activity stream redacts moves about a hidden carrier for everyone else. GM entries are for the GM. (plan)
   V3. On the campaign's stock list, a thing in a hidden place is left out for anyone who can't see that
       place. What counts is where it is now, not where it was made. (captain, round 22)
       Once it's gone, it stays left out if it was last in a hidden place. (GUESS)

   T. STOCK
   T1. Two lists: the game's stock, made ahead of time, and this campaign's, which is the campaign items
       in the GM's Items tab. Dropped items and things players make on their own sheets are not on it;
       the GM can keep a dropped item as a campaign item. (captain, revised spec answers, 2026-10-25)
   T2. Picking from stock copies it; the copy never follows later changes. (plan, as Table Keep's OSE sheet does)
   T3. One entry stands for each design: unchanged copies of the game's stock and exact repeats are left out. (captain, round 21)
   ============================================================================================= */

// Copied from the inventory prototype (B). The numbers a game might tune live
// here, not in the sheet; the code that carries out a rule names it.

import type { LubecItem, LubecItemKind } from './gearRecord'

// The game's rules settings (Lubec). The numbers live here, not in the sheet.
export const RULES = {
  heavyFail: 20,       // Rule E1: heavy, failed Strength
  extraPass: 20,       // Rule E2: extra heavy, passed Strength: always on
  encumbering: 20,     // Rule E3: any 8-slot thing on you
  fullInventory: 10,   // Rule E4: flat, no roll: backpack, body and hands all full
  handArmorHandle: 10, // Rule E6: per layer on a hand
  // Rule A1: the layer limit on each body part.
  layers: { head: 2, neck: 2, torso: 3, upperarm: 3, forearm: 2, hand: 2, waist: 2, groin: 2, thigh: 3, shin: 2, feet: 2 } as Record<string, number>,
}

export type LubecLocation = { id: string; name: string; plural?: string; paired?: boolean }

// Rule A1: the body parts armor covers.
export const LOCATIONS: readonly LubecLocation[] = [
  { id: 'head', name: 'Head' },
  { id: 'neck', name: 'Neck' },
  { id: 'torso', name: 'Torso' },
  { id: 'upperarm', name: 'Upper arm', plural: 'Upper arms', paired: true },
  { id: 'forearm', name: 'Forearm', plural: 'Forearms', paired: true },
  { id: 'hand', name: 'Hand', plural: 'Hands', paired: true },
  { id: 'waist', name: 'Waist' },
  { id: 'groin', name: 'Groin' },
  { id: 'thigh', name: 'Thigh', plural: 'Thighs', paired: true },
  { id: 'shin', name: 'Shin', plural: 'Shins', paired: true },
  { id: 'feet', name: 'Foot', plural: 'Feet', paired: true },
]
// The body drawing: one tappable region per armor location, in the cropped 620x1290 drawing.
// It faces you, so the kid's right side is on your left. Regions tile the body; the silhouette mask trims them.
// The mask is `features/lubec/gear/assets/body-mask.png`, B's BODY_MASK as a file rather than a data URI.
export const BODY_REGIONS: Readonly<Record<string, string>> = {
  'head': '215,0 405,0 405,168 352,168 310,190 268,168 215,168',
  'neck': '250,168 268,168 310,190 352,168 370,168 372,242 248,242',
  'torso': '195,214 250,214 248,242 372,242 370,214 425,214 419,355 430,472 190,472 201,355',
  'waist': '190,472 430,472 440,556 180,556',
  'groin': '258,556 362,556 338,640 310,668 282,640',
  'upperarm-R': '95,210 195,214 201,355 190,452 100,452',
  'upperarm-L': '520,452 430,452 419,355 425,214 525,210',
  'forearm-R': '100,452 190,452 168,600 150,636 30,636 60,560',
  'forearm-L': '560,560 590,636 470,636 452,600 430,452 520,452',
  'hand-R': '10,636 150,636 150,790 10,790',
  'hand-L': '610,790 470,790 470,636 610,636',
  'thigh-R': '150,556 258,556 282,640 310,668 310,885 150,885',
  'thigh-L': '470,885 310,885 310,668 338,640 362,556 470,556',
  'shin-R': '140,885 310,885 310,1165 140,1165',
  'shin-L': '480,1165 310,1165 310,885 480,885',
  'feet-R': '120,1165 310,1165 310,1290 120,1290',
  'feet-L': '500,1290 310,1290 310,1165 500,1165',
}
/** The 17 location keys: one per part, and a left and a right of each paired part. */
export const LOC_KEYS: readonly string[] = LOCATIONS.flatMap((l) => (l.paired ? [`${l.id}-L`, `${l.id}-R`] : [l.id]))
export const baseLoc = (k: string): string => k.split('-')[0]
export const locName = (k: string): string => {
  const [b, s] = k.split('-')
  const l = LOCATIONS.find((x) => x.id === b)
  if (!l) return k
  return s ? `${s === 'L' ? 'Left' : 'Right'} ${l.name.toLowerCase()}` : l.name
}
export function locSummary(keys: readonly string[]): string {
  return LOCATIONS.flatMap((l) => {
    if (!l.paired) return keys.includes(l.id) ? [l.name] : []
    const L = keys.includes(`${l.id}-L`), R = keys.includes(`${l.id}-R`)
    if (L && R) return [l.plural as string]
    return L ? [locName(`${l.id}-L`)] : R ? [locName(`${l.id}-R`)] : []
  }).join(', ')
}

// Rule S1: a thing's size is in slots. Rule S2: weight is separate from size.
export const SIZE_NAMES: Readonly<Record<number, string>> = { 0: 'Small', 1: 'Normal', 2: 'Bulky', 4: 'Large', 8: 'Huge' }
// Rules K1 to K5: the kinds of item.
export const KIND_NAMES: Readonly<Record<LubecItemKind, string>> = { thing: 'Thing', weapon: 'Weapon', armor: 'Armor', consumable: 'Consumable', holder: 'Holder' }

export type LubecHoldWay = 'load' | 'fill' | 'box'
export type LubecHoldWords = { name: string; like: string; fact: string; put: string; out: string }

// Rule K5: a holder is loaded, filled or a box. Each way has its own words; the mechanism is the same.
export const HOLD: Readonly<Record<LubecHoldWay, LubecHoldWords>> = {
  load: { name: 'Loaded', like: 'like a flashlight', fact: 'Loaded', put: 'Load', out: 'Unload' },
  fill: { name: 'Filled', like: 'like a canteen', fact: 'In it', put: 'Fill up', out: 'Empty' },
  box: { name: 'A box', like: 'like a box of rounds', fact: 'Inside', put: 'Put loose ones in', out: 'Take some out' },
}
// A firearm or a holder: something with a supply in it (Rules K5, K6).
export const holds = (i: LubecItem | null | undefined): boolean => Boolean(i && i.takes && i.capacity)
export const holdWay = (i: LubecItem): LubecHoldWay => (i.kind === 'holder' ? i.hold || 'load' : 'load')
export const isBox = (i: LubecItem): boolean => i.kind === 'holder' && i.hold === 'box'

export type LubecMovePlace = 'hands' | 'body' | 'backpack' | 'worn'

// Rules M1 to M6: what moving a thing costs, in actions (a kid takes one action a turn).
// One action a turn, so 2 actions take 2 turns.
// Body to hand free, hand to body 1, anything into or out of the backpack 2, hand to worn 1, body to worn 2.
// Taking armor off costs what putting it on does. Dropping from a hand or the body is free, from the backpack 2.
// Moving things around inside the backpack is free: it's only arranging.
// Moving a thing to the other hand is a guess. Carriers and picking things up aren't counted here.
// B's `ground` column is `drop` here: a dropped thing goes to the GM's Items tab (Rule M8).
export const MOVE_COST: Readonly<Record<LubecMovePlace, Partial<Record<LubecMovePlace, number>> & { drop: number }>> = {
  hands: { hands: 0, body: 1, backpack: 2, worn: 1, drop: 0 },
  body: { hands: 0, backpack: 2, worn: 2, drop: 0 },
  backpack: { hands: 2, body: 2, backpack: 0, worn: 2, drop: 2 },
  worn: { hands: 1, body: 2, backpack: 2, drop: 1 },
}
// Rule M5: moving a thing to the other hand is a GUESS.
export const MOVE_GUESS: ReadonlySet<string> = new Set(['hands>hands'])

export type LubecReloadPlace = 'hands' | 'body' | 'backpack'

// Rules L3 and L4. Loading takes 1 action with the supply in your other hand, 2 on the body, 3 in the backpack.
// The other hand holds the supply, or is empty to fetch it. A supply in a carrier doesn't count.
export const RELOAD_COST: Readonly<Record<LubecReloadPlace, number>> = { hands: 1, body: 2, backpack: 3 }
export const RELOAD_FROM: Readonly<Record<LubecReloadPlace, string>> = { hands: 'in your other hand', body: 'on your body', backpack: 'in the backpack' }
