import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { OPENAI_RESPONSES_URL } from '../src/rules/answer.ts'
import { RULES_BOOKS } from '../src/rules/books.ts'
import { JEV_URL } from '../src/rules/jev.ts'
import { rulesAnswering, type RulesSetup } from '../src/rules/setup.ts'

const LUBEC = new URL('./fixtures/rules-stand-in.md', import.meta.url).pathname
const CORPUS = new URL('./fixtures/classic-fantasy-stand-in.json', import.meta.url).pathname
const KEYS = { TYPESAFE_API_KEY: 'ts-key', OPENAI_API_KEY: 'sk-key' }
const scratch = mkdtempSync(path.join(tmpdir(), 'tablekeep-rules-setup-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

/** A repository root holding the stand-in rules named in `files`, by where the bot looks for them. */
function repository(files: Partial<Record<'lubec' | 'ose', string | null>> = { lubec: LUBEC, ose: CORPUS }): string {
  const root = mkdtempSync(path.join(scratch, 'root-'))
  for (const [ruleSet, from] of Object.entries(files) as ['lubec' | 'ose', string | null][]) {
    if (from === null) continue
    const to = path.join(root, RULES_BOOKS[ruleSet]!.file)
    mkdirSync(path.dirname(to), { recursive: true })
    cpSync(from, to)
  }
  return root
}

/** Sets rules answering up with `overrides`, and what it logged. */
async function setUp(overrides: Partial<RulesSetup> = {}) {
  const logged: { message: string; detail?: Record<string, unknown> }[] = []
  const asked: string[] = []
  const rules = await rulesAnswering({
    root: repository(),
    env: KEYS,
    live: false,
    projectSecret: async (name) => {
      asked.push(name)
      throw new Error(`no secret ${name}`)
    },
    log: (message, detail) => logged.push({ message, detail }),
    ...overrides,
  })
  return { rules, logged, asked }
}

/** A stand-in for both model services: Jev is sure, and the answering model answers from whatever it was given. */
function services() {
  const instructions: string[] = []
  const request = (async (url: string, init: RequestInit) => {
    if (url === JEV_URL) return Response.json({ answers: { rules_question: { noul: 0.95 } } })
    assert.equal(url, OPENAI_RESPONSES_URL)
    instructions.push((JSON.parse(String(init.body)) as { instructions: string }).instructions)
    const answer = { kind: 'answered', question: 'q', asked_by: 'Peter', answer: 'a', section: 's' }
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] })
  }) as unknown as typeof fetch
  return { instructions, request }
}

