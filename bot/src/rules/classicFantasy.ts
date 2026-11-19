/**
 * The Classic Fantasy rules corpus as one rules document.
 *
 * `docs/rules/ose-classic/corpus.json` holds the pre-2026 Classic Fantasy
 * rules as pages of sections, each with a heading level and Markdown body
 * lines, tables included. The answering model is given the whole of it as
 * Markdown, the way it is given the Lubec rules: one heading per section, its
 * body lines as they are, and an opening that says what the rules are and what
 * they leave out.
 *
 * Section titles repeat across pages (every class has its own "Combat"), so
 * each heading carries the titles above it, "Cleric › Combat", and an answer
 * can name the one section it came from.
 *
 * The text is Open Game Content. The license travels beside the corpus as
 * `OGL.txt`, wherever the corpus is copied to, and the document says so.
 */

type Section = { title: string; level: number; markdownLines: string[] }
type Page = { title: string; sections: Section[] }
type Corpus = { pages: Page[]; source: { edition: string; revisionDate: string }; license: { notice: string } }

/** Joins a heading's titles, page first. */
const TRAIL = ' › '

function opening(corpus: Corpus): string {
  return `# Classic Fantasy rules (pre-2026 text)

These are the Classic Fantasy rules the group plays by, from the ${corpus.source.edition} as transcribed on ${corpus.source.revisionDate}.
They are the rules text as it stood before the 2026 edition. Nothing from the 2026 edition is in them.

They cover creating a character, ability scores, alignment, languages and advancement; the seven classic classes (Cleric, Dwarf, Elf, Fighter, Halfling, Magic-User and Thief); adventuring, encounters and combat; how magic is memorised, cast and researched; money, weapon qualities, vehicles, retainers, mercenaries, specialists and strongholds; and refereeing and awarding XP.

They do not include the spell lists or what any spell does, monster descriptions or encounter tables, treasure, equipment lists and prices, any weapon's damage or range, vessel specifications, or the Advanced classes and races. The rules sometimes refer to these; that does not make them part of the rules. A question that needs any of them is not covered.

Every section has its own heading, which names the page it is on and the sections above it, such as "Combat${TRAIL}Initiative", so a rule can be cited by its heading. A heading marked "(Optional Rule)" is an optional rule: say so when an answer depends on it.

${corpus.license.notice.replace('in the pages array', 'below')}`
}

/** A section's heading: one level below the document's own title, naming the titles above it. */
function heading(trail: readonly string[]): string {
  return `${'#'.repeat(Math.min(trail.length + 1, 6))} ${trail.join(TRAIL)}`
}

function renderPage(page: Page): string[] {
  const parts: string[] = []
  const trail: string[] = []
  for (const section of page.sections) {
    trail.length = section.level - 1
    trail.push(section.title)
    parts.push(heading(trail))
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

function isPage(value: unknown): value is Page {
  const page = value as Partial<Page> | null
  return isText(page?.title) && Array.isArray(page.sections) && page.sections.length > 0 && page.sections.every(isSection) && page.sections[0]!.level === 1
}

/** The corpus read from its JSON, or why it cannot be used. */
function readCorpus(json: string): Corpus {
  const corpus = JSON.parse(json) as Partial<Corpus> | null
  if (!Array.isArray(corpus?.pages) || corpus.pages.length === 0) throw new Error('The Classic Fantasy corpus has no pages.')
  const broken = corpus.pages.findIndex((page) => !isPage(page))
  if (broken >= 0) throw new Error(`Page ${broken + 1} of the Classic Fantasy corpus is not a page of sections.`)
  if (!isText(corpus.source?.edition) || !isText(corpus.source.revisionDate)) throw new Error('The Classic Fantasy corpus does not say where it is from.')
  if (!isText(corpus.license?.notice)) throw new Error('The Classic Fantasy corpus carries no license notice.')
  return corpus as Corpus
}

/** The whole corpus as one Markdown rules document. */
export function renderClassicFantasyCorpus(json: string): string {
  const corpus = readCorpus(json)
  return [opening(corpus), ...corpus.pages.flatMap(renderPage)].join('\n\n') + '\n'
}
