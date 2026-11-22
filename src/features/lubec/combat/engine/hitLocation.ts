// Where a hit lands, copied as data from the attack prototype
// (lubec-nonmap-combat/lubec-attack-prototype.html): a d100 on the attack's
// start table picks a region, a d10 picks the side of a paired part (odd is
// left), and the attacker may move the hit along the body tree, one quality a
// step. The 17 parts are the Gear page's armor locations.

/** Regions in the start tables' column order. */
const REGION_ORDER = ['head', 'neck', 'torso', 'waist', 'groin', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'feet'] as const
const PAIRED: ReadonlySet<string> = new Set(['upperarm', 'forearm', 'hand', 'thigh', 'shin', 'feet'])

/** Percent per region, in REGION_ORDER (data/lubec-start-tables-per-weapon/report.md). */
export const LUBEC_START_TABLES: Readonly<Record<string, { name: string; w: readonly number[] }>> = {
  punch: { name: 'Punch', w: [40, 3, 17, 13, 2, 10, 10, 5, 0, 0, 0] },
  kick: { name: 'Kick, standing target', w: [0, 0, 20, 25, 10, 0, 5, 5, 20, 10, 5] },
  kickDown: { name: 'Kick / stomp, target down', w: [10, 2, 50, 20, 3, 5, 3, 2, 3, 1, 1] },
  swing: { name: 'Blunt swing, standing target', w: [35, 2, 15, 7, 1, 25, 8, 3, 2, 1, 1] },
  swingDown: { name: 'Blunt swing, target down', w: [10, 2, 45, 15, 1, 18, 4, 2, 1, 1, 1] },
  slash: { name: 'Slash', w: [18, 2, 20, 5, 1, 15, 20, 15, 2, 1, 1] },
  stab: { name: 'Stab', w: [3, 3, 55, 20, 2, 6, 5, 2, 2, 1, 1] },
  thrown: { name: 'Thrown object', w: [11, 2, 13, 18, 1, 8, 6, 5, 17, 12, 7] },
  firearm: { name: 'Firearm', w: [10, 2, 25, 20, 2, 7, 5, 3, 13, 9, 4] },
}

/** The region a d100 lands on: the first whose running total reaches the roll. */
export function lubecStartRegion(table: string, roll: number): string {
  const weights = LUBEC_START_TABLES[table].w
  let top = 0
  const index = weights.findIndex((weight) => (top += weight) >= roll)
  return REGION_ORDER[index]
}

export const lubecPairedRegion = (region: string): boolean => PAIRED.has(region)

/** The part a landing names: a paired region takes its side from the d10, odd for left. */
export const lubecLandingPart = (region: string, side: number): string =>
  (PAIRED.has(region) ? `${region}-${side % 2 ? 'L' : 'R'}` : region)

// The body tree: head-neck-torso-waist, groin and the thighs off the waist, the arms off the torso.
const EDGES: readonly (readonly [string, string])[] = [
  ['head', 'neck'], ['neck', 'torso'], ['torso', 'waist'], ['waist', 'groin'],
  ...(['R', 'L'] as const).flatMap((s) => [
    ['torso', `upperarm-${s}`], [`upperarm-${s}`, `forearm-${s}`], [`forearm-${s}`, `hand-${s}`],
    ['waist', `thigh-${s}`], [`thigh-${s}`, `shin-${s}`], [`shin-${s}`, `feet-${s}`],
  ] as const),
]

const NEIGHBOURS: ReadonlyMap<string, readonly string[]> = EDGES.reduce((map, [a, b]) => {
  map.set(a, [...(map.get(a) ?? []), b])
  map.set(b, [...(map.get(b) ?? []), a])
  return map
}, new Map<string, string[]>())

/** Steps from `start` to every part along the body tree. */
export function lubecPartDistances(start: string): Record<string, number> {
  const distances: Record<string, number> = { [start]: 0 }
  const queue = [start]
  for (let part = queue.shift(); part !== undefined; part = queue.shift()) {
    for (const next of NEIGHBOURS.get(part)!) {
      if (next in distances) continue
      distances[next] = distances[part] + 1
      queue.push(next)
    }
  }
  return distances
}
