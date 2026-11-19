/**
 * The rules each kind of campaign is answered from.
 *
 * A session is answered from the rules of its campaign's rule set: the
 * campaign's `system`, resolved as the app resolves it, so a campaign without
 * one is OSE. A rule set with no rules here, such as VTM, is not answered.
 *
 * The files are named from the repository root. The bot's image keeps each
 * one at the same place under /app, so the same paths serve both.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { CharacterRuleSet as RuleSet } from '../../../functions/src/characterSchemaVersions.ts'
import { renderClassicFantasyCorpus } from './classicFantasy.ts'

export type { RuleSet }

export type RulesBook = {
  /** Where the rules are, from the repository root. */
  file: string
  /** The license the rules are used under, from the repository root, which must travel with them. */
  license?: string
  /** How a posted answer names the rules it comes from: "From {citedAs}: {section}". */
  citedAs: string
  /** The rules document the answering model is given, from the file's contents. */
  render: (contents: string) => string
}

export const RULES_BOOKS: Partial<Record<RuleSet, RulesBook>> = {
  lubec: {
    file: 'docs/lubec/rules.md',
    citedAs: 'the rules document',
    render: (contents) => contents,
  },
  ose: {
    file: 'docs/rules/ose-classic/corpus.json',
    license: 'docs/rules/ose-classic/OGL.txt',
    citedAs: 'the pre-2026 Classic Fantasy rules',
    render: renderClassicFantasyCorpus,
  },
}

/** A rule set's rules document, read from under `root`. Throws, saying why, when there is none to use. */
export function readRulesBook(root: string, book: RulesBook): string {
  const at = path.join(root, book.file)
  let contents: string
  try {
    contents = readFileSync(at, 'utf8')
  } catch {
    throw new Error(`there is no rules document at ${at}`)
  }
  let document: string
  try {
    document = book.render(contents)
  } catch (error) {
    throw new Error(`the rules at ${at} cannot be read: ${(error as Error).message}`)
  }
  if (!document.trim()) throw new Error(`the rules document at ${at} is empty`)
  return document
}
