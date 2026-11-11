import { useEffect, useRef, useState } from 'react'

/** A click outside the whole stack fades each visible card, without consuming the underlying action. */
export function useCombatRollDismiss(id: string, onDone: (id: string) => void) {
  const card = useRef<HTMLDivElement>(null)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    let dismissed = false
    const fade = () => { dismissed = true; setGone(true) }
    const fadeTimer = setTimeout(fade, 6500)
    let removeTimer = setTimeout(() => onDone(id), 7100)
    const outside = (event: PointerEvent) => {
      if (dismissed || card.current?.parentElement?.contains(event.target as Node)) return
      fade()
      clearTimeout(fadeTimer)
      clearTimeout(removeTimer)
      removeTimer = setTimeout(() => onDone(id), 600)
    }
    document.addEventListener('pointerdown', outside, true)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(removeTimer)
      document.removeEventListener('pointerdown', outside, true)
    }
  }, [id, onDone])
  return { card, gone }
}
