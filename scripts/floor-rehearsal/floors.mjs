// Reading and replacing the character schema floors in `firestore.rules`.
//
// A rules file cannot import anything, so the floors are written out there as
// one map literal in `characterSchemaFloors()`. Its keys double as the rules'
// list of rule sets. The drift test, the fence's emulator suite and the
// raised-floor rehearsal all go through this module, so there is one reading of
// that literal rather than three.

const FLOORS_FUNCTION = /(function characterSchemaFloors\(\) \{\s*return )\{([^}]*)\}(;)/
const FLOOR_ENTRY = /"([^"]+)":\s*(\d+)/g

function floorsFunction(rulesText) {
  const match = FLOORS_FUNCTION.exec(rulesText)
  if (!match) throw new Error('firestore.rules has no characterSchemaFloors() map literal.')
  return match
}

/** The floor of each rule set, by id, as `firestore.rules` declares them. */
export function readCharacterSchemaFloors(rulesText) {
  const [, , entries] = floorsFunction(rulesText)
  return Object.fromEntries([...entries.matchAll(FLOOR_ENTRY)].map(([, id, floor]) => [id, Number(floor)]))
}

/** The rules text with `characterSchemaFloors()` returning exactly `floors`. */
export function withCharacterSchemaFloors(rulesText, floors) {
  floorsFunction(rulesText)
  const literal = Object.entries(floors).map(([id, floor]) => `"${id}": ${floor}`).join(', ')
  return rulesText.replace(FLOORS_FUNCTION, (_match, head, _entries, tail) => `${head}{${literal}}${tail}`)
}

/**
 * Everything wrong between the rules' floors and the versions the app writes:
 * a rule set only one side knows, or a floor above the current version, which
 * would refuse every write the app can make.
 */
export function characterSchemaFloorDrift(floors, currentVersions) {
  const problems = []
  for (const id of Object.keys(floors)) {
    if (!Object.hasOwn(currentVersions, id)) problems.push(`firestore.rules has a floor for "${id}", which the registry does not know.`)
    else if (floors[id] > currentVersions[id]) problems.push(`"${id}" has floor ${floors[id]}, above its current version ${currentVersions[id]}.`)
  }
  for (const id of Object.keys(currentVersions)) {
    if (!Object.hasOwn(floors, id)) problems.push(`firestore.rules has no floor for "${id}".`)
  }
  return problems
}
