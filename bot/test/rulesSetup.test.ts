import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { RULES_DOCUMENT, rulesAnswering, type RulesSetup } from '../src/rules/setup.ts'

const RULES = new URL('./fixtures/rules-stand-in.md', import.meta.url).pathname
const KEYS = { TYPESAFE_API_KEY: 'ts-key', OPENAI_API_KEY: 'sk-key' }
const scratch = mkdtempSync(path.join(tmpdir(), 'tablekeep-rules-setup-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

/** Sets rules answering up with `overrides`, and what it logged. */
async function setUp(overrides: Partial<RulesSetup> = {}) {
  const logged: { message: string; detail?: Record<string, unknown> }[] = []
  const asked: string[] = []
  const rules = await rulesAnswering({
    rulesPath: RULES,
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

test('with the rules document and both keys, rules questions are answered, and it says so', async () => {
  const { rules, logged } = await setUp()
  assert.ok(rules)
  assert.equal(typeof rules.askJev, 'function')
  assert.equal(typeof rules.answer, 'function')
  assert.deepEqual(logged, [{ message: 'rules answers on', detail: { rulesDocument: RULES, characters: readFileSync(RULES, 'utf8').length } }])
})

test('without the rules document, or with an empty one, nothing is answered and it says why', async () => {
  const missing = await setUp({ rulesPath: path.join(scratch, 'nowhere.md') })
  assert.equal(missing.rules, undefined)
  assert.deepEqual(missing.logged.map((entry) => entry.detail?.reason), [`there is no rules document at ${path.join(scratch, 'nowhere.md')}`])

  const emptyPath = path.join(scratch, 'empty.md')
  writeFileSync(emptyPath, '  \n')
  const empty = await setUp({ rulesPath: emptyPath })
  assert.equal(empty.rules, undefined)
  assert.deepEqual(empty.logged.map((entry) => entry.detail?.reason), [`the rules document at ${emptyPath} is empty`])
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

test('the rules document is docs/lubec/rules.md, and the image, its build context and the deploy all name the same file', () => {
  assert.equal(RULES_DOCUMENT, 'docs/lubec/rules.md')
  const repo = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
  assert.match(repo('bot/Dockerfile'), new RegExp(`^COPY ${RULES_DOCUMENT} /app/${RULES_DOCUMENT}$`, 'm'))
  assert.match(repo('.dockerignore'), new RegExp(`^!${RULES_DOCUMENT}$`, 'm'))
  assert.match(repo('bot/deploy/deploy.sh'), new RegExp(`^RULES_DOCUMENT="${RULES_DOCUMENT}"$`, 'm'))
  assert.match(repo('bot/.env.example'), new RegExp(`Defaults to the repository's ${RULES_DOCUMENT}\\.`))
})
