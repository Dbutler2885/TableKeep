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