test('with the rules of both rule sets and both keys, each rule set is answered from its own rules, and it says so', async () => {
  const root = repository()
  const { request, instructions } = services()
  const { rules, logged } = await setUp({ root, fetch: request })
  assert.ok(rules)
  assert.equal(typeof rules.askJev, 'function')
  assert.deepEqual(Object.keys(rules.byRuleSet).sort(), ['lubec', 'ose'])
  assert.equal(rules.byRuleSet.lubec!.citedAs, 'the rules document')
  assert.equal(rules.byRuleSet.ose!.citedAs, 'the pre-2026 Classic Fantasy rules')
  assert.equal(rules.byRuleSet.vtm, undefined)

  await rules.byRuleSet.lubec!.answer([], [])
  await rules.byRuleSet.ose!.answer([], [])
  assert.ok(instructions[0]!.endsWith(`${readFileSync(LUBEC, 'utf8').trim()}\n`), 'Lubec is answered from the Lubec rules')
  assert.match(instructions[1]!, /# Classic Fantasy rules \(pre-2026 text\)\n/, 'OSE is answered from the Classic Fantasy rules')
  assert.match(instructions[1]!, /### Combat › Initiative\n\nRoll 1d6 for each side\./)
  assert.doesNotMatch(instructions[1]!, /Lubec rules/)

  assert.equal(logged.length, 1)
  assert.equal(logged[0]!.message, 'rules answers on')
  assert.deepEqual(Object.keys(logged[0]!.detail!).sort(), ['lubec', 'ose'])
  assert.equal((logged[0]!.detail!.lubec as { rulesDocument: string }).rulesDocument, path.join(root, 'docs/lubec/rules.md'))
})

test("without one rule set's rules, the other is still answered, and it says which is missing and why", async () => {
  const root = repository({ lubec: LUBEC, ose: null })
  const { rules, logged } = await setUp({ root })
  assert.ok(rules)
  assert.deepEqual(Object.keys(rules.byRuleSet), ['lubec'])
  assert.deepEqual(logged[0], {
    message: 'rules unavailable',
    detail: { ruleSet: 'ose', reason: `there is no rules document at ${path.join(root, 'docs/rules/ose-classic/corpus.json')}` },
  })
})

test('rules that cannot be read, or are empty, leave only their own rule set unanswered', async () => {
  const broken = path.join(scratch, 'broken.json')
  writeFileSync(broken, JSON.stringify({ pages: [{ title: 'Combat', sections: [{ title: 'Combat', level: 1 }] }] }))
  const empty = path.join(scratch, 'empty.md')
  writeFileSync(empty, '  \n')
  const root = repository({ lubec: empty, ose: broken })
  const { rules, logged } = await setUp({ root })
  assert.equal(rules, undefined)
  assert.deepEqual(
    logged.map((entry) => [entry.message, entry.detail?.ruleSet ?? null, entry.detail?.reason]),
    [
      ['rules unavailable', 'lubec', `the rules document at ${path.join(root, 'docs/lubec/rules.md')} is empty`],
      [
        'rules unavailable',
        'ose',
        `the rules at ${path.join(root, 'docs/rules/ose-classic/corpus.json')} cannot be read: Page 1 of the Classic Fantasy corpus is not a page of sections.`,
      ],
      ['rules answers off', null, 'there are no rules to answer from'],
    ],
  )
})

test('a key missing from a checkout is not looked for in the project, and turns answering off', async () => {
  const { rules, logged, asked } = await setUp({ env: {} })
  assert.equal(rules, undefined)
  assert.deepEqual(asked, [])
  assert.deepEqual(logged.map((entry) => entry.detail?.reason), ['TYPESAFE_API_KEY and OPENAI_API_KEY not set'])
})

test('the deployed bot reads keys it was not given from the project', async () => {
  const read: string[] = []
  const projectSecret = async (name: string) => {
    read.push(name)
    return `${name}-value`
  }
  const { rules } = await setUp({ env: {}, live: true, projectSecret })
  assert.ok(rules)
  assert.deepEqual(read.sort(), ['OPENAI_API_KEY', 'TYPESAFE_API_KEY'])
})

test('a project secret that cannot be read turns answering off without stopping the bot', async () => {
  const { rules, logged } = await setUp({ env: { TYPESAFE_API_KEY: 'ts-key' }, live: true })
  assert.equal(rules, undefined)
  assert.deepEqual(
    logged.map((entry) => [entry.message, entry.detail?.name ?? entry.detail?.reason]),
    [
      ['secret unavailable', 'OPENAI_API_KEY'],
      ['rules answers off', 'OPENAI_API_KEY not set'],
    ],
  )
})

test("the repository's own rules can all be read: the Lubec rules and the Classic Fantasy corpus", async () => {
  const { rules, logged } = await setUp({ root: new URL('../..', import.meta.url).pathname })
  assert.deepEqual(Object.keys(rules!.byRuleSet).sort(), ['lubec', 'ose'])
  assert.deepEqual(logged.map((entry) => entry.message), ['rules answers on'])
})

const repo = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')

test('the image, its build context and the deploy carry every rule set\'s rules, and the license of any that has one', () => {
  const files = Object.values(RULES_BOOKS).flatMap((book) => [book.file, ...(book.license ? [book.license] : [])])
  assert.deepEqual(files, ['docs/lubec/rules.md', 'docs/rules/ose-classic/corpus.json', 'docs/rules/ose-classic/OGL.txt'])
  for (const file of files) {
    assert.match(repo('bot/Dockerfile'), new RegExp(`^COPY ${file} /app/${file}$`, 'm'))
    assert.match(repo('.dockerignore'), new RegExp(`^!${file}$`, 'm'))
  }
  assert.match(repo('bot/deploy/deploy.sh'), new RegExp(`^RULES_FILES=\\(${files.join(' ')}\\)$`, 'm'))
})

test('the image carries every file the bot imports from the Cloud Functions package', () => {
  const sources = (dir: string): string[] =>
    readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? sources(`${dir}/${entry.name}`) : entry.name.endsWith('.ts') ? [repo(`bot/${dir}/${entry.name}`)] : [],
    )
  const imported = new Set(sources('src').flatMap((source) => [...source.matchAll(/from '(?:\.\.\/)+(functions\/src\/[\w.]+\.ts)'/g)].map((match) => match[1]!)))
  assert.deepEqual([...imported].sort(), ['functions/src/characterSchemaVersions.ts', 'functions/src/firestorePaths.ts'])
  for (const file of imported) {
    assert.match(repo('bot/Dockerfile'), new RegExp(`^COPY ${file} /app/${file}$`, 'm'))
    assert.match(repo('.dockerignore'), new RegExp(`^!${file}$`, 'm'))
  }
})
