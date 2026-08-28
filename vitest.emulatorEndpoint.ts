export function emulatorPort(environmentVariable: string, fallback: number): number {
  const endpoint = process.env[environmentVariable]
  if (!endpoint) return fallback
  const port = Number.parseInt(endpoint.split(':').at(-1) ?? '', 10)
  return Number.isFinite(port) ? port : fallback
}
