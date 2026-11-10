// The report's "Lasting injuries" table: each named injury a wound row can leave.
// A row names its injury itself; this list is what those names may be.
// "Survived Critical or Catastrophic wound" is named after the wound, so it is not listed.
export const LUBEC_LASTING_INJURIES: readonly string[] = [
  'Broken jaw', 'Lost eye', 'Damaged eye', 'Scarred face', 'Damaged throat', 'Broken ribs', 'Chest wound',
  'Internal injury', 'Lodged object', 'Broken pelvis', 'Damaged hip', 'Dislocated shoulder', 'Damaged shoulder',
  'Broken arm', 'Broken hand', 'Cut muscle', 'Cut tendons', 'Lost fingers', 'Broken leg', 'Damaged knee or ankle',
]

/** A row may leave one injury, or either of two ("Cut tendons or Lost fingers"), each from the list. */
export const isLubecLastingInjury = (name: string): boolean =>
  LUBEC_LASTING_INJURIES.includes(name) || name.split(' or ').every((part) => LUBEC_LASTING_INJURIES.includes(part))
