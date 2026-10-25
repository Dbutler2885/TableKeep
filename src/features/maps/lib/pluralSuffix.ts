// The "s" that makes "token" into "tokens" beside a count.
export function pluralSuffix(count: number) {
  return count === 1 ? '' : 's'
}
