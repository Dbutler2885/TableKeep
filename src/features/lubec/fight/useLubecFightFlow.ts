import { useState } from 'react'
import { lubecChosenWeaponName } from './lubecFightWeapons'
import { lubecCombatantGear, lubecCombatantKey, lubecTargetChoices, type LubecCombatant, type LubecFightRequest } from './lubecFightRequest'

export const WEAPON_STEP = 0
export const TARGET_STEP = 1

// Keep the chosen id while reading its eligibility and name from the current hands.
function useWeaponChoice(request: LubecFightRequest) {
  const gear = lubecCombatantGear(request.attacker)
  const [weaponId, setWeaponId] = useState(request.weaponItemId ?? null)
  const weaponName = lubecChosenWeaponName(gear, weaponId)
  return { gear, weaponId, weaponName, setWeaponId }
}

// Keep the chosen key while resolving it only against the currently offered targets.
function useTargetChoice(request: LubecFightRequest, targets: readonly LubecCombatant[]) {
  const [targetKey, setTargetKey] = useState(() => (request.target ? lubecCombatantKey(request.target) : ''))
  const choices = lubecTargetChoices(request, targets)
  const target = choices.find((c) => lubecCombatantKey(c) === targetKey) ?? null
  return { choices, target, setTargetKey }
}

/** Local Weapon and Target flow, independent of the modal or its sheet and map hosts. */
export function useLubecFightFlow(request: LubecFightRequest, targets: readonly LubecCombatant[]) {
  const { gear, weaponId, weaponName, setWeaponId } = useWeaponChoice(request)
  const targetChoice = useTargetChoice(request, targets)
  const [step, setStep] = useState(() => (weaponName ? TARGET_STEP : WEAPON_STEP))
  const chooseWeapon = (id: string) => {
    setWeaponId(id)
    setStep(TARGET_STEP)
  }
  return {
    gear, weaponId, weaponName, chooseWeapon, setStep, ...targetChoice,
    step: weaponName ? step : WEAPON_STEP,
  }
}
