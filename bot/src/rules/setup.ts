/**
 * Whether the bot answers rules questions, decided once as it starts.
 *
 * It needs the rules document and two keys. Without any of them it says why
 * and goes on recording without answering: rules answers are never a reason
 * for the bot not to start.
 */
import { readFileSync } from 'node:fs'
import { openAiRulesAnswerer } from './answer.ts'
import { typesafeJev } from './jev.ts'
import type { Log, RulesAnswering } from './watcher.ts'

export type RulesSetup = {
  /** Where the rules document is. */
  rulesPath: string
  /** Where secrets are looked for first. */
  env: Record<string, string | undefined>
  /** Whether a secret missing from `env` is read from the project instead. */
  live: boolean
  /** Reads a secret from the project. */
  projectSecret: (name: string) => Promise<string>
  log: Log
}

/** A secret the bot can do without. One that is missing or cannot be read is empty. */
async function optionalSecret(setup: RulesSetup, name: string): Promise<string> {
  try {
    return setup.env[name] ?? (setup.live ? await setup.projectSecret(name) : '')
  } catch (error) {
    setup.log('secret unavailable', { name, error: String(error) })
    return ''
  }
}

/** Answering rules questions, if the bot has the rules document and the keys it needs. */
export async function rulesAnswering(setup: RulesSetup): Promise<RulesAnswering | undefined> {
  const { rulesPath, log } = setup
  let rulesDocument: string
  try {
    rulesDocument = readFileSync(rulesPath, 'utf8')
  } catch {
    log('rules answers off', { reason: `there is no rules document at ${rulesPath}` })
    return undefined
  }
  if (!rulesDocument.trim()) {
    log('rules answers off', { reason: `the rules document at ${rulesPath} is empty` })
    return undefined
  }
  const [typesafeKey, openAiKey] = await Promise.all([optionalSecret(setup, 'TYPESAFE_API_KEY'), optionalSecret(setup, 'OPENAI_API_KEY')])
  const missing = [!typesafeKey && 'TYPESAFE_API_KEY', !openAiKey && 'OPENAI_API_KEY'].filter(Boolean)
  if (missing.length > 0) {
    log('rules answers off', { reason: `${missing.join(' and ')} not set` })
    return undefined
  }
  log('rules answers on', { rulesDocument: rulesPath, characters: rulesDocument.length })
  return {
    askJev: typesafeJev({ apiKey: typesafeKey }),
    answer: openAiRulesAnswerer({ apiKey: openAiKey, rulesDocument }),
    log,
  }
}
