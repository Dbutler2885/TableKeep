import type { ReactNode } from 'react'

type TokenLayerProps<T> = {
  className: string
  ariaLabel?: string
  ariaHidden?: boolean
  tokens: T[]
  renderToken: (token: T, index: number) => ReactNode
}

export function TokenLayer<T>({ className, ariaLabel, ariaHidden, tokens, renderToken }: TokenLayerProps<T>) {
  return (
    <div className={className} aria-label={ariaLabel} aria-hidden={ariaHidden}>
      {tokens.map(renderToken)}
    </div>
  )
}
