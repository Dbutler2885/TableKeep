/**
 * The Classic Fantasy rules corpus as one rules document, and its two
 * further parts.
 *
 * `docs/rules/ose-classic/corpus.json` holds the pre-2026 Classic Fantasy
 * core rules as pages of sections, each with a heading level and Markdown body
 * lines, tables included. The answering model is given the whole of it as
 * Markdown, the way it is given the Lubec rules: one heading per section, its
 * body lines as they are, and an opening that says what the rules are and what
 * they leave out.
 *
 * `monsters.json` and `spells-and-items.json` hold, in the same shape, what
 * the core rules leave out: monsters and encounters; and spells, equipment and
 * treasure. Each renders as a part of its own, with its own opening, to follow
 * the core rules when a question needs it.
 *
 * Section titles repeat across pages (every class has its own "Combat"), so
 * each heading carries the titles above it, "Cleric › Combat", and an answer
 * can name the one section it came from.
 *
 * The text is Open Game Content. The license travels beside the corpus as
 * `OGL.txt`, wherever the corpus is copied to, and the document says so.
 */

type Section = { title: string; level: number; markdownLines: string[] }
/** `partOf` names the page a page is filed under, such as "Cleric Spells" for one cleric spell. */
type Page = { title: string; partOf?: string; sections: Section[] }
type Corpus = { pages: Page[]; source: { edition: string; revisionDate: string }; license: { notice: string } }

/** Joins a heading's titles, page first. */
const TRAIL = ' › '

function opening(corpus: Corpus): string {
  return `# Classic Fantasy rules (pre-2026 text)

These are the Classic Fantasy rules the group plays by, from the ${corpus.source.edition} as transcribed on ${corpus.source.revisionDate}.
They are the rules text as it stood before the 2026 edition. Nothing from the 2026 edition is in them.

They cover creating a character, ability scores, alignment, languages and advancement; the seven classic classes (Cleric, Dwarf, Elf, Fighter, Halfling, Magic-User and Thief); adventuring, encounters and combat; how magic is memorised, cast and researched; money, weapon qualities, vehicles, retainers, mercenaries, specialists and strongholds; and refereeing and awarding XP.

These core rules do not include the spell lists or what any spell does, monster descriptions or encounter tables, treasure, equipment lists and prices, any weapon's damage or range, vessel specifications, or the Advanced classes and races. When a question needs monsters, or spells, equipment and treasure, those follow the core rules in this document as parts of their own, each opening with its own title. What is in none of the parts here is not covered: the rules sometimes refer to it, but that does not make it part of the rules.

Every section has its own heading, which names the page it is on and the sections above it, such as "Combat${TRAIL}Initiative", so a rule can be cited by its heading. A heading marked "(Optional Rule)" is an optional rule: say so when an answer depends on it.

${corpus.license.notice.replace('in the pages array', 'below')}`
}

function monstersOpening(corpus: Corpus): string {
  return `# Classic Fantasy monsters (pre-2026 text)

This part of the rules document holds the Classic Fantasy monsters, from the same ${corpus.source.edition} text as the core rules: how a monster's game statistics are read, every monster's description and statistics (each filed under "Monster Descriptions"), the dungeon, wilderness and stronghold encounter tables, and adventuring parties.

${corpus.license.notice.replace('in the pages array', 'in this part')}`
}

function spellsAndItemsOpening(corpus: Corpus): string {
  return `# Classic Fantasy spells, equipment and treasure (pre-2026 text)

This part of the rules document holds, from the same ${corpus.source.edition} text as the core rules: the cleric and magic-user spell lists and what every spell does (each filed under its list); adventuring gear, weapons and armor with their costs, weights, damage and qualities, mounts, and land and water vehicles; and treasure: treasure types, gems and jewellery, and every magic item (each filed under its kind).

${corpus.license.notice.replace('in the pages array', 'in this part')}`
}

/** A section's heading: one level below the document's own title, naming the titles above it. */
function heading(trail: readonly string[]): string {
  return `${'#'.repeat(Math.min(trail.length + 1, 6))} ${trail.join(TRAIL)}`
}

function renderPage(page: Page): string[] {
  const parts: string[] = []
  const filedUnder = page.partOf ? [page.partOf] : []
  const trail: string[] = []
  for (const section of page.sections) {
    trail.length = section.level - 1
    trail.push(section.title)
    parts.push(heading([...filedUnder, ...trail]))
    const body = section.markdownLines.join('\n').trim()
    if (body) parts.push(body)
  }
  return parts
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isSection(value: unknown): value is Section {
  const section = value as Partial<Section> | null
  return (
    isText(section?.title) &&
    Number.isInteger(section.level) &&
    section.level! >= 1 &&
    Array.isArray(section.markdownLines) &&
    section.markdownLines.every((line) => typeof line === 'string')
  )
}

/** Sections that make a page: at least one, the first being the page's own title. */
function isPageBody(sections: unknown): sections is Section[] {
  return Array.isArray(sections) && sections.length > 0 && sections.every(isSection) && sections[0]!.level === 1
}

function isPage(value: unknown): value is Page {
  const page = value as Partial<Page> | null
  return isText(page?.title) && (page.partOf === undefined || isText(page.partOf)) && isPageBody(page.sections)
}

/** What a usable corpus must have, in the order it is checked, and what is said when it does not. */
const CORPUS_CHECKS: { holds: (corpus: Partial<Corpus>) => boolean; problem: (corpus: Partial<Corpus>) => string }[] = [
  { holds: (corpus) => Array.isArray(corpus.pages) && corpus.pages.length > 0, problem: () => 'The Classic Fantasy corpus has no pages.' },
  {
    holds: (corpus) => corpus.pages!.every(isPage),
    problem: (corpus) => `Page ${corpus.pages!.findIndex((page) => !isPage(page)) + 1} of the Classic Fantasy corpus is not a page of sections.`,
  },
  {
    holds: (corpus) => isText(corpus.source?.edition) && isText(corpus.source.revisionDate),
    problem: () => 'The Classic Fantasy corpus does not say where it is from.',
  },
  { holds: (corpus) => isText(corpus.license?.notice), problem: () => 'The Classic Fantasy corpus carries no license notice.' },
]

/** The corpus read from its JSON, or why it cannot be used. */
function readCorpus(json: string): Corpus {
  const corpus = (JSON.parse(json) ?? {}) as Partial<Corpus>
  const failed = CORPUS_CHECKS.find((check) => !check.holds(corpus))
  if (failed) throw new Error(failed.problem(corpus))
  return corpus as Corpus
}

function render(json: string, opens: (corpus: Corpus) => string): string {
  const corpus = readCorpus(json)
  return [opens(corpus), ...corpus.pages.flatMap(renderPage)].join('\n\n') + '\n'
}

/** The whole core corpus as one Markdown rules document. */
export function renderClassicFantasyCorpus(json: string): string {
  return render(json, opening)
}

/** The monsters, as a part to follow the core rules. */
export function renderClassicFantasyMonsters(json: string): string {
  return render(json, monstersOpening)
}

/** The spells, equipment and treasure, as a part to follow the core rules. */
export function renderClassicFantasySpellsAndItems(json: string): string {
  return render(json, spellsAndItemsOpening)
}
