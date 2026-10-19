/**
 * The version each rule set's characters are written at: the Cloud Functions
 * copy of the registry's `characters.schemaVersion`, which this package cannot
 * import. `src/features/ruleSets/characterSchemaFloors.test.ts` pins the two
 * together.
 *
 * The transfer callable writes with admin access, which the rules' version
 * floor does not see, so it checks and stamps versions itself (Spec A 5.9).
 */
export const characterSchemaVersions = { ose: 1, vtm: 1, lubec: 1 };
/**
 * A campaign's stored `system` as the app resolves it: a registered id gives
 * itself; anything else, including a missing or empty value, gives OSE.
 */
export function resolveCharacterRuleSet(system) {
    return typeof system === 'string' && Object.hasOwn(characterSchemaVersions, system)
        ? system
        : 'ose';
}
/** The version a campaign's characters are written at, from its stored `system`. */
export function currentCharacterSchemaVersion(system) {
    return characterSchemaVersions[resolveCharacterRuleSet(system)];
}
export const CHARACTER_BEING_UPDATED_MESSAGE = 'This character is being updated. Try again in a minute.';
/**
 * Whether a stored character is at `version`. A missing `schemaVersion` means
 * 0, written before versioning. Below the version, the character has not been
 * migrated yet; above it, this function is older than the data.
 */
export function isCharacterAtSchemaVersion(character, version) {
    return (character?.schemaVersion ?? 0) === version;
}
