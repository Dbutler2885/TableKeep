/**
 * Whether the bot answers rules questions, decided once as it starts.
 *
 * It needs the rules of at least one rule set and two keys. Without them it
 * says why and goes on recording without answering: rules answers are never a
 * reason for the bot not to start. Rules that cannot be read leave only their
 * own rule set's sessions unanswered. A part of the rules sent only when a
 * question needs it that cannot be read is left out, and its rule set is
 * answered without it.
 */
import path from 'node:path'
import { openAiRulesAnswerer } from './answer.ts'
import { readRulesBook, RULES_BOOKS, type RuleSet, type RulesBook, type RulesPart, type Supplement } from './books.ts'
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

type ReadRules = { book: RulesBook; document: string; supplements: Partial<Record<Supplement, string>> }

/** The parts of a rule set's rules that can be read, by name. Each one that cannot is logged with why. */
function readSupplements(setup: RulesSetup, ruleSet: RuleSet, book: RulesBook): Partial<Record<Supplement, string>> {
  const supplements: Partial<Record<Supplement, string>> = {}
  for (const [supplement, part] of Object.entries(book.supplements ?? {}) as [Supplement, RulesPart][]) {
    try {
      supplements[supplement] = readRulesBook(setup.root, part)
    } catch (error) {
      setup.log('rules part unavailable', { ruleSet, supplement, reason: (error as Error).message })
    }
  }
  return supplements
}

/** The rules documents that can be read, by rule set, with the parts of them that can. Each one that cannot is logged with why. */
function readRules(setup: RulesSetup): Map<RuleSet, ReadRules> {
  const documents = new Map<RuleSet, ReadRules>()
  for (const [ruleSet, book] of Object.entries(setup.books ?? RULES_BOOKS) as [RuleSet, RulesBook][]) {
    let document: string
    try {
      document = readRulesBook(setup.root, book)
    } catch (error) {
      setup.log('rules unavailable', { ruleSet, reason: (error as Error).message })
      continue
    }
    documents.set(ruleSet, { book, document, supplements: readSupplements(setup, ruleSet, book) })
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
  const on: Record<string, { rulesDocument: string; characters: number; supplements?: Record<string, number> }> = {}
  for (const [ruleSet, { book, document, supplements }] of documents) {
    byRuleSet[ruleSet] = {
      citedAs: book.citedAs,
      supplements: Object.keys(supplements) as Supplement[],
      answer: openAiRulesAnswerer({ apiKey: openAiKey, rulesDocument: document, supplements, fetch }),
    }
    on[ruleSet] = {
      rulesDocument: path.join(setup.root, book.file),
      characters: document.length,
      ...(Object.keys(supplements).length > 0 && {
        supplements: Object.fromEntries(Object.entries(supplements).map(([name, part]) => [name, part.length])),
      }),
    }
  }
  log('rules answers on', on)
  return { askJev: typesafeJev({ apiKey: typesafeKey, fetch }), byRuleSet, log }
}
