/**
 * Whether the bot answers rules questions, decided once as it starts.
 *
 * It needs the rules of at least one rule set and two keys. Without them it
 * says why and goes on recording without answering: rules answers are never a
 * reason for the bot not to start. Rules that cannot be read leave only their
 * own rule set's sessions unanswered.
 */
import path from 'node:path'
import { openAiRulesAnswerer } from './answer.ts'
import { readRulesBook, RULES_BOOKS, type RuleSet, type RulesBook } from './books.ts'
import { typesafeJev } from './jev.ts'
import type { Log, RulesAnswering, SessionRules } from './watcher.ts'

export type RulesSetup = {
  /** The repository root, or /app in the bot's image, which the rules' files are named from. */
  root: string
  /** Where secrets are looked for first. */
  env: Record<string, string | undefined>
  /** Whether a secret missing from `env` is read from the project instead. */
  live: boolean
  /** Reads a secret from the project. */
  projectSecret: (name: string) => Promise<string>
  log: Log
  /** The rules of each rule set. */
  books?: Partial<Record<RuleSet, RulesBook>>
  /** How the model services are called. */
  fetch?: typeof globalThis.fetch
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

/** The rules documents that can be read, by rule set. Each one that cannot is logged with why. */
function readRules(setup: RulesSetup): Map<RuleSet, { book: RulesBook; document: string }> {
  const documents = new Map<RuleSet, { book: RulesBook; document: string }>()
  for (const [ruleSet, book] of Object.entries(setup.books ?? RULES_BOOKS) as [RuleSet, RulesBook][]) {
    try {
      documents.set(ruleSet, { book, document: readRulesBook(setup.root, book) })
    } catch (error) {
      setup.log('rules unavailable', { ruleSet, reason: (error as Error).message })
    }
  }
  return documents
}

/** Answering rules questions, if the bot has rules to answer from and the keys it needs. */
export async function rulesAnswering(setup: RulesSetup): Promise<RulesAnswering | undefined> {
  const { log, fetch } = setup
  const documents = readRules(setup)
  if (documents.size === 0) {
    log('rules answers off', { reason: 'there are no rules to answer from' })
    return undefined
  }
  const [typesafeKey, openAiKey] = await Promise.all([optionalSecret(setup, 'TYPESAFE_API_KEY'), optionalSecret(setup, 'OPENAI_API_KEY')])
  const missing = [!typesafeKey && 'TYPESAFE_API_KEY', !openAiKey && 'OPENAI_API_KEY'].filter(Boolean)
  if (missing.length > 0) {
    log('rules answers off', { reason: `${missing.join(' and ')} not set` })
    return undefined
  }
  const byRuleSet: Partial<Record<RuleSet, SessionRules>> = {}
  const on: Record<string, { rulesDocument: string; characters: number }> = {}
  for (const [ruleSet, { book, document }] of documents) {
    byRuleSet[ruleSet] = { citedAs: book.citedAs, answer: openAiRulesAnswerer({ apiKey: openAiKey, rulesDocument: document, fetch }) }
    on[ruleSet] = { rulesDocument: path.join(setup.root, book.file), characters: document.length }
  }
  log('rules answers on', on)
  return { askJev: typesafeJev({ apiKey: typesafeKey, fetch }), byRuleSet, log }
}
