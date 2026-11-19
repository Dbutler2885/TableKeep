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
import { renderClassicFantasyCorpus, renderClassicFantasyMonsters, renderClassicFantasySpellsAndItems } from './classicFantasy.ts'

export type { RuleSet }

/**
 * The parts of a rule set's rules that are only sent when a question needs
 * them, in the order they follow the core rules. Jev is asked, of each, whether
 * the question needs it.
 */
export const SUPPLEMENTS = ['monsters', 'spellsAndItems'] as const
export type Supplement = (typeof SUPPLEMENTS)[number]

/** A further part of a rule set's rules, in the same shape as the rules themselves. */
export type RulesPart = Pick<RulesBook, 'file' | 'render'>

export type RulesBook = {
  /** Where the rules are, from the repository root. */
  file: string
  /** The license the rules are used under, from the repository root, which must travel with them. */
  license?: string
  /**
   * How a posted answer's last line names the rules it comes from: "From
   * {citedAs}: {section}". Null posts the answer with no such line.
   */
  citedAs: string | null
  /** The rules document the answering model is given, from the file's contents. */
  render: (contents: string) => string
  /** Parts of the rules sent after the rules document only when a question needs them. */
  supplements?: Partial<Record<Supplement, RulesPart>>
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
    // The captain's decision: OSE answers carry no line naming their source or edition.
    citedAs: null,
    render: renderClassicFantasyCorpus,
    // Under the same license as the core rules, and generated beside them.
    supplements: {
      monsters: { file: 'docs/rules/ose-classic/monsters.json', render: renderClassicFantasyMonsters },
      spellsAndItems: { file: 'docs/rules/ose-classic/spells-and-items.json', render: renderClassicFantasySpellsAndItems },
    },
  },
}

/** A rule set's rules document, or one of its parts, read from under `root`. Throws, saying why, when there is none to use. */
export function readRulesBook(root: string, book: RulesPart): string {
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
