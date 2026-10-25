import { useLayoutEffect, useRef } from 'react'
import { centreLubecInk } from './lubecInkCentre'

/** A ref whose element is moved so its text's ink is centred, measured again whenever the text changes. */
export function useLubecInkCentre<T extends HTMLElement>(text: string) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    if (ref.current) centreLubecInk(ref.current)
  }, [text])
  return ref
}
