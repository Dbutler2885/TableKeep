import { emptyLubecGear, type LubecItem, type LubecSupply } from '../gearRecord'

export const lineageSupply: LubecSupply = { id: 'custom', name: 'Red chalk rounds', loose: [1, 4], future: { color: 'red' } }
export const lineageWeapon: LubecItem = {
  id: 'balls', kind: 'weapon', name: 'Dodgeball', note: 'Marked by Wayne', qty: 4, per: 4,
  carrier: 'hands', slot: 0, size: 1, weight: 'normal', hands: 1,
  mode: 'thrown', impact: -1, table: 'dodgeball', wounds: ['blunt'],
  catchChance: 50, catchPutsThrowerOut: true, takes: 'custom', fits: 'custom', loaded: 3, capacity: 5,
  ranges: [{ band: 'short', distance: 'Across the gym', modifier: -7, future: { indoor: true } }],
  art: 'weapon', picturePath: 'groups/g/campaigns/c/item-art/balls.webp', shape: 'square',
  future: { maker: 'WG', rules: ['one', 'two'] },
}
export const lineageGear = (items: LubecItem[] = [lineageWeapon], supplies: LubecSupply[] = [lineageSupply]) =>
  ({ ...emptyLubecGear(), items, supplies, futureGear: 'preserved' })
