// The media fields of a stored record, as plain values. Nothing here touches
// Firebase, so a parser that reads or writes media fields stays loadable
// without the SDK singleton.
import type { TokenIconConfig } from '../tokens/TokenIconEditor'

export const isRenderableImageUrl = (value: string | null | undefined) =>
  typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:'))

export const sanitizeTokenIconForPersistence = (tokenIcon: TokenIconConfig): TokenIconConfig => {
  const persisted = { ...tokenIcon }
  delete persisted.customImageUrl
  return persisted
}
