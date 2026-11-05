import { combatHasSheet, useLubecCombat } from './combatWatch'

/**
 * Over the real Gear page when a hand tap in the Combat tab opened it, while the fight still has this sheet in it:
 * the mock-up's notice, with the way back to the same pending combat.
 */
export function LubecCombatGearNotice({ sheetId }: { sheetId: string }) {
  const { live, openCombat } = useLubecCombat()
  if (!openCombat || !combatHasSheet(live, sheetId)) return null
  return (
    <div className="notice hot lubec-combat-back">
      <span><b>Combat is running.</b> You opened your inventory from the Combat tab. Change what is in your hands here, then go back.</span>{' '}
      <button type="button" className="btn rust small" onClick={openCombat}>Back to Combat</button>
    </div>
  )
}
