import { useCallback, useMemo, useState } from 'react'
import { makeId } from './characterFactories'
import {
  buildPoolLabel,
  poolDiceCount,
  rollDice,
  type PresetPool,
  type StagedAttr,
  type StagedSecond,
} from './vtmRoll'

// Local, session-only state for the V:tM sheet roller. It never mutates the
// character: it only reads ratings handed to it and keeps its own staging +
// roll history in component state. History is intentionally not persisted.

export type RollPreset = 'initiative' | 'soak' | 'damage'
export type RollBarMode = 'builder' | 'damage' | 'single'

export type RollEntry = {
  id: string
  label: string
  count: number
  dice: number[]
  ts: number
}

export type VtmRoller = ReturnType<typeof useVtmRoller>

const DEFAULT_DAMAGE_DICE = 6

export function useVtmRoller(characterId: string | null) {
  const [rollMode, setRollMode] = useState(false)
  const [stagedAttr, setStagedAttr] = useState<StagedAttr>(null)
  const [stagedSecond, setStagedSecond] = useState<StagedSecond>(null)
  const [barMode, setBarMode] = useState<RollBarMode>('builder')
  const [activePreset, setActivePreset] = useState<RollPreset | null>(null)
  const [damageDice, setDamageDice] = useState(DEFAULT_DAMAGE_DICE)
  const [history, setHistory] = useState<RollEntry[]>([])
  const [viewIndex, setViewIndex] = useState(-1)
  const [logOpen, setLogOpen] = useState(false)

  // Switching characters resets the whole roller — staging and history are
  // per-character session state, and must not leak between sheets. Reset during
  // render (the recommended pattern) rather than in an effect.
  const [activeCharacterId, setActiveCharacterId] = useState(characterId)
  if (characterId !== activeCharacterId) {
    setActiveCharacterId(characterId)
    setRollMode(false)
    setStagedAttr(null)
    setStagedSecond(null)
    setBarMode('builder')
    setActivePreset(null)
    setDamageDice(DEFAULT_DAMAGE_DICE)
    setHistory([])
    setViewIndex(-1)
    setLogOpen(false)
  }

  const poolCount = barMode === 'damage' ? damageDice : poolDiceCount(stagedAttr, stagedSecond)

  const pushRoll = useCallback((label: string, count: number, dice: number[]) => {
    setHistory((current) => {
      const next = [...current, { id: makeId(), label, count, dice, ts: Date.now() }]
      setViewIndex(next.length - 1)
      return next
    })
  }, [])

  const openRoller = useCallback(() => setRollMode(true), [])
  const closeRoller = useCallback(() => {
    setRollMode(false)
    setLogOpen(false)
  }, [])

  // Hand-staging a trait always returns to the pool builder, dropping any active
  // preset or single-trait mode.
  const stageAttr = useCallback((name: string, rating: number) => {
    setBarMode('builder')
    setActivePreset(null)
    setStagedAttr((current) => (current && current.name === name ? null : { name, rating }))
  }, [])

  const stageSecond = useCallback((kind: 'Ability' | 'Discipline', name: string, rating: number) => {
    setBarMode('builder')
    setActivePreset(null)
    setStagedSecond((current) => (current && current.name === name ? null : { kind, name, rating }))
  }, [])

  const clearSlot = useCallback((slot: 1 | 2) => {
    if (slot === 1) setStagedAttr(null)
    else setStagedSecond(null)
  }, [])

  // Functional update so rapid +/- clicks within one render don't drop steps
  // (each click would otherwise read the same stale value).
  const adjustDamageDice = useCallback((delta: number) => {
    setDamageDice((current) => Math.max(1, current + delta))
  }, [])

  const applyPreset = useCallback((preset: RollPreset, pool?: PresetPool) => {
    setActivePreset(preset)
    if (preset === 'damage') {
      setBarMode('damage')
      setStagedAttr(null)
      setStagedSecond(null)
      return
    }
    setBarMode('builder')
    setStagedAttr(pool?.attr ?? null)
    setStagedSecond(pool?.second ?? null)
  }, [])

  const clearStage = useCallback(() => {
    setStagedAttr(null)
    setStagedSecond(null)
    setBarMode('builder')
    setActivePreset(null)
  }, [])

  const rollPool = useCallback(() => {
    if (barMode === 'damage') {
      const count = Math.max(1, damageDice)
      pushRoll('Damage', count, rollDice(count))
      return
    }
    const count = poolDiceCount(stagedAttr, stagedSecond)
    if (count <= 0) return
    pushRoll(buildPoolLabel(stagedAttr, stagedSecond) || 'Pool', count, rollDice(count))
  }, [barMode, damageDice, stagedAttr, stagedSecond, pushRoll])

  // Single-trait rolls (Virtues / Willpower / Humanity) don't build a pool, so
  // they collapse the builder and just show a result.
  const rollSingle = useCallback((name: string, rating: number) => {
    setActivePreset(null)
    setBarMode('single')
    const count = Math.max(0, rating)
    pushRoll(name, count, rollDice(count))
  }, [pushRoll])

  const navPrev = useCallback(() => setViewIndex((index) => Math.max(0, index - 1)), [])
  const navNext = useCallback(() => setViewIndex((index) => (index < 0 ? -1 : Math.min(history.length - 1, index + 1))), [history.length])
  const navLatest = useCallback(() => setViewIndex(history.length - 1), [history.length])

  const current = viewIndex >= 0 && viewIndex < history.length ? history[viewIndex] : null
  const isLatest = viewIndex === history.length - 1

  const isStaged = useCallback(
    (kind: 'attr' | 'second', name: string) =>
      kind === 'attr' ? stagedAttr?.name === name : stagedSecond?.name === name,
    [stagedAttr, stagedSecond],
  )

  return useMemo(
    () => ({
      rollMode,
      openRoller,
      closeRoller,
      stagedAttr,
      stagedSecond,
      barMode,
      activePreset,
      damageDice,
      adjustDamageDice,
      poolCount,
      stageAttr,
      stageSecond,
      clearSlot,
      applyPreset,
      clearStage,
      rollPool,
      rollSingle,
      history,
      viewIndex,
      current,
      isLatest,
      navPrev,
      navNext,
      navLatest,
      canPrev: viewIndex > 0,
      canNext: viewIndex >= 0 && viewIndex < history.length - 1,
      logOpen,
      openLog: () => setLogOpen(true),
      closeLog: () => setLogOpen(false),
      isStaged,
    }),
    [
      rollMode, openRoller, closeRoller, stagedAttr, stagedSecond, barMode, activePreset,
      damageDice, adjustDamageDice, poolCount, stageAttr, stageSecond, clearSlot, applyPreset, clearStage,
      rollPool, rollSingle, history, viewIndex, current, isLatest, navPrev, navNext, navLatest,
      logOpen, isStaged,
    ],
  )
}
