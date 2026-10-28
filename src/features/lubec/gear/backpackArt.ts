// The backpack pictures a character may carry, by short name (spec 6.1). The
// short name is the stored `lubec.gear.backpackArt`, the label in the picker
// and the file name: each is `assets/backpacks/<name>.webp`, prepared on the
// default pack's canvas by scripts/backpacks/prepare.sh, with a
// `<name>.thumb.webp` thumbnail for the picker. The default comes first.
import { LUBEC_DEFAULT_BACKPACK_ART } from '../../ruleSets/lubec/gear/gearRecord'

export const LUBEC_BACKPACK_ARTS = [
  LUBEC_DEFAULT_BACKPACK_ART,
  'olive-band',
  'olive-molle',
  'flap-rucksack',
  'retro-swirl',
  'navy-sage',
  'tan-stripe',
  'burgundy-blue',
  'burgundy-tan',
  'slate-tan',
  'blue-red',
  'olive-navy',
  'olive-stripe',
  'olive-tan',
  'olive-buckle',
  'rust-navy',
  'slate-red',
  'teal',
] as const

export type LubecBackpackArt = (typeof LUBEC_BACKPACK_ARTS)[number]

// Each picture is its own file, fetched only once asked for, so the page
// downloads the chosen pack alone and the thumbnails only when the picker opens.
const pictures = import.meta.glob<string>('./assets/backpacks/*.webp', { query: '?url', import: 'default' })

/** The URL of a pack's picture, or of its thumbnail. */
export const lubecBackpackUrl = (name: LubecBackpackArt, thumb = false): Promise<string> =>
  pictures[`./assets/backpacks/${name}${thumb ? '.thumb' : ''}.webp`]()
