export type ExistingTokenName = string | { name: string }

export type DuplicateTokenNamingOptions = {
  fallbackName?: string
}

export function nextDuplicateTokenName(
  baseName: string,
  existingTokensOrNames: readonly ExistingTokenName[],
  options: DuplicateTokenNamingOptions = {},
): string {
  const base = normalizeDuplicateTokenBaseName(baseName, options.fallbackName)
  const suffixPattern = new RegExp(`^${escapeRegExp(base)} \\((\\d+)\\)$`)
  let hasExistingMatch = false
  let highestOrdinal = 1

  for (const tokenOrName of existingTokensOrNames) {
    const name = typeof tokenOrName === 'string' ? tokenOrName : tokenOrName.name
    const trimmed = name.trim()
    if (trimmed === base) {
      hasExistingMatch = true
      continue
    }

    const suffixMatch = suffixPattern.exec(trimmed)
    if (!suffixMatch) continue

    const ordinal = Number.parseInt(suffixMatch[1], 10)
    if (!Number.isFinite(ordinal)) continue

    hasExistingMatch = true
    highestOrdinal = Math.max(highestOrdinal, ordinal)
  }

  return hasExistingMatch ? `${base} (${Math.max(2, highestOrdinal + 1)})` : base
}

export function normalizeDuplicateTokenBaseName(
  baseName: string,
  fallbackName = 'Token',
): string {
  const trimmedBase = baseName.trim() || fallbackName.trim() || 'Token'
  return trimmedBase.replace(/\s+\(\d+\)$/, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
