import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import puppeteer, { Locator } from 'puppeteer'
import { isExpectedFirestoreEmulatorChannelError } from './browser-smoke-errors.mjs'
import {
  characterPath,
  listDocumentIds,
  PROJECT_ID,
  readDocumentFields,
  seedCampaign,
  seedCharacter,
  seedDocument,
  toFirestoreFields,
} from './browser-smoke-seed.mjs'
import { reviveTimestamps } from '../src/features/ruleSets/characterFixtures.ts'
import { migrateCharacter, oseCharacterVersioning, vtmCharacterVersioning } from '../src/features/ruleSets/characterMigrations.ts'

const APP_URL = 'http://127.0.0.1:4173'
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099'
const API_KEY = 'demo-api-key'
const PASSWORD = 'table-keep-smoke-password'
const SCREENSHOT_DIR = 'artifacts/browser-smoke'

const viewports = [
  {
    name: 'desktop',
    label: 'Desktop',
    viewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
    email: 'browser-desktop@example.test',
    username: 'desk001',
    groupName: 'Desktop Smoke Group',
  },
  {
    name: 'mobile',
    label: 'Mobile',
    viewport: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    email: 'browser-mobile@example.test',
    username: 'mobi001',
    groupName: 'Mobile Smoke Group',
  },
]

// One campaign per rule set the campaign creation dialog offers. `characterTab`
// matches only that rule set's character tab, so opening the wrong sheet fails;
// `emptyList` is what that tab says before it holds a character.
const ruleSetCampaigns = [
  { system: 'ose', label: 'OSE', characterTab: '.characters-layout:not(.vtm-character-tab)', emptyList: 'No characters available.' },
  { system: 'vtm', label: 'VtM', characterTab: '.vtm-character-tab', emptyList: 'No characters available.' },
  { system: 'lubec', label: 'Lubec', characterTab: '.shell-root[data-theme="lubec"] .lubec-character-tab', emptyList: 'No characters yet.' },
]

function startApp() {
  const viteBin = new URL('../node_modules/vite/bin/vite.js', import.meta.url)
  return spawn(
    process.execPath,
    [viteBin.pathname, '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
    {
      env: {
        ...process.env,
        VITE_FIREBASE_API_KEY: API_KEY,
        VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
        VITE_FIREBASE_PROJECT_ID: PROJECT_ID,
        VITE_FIREBASE_STORAGE_BUCKET: `${PROJECT_ID}.firebasestorage.app`,
        VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
        VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000000000',
        VITE_USE_FIREBASE_EMULATORS: 'true',
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  )
}

async function waitForApp(server) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Vite exited before becoming ready (code ${server.exitCode}).`)
    }

    try {
      const response = await fetch(APP_URL)
      if (response.ok) return
    } catch {
      // The server may not have bound its port yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error(`Vite did not become ready at ${APP_URL} within 30 seconds.`)
}

async function stopApp(server) {
  if (server.exitCode !== null) return

  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ])

  if (server.exitCode === null) {
    server.kill('SIGKILL')
  }
}

async function requestJson(url, init) {
  const response = await fetch(url, init)
  const body = await response.text()
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed (${response.status}): ${body}`)
  }
  return body ? JSON.parse(body) : null
}

async function createAuthUser(email) {
  const account = await requestJson(
    `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
    },
  )
  return account.localId
}

async function waitForVerificationLink(email) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const payload = await requestJson(
      `${AUTH_EMULATOR_URL}/emulator/v1/projects/${PROJECT_ID}/oobCodes`,
    )
    const code = payload.oobCodes?.find((entry) => (
      entry.email === email && entry.requestType === 'VERIFY_EMAIL'
    ))
    if (code?.oobLink) return code.oobLink
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error(`No email-verification link appeared for ${email}.`)
}

function roleLocator(page, role, name) {
  return page.locator(`::-p-aria([name="${name}"][role="${role}"])`)
}

async function waitForBodyText(page, expected) {
  await page.waitForFunction(
    (text) => document.body.innerText.includes(text),
    { timeout: 15_000 },
    expected,
  )
}

// Names the step a failure happened in; a bare Puppeteer timeout does not.
export async function step(name, action) {
  try {
    return await action()
  } catch (error) {
    throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

async function screenshot(page, name) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true })
}

export function campaignIdFromUrl(page) {
  const match = new URL(page.url()).pathname.match(/^\/groups\/[^/]+\/campaigns\/([^/]+)\//)
  if (!match) throw new Error(`Expected a campaign URL, got ${page.url()}.`)
  return match[1]
}

export function groupIdFromUrl(page) {
  const match = new URL(page.url()).pathname.match(/^\/groups\/([^/]+)$/)
  if (!match) throw new Error(`Expected a group home URL, got ${page.url()}.`)
  return match[1]
}

// Leaves a campaign through its own "Back to <group>" button rather than a
// page load. By the third full load in one browser context the Firestore client
// reports the emulator unreachable, most likely because earlier pages' streams
// still hold the browser's few HTTP/1.1 connections to it.
async function backToGroupHome(page, testCase) {
  const backButton = `[aria-label=${JSON.stringify(`Back to ${testCase.groupName}`)}]`
  if (!(await page.$('.side-nav.open'))) {
    await roleLocator(page, 'button', 'Open navigation').click()
  }
  await page.locator(backButton).click()
  await roleLocator(page, 'button', 'Create new draft').wait()
}

// The back button does not close the drawer it sits in, so the next campaign
// opens with the drawer over its character tab. Close it as a user would.
async function closeNavigationDrawer(page) {
  if (await page.$('.side-nav.open')) {
    await step('close the navigation drawer', async () => {
      await roleLocator(page, 'button', 'Open navigation').click()
      // The class drops at once; wait for the slide-out to finish too.
      await page.waitForFunction(() => document.querySelector('.side-nav').getBoundingClientRect().right <= 0)
    })
  }
}

// The picker offers exactly the rule sets the smoke creates, so a hidden one
// never shows there.
async function expectPickerOffersOnly(page, systems) {
  const offered = await page.$$eval('[role="dialog"] select option', (options) => options.map((option) => option.value))
  if (offered.join() !== systems.join()) {
    throw new Error(`The campaign picker offers ${offered.join(', ')}, not ${systems.join(', ')}.`)
  }
}

// Returns the campaign's id, so a later case can find its documents.
async function createAndOpenCampaign(page, testCase, ruleSet) {
  const campaignName = `${testCase.label} ${ruleSet.label} Campaign`
  await step(`create the ${ruleSet.label} campaign`, async () => {
    await roleLocator(page, 'button', 'Create new draft').click()
    await page.locator('[role="dialog"] input[type="text"]').fill(campaignName)
    await expectPickerOffersOnly(page, ruleSetCampaigns.map((offered) => offered.system))
    await page.select('[role="dialog"] select', ruleSet.system)
    await roleLocator(page, 'button', 'Create').click()
  })
  await step(`open the ${ruleSet.label} character tab`, async () => {
    await page.locator(`.group-home-card ::-p-text(${JSON.stringify(campaignName)})`).click()
    await page.locator(ruleSet.characterTab).wait()
  })
  await closeNavigationDrawer(page)
  await step(`show the empty ${ruleSet.label} character list`, () => waitForBodyText(page, ruleSet.emptyList))
  await screenshot(page, `${testCase.name}-${ruleSet.system}-character`)
  return campaignIdFromUrl(page)
}

async function openSeededCharacter(page, testCase, { uid, groupId }) {
  const characterName = `${testCase.label} Seeded Fighter`
  const campaignId = await seedCampaign({
    groupId,
    gmUserId: uid,
    fields: { name: `${testCase.label} Seeded Campaign`, system: 'ose' },
  })
  await seedCharacter({
    groupId,
    campaignId,
    fields: {
      name: characterName,
      ownerUserId: uid,
      ownerUsername: testCase.username,
      class: 'Fighter',
      level: 1,
      hpCurrent: 8,
      hpMax: 8,
      creationStatus: 'active',
      schemaVersion: 1,
    },
  })

  // The group's campaigns were read when it loaded, so reload to pick up the seed.
  await page.goto(
    `${APP_URL}/groups/${groupId}/campaigns/${campaignId}/character`,
    { waitUntil: 'domcontentloaded' },
  )
  await page.locator(`.character-list-grid ::-p-text(${JSON.stringify(characterName)})`).click()
  await page.waitForFunction(
    (name) => document.querySelector('.character-header-field-name input')?.value === name,
    {},
    characterName,
  )
  await screenshot(page, `${testCase.name}-seeded-character`)
}

// Waits until the open OSE sheet is `characterName`'s.
async function waitForOseSheet(page, characterName) {
  await page.waitForFunction(
    (name) => document.querySelector('.character-header-field-name input')?.value === name,
    {},
    characterName,
  )
}

// Everything the smoke checks inside the group, once it exists. Add a case here.
// Returns the id of each campaign made through the picker, by rule set.
async function openCampaignCases(page, testCase, { uid, groupId }) {
  await step('open a seeded character', () => openSeededCharacter(page, testCase, { uid, groupId }))
  const created = {}
  for (const ruleSet of ruleSetCampaigns) {
    await step('go back to the group home', () => backToGroupHome(page, testCase))
    created[ruleSet.system] = await createAndOpenCampaign(page, testCase, ruleSet)
  }
  return created
}

// A VtM sheet saves 500 ms after the last keystroke. These cases leave the
// sheet, or the campaign, well inside that window, then wait out the window
// before they reload, so a save that was cancelled rather than sent shows.
const VTM_EDIT_SETTLE_MS = 1_500
const SHARED_CHARACTER_ID = 'smoke-shared-vampire'

export function vtmCharacterFields({ uid, username, name, concept }) {
  return {
    system: 'vtm',
    name,
    ownerUserId: uid,
    ownerUsername: username,
    creationMode: 'established',
    creationModeExplicit: true,
    creationStatus: 'active',
    xp: 0,
    vtm: { concept },
    schemaVersion: 1,
  }
}

// Seeds one VtM campaign holding one character, under SHARED_CHARACTER_ID so
// two campaigns can hold a character with the same id.
async function seedVtmCampaign({ uid, groupId, testCase, label }) {
  const campaignName = `${testCase.label} VtM ${label}`
  const characterName = `${label} Vampire`
  const concept = `${label} concept`
  const campaignId = await seedCampaign({ groupId, gmUserId: uid, fields: { name: campaignName, system: 'vtm' } })
  const fields = vtmCharacterFields({ uid, username: testCase.username, name: characterName, concept })
  await seedCharacter({ groupId, campaignId, characterId: SHARED_CHARACTER_ID, fields })
  return { campaignId, campaignName, characterName, concept, fields, path: characterPath({ groupId, campaignId, characterId: SHARED_CHARACTER_ID }) }
}

async function openCampaignCard(page, campaignName, characterTab = '.vtm-character-tab') {
  await page.locator(`.group-home-card ::-p-text(${JSON.stringify(campaignName)})`).click()
  await page.locator(characterTab).wait()
  await closeNavigationDrawer(page)
}

// The open sheet's Concept field, once the sheet shows `characterName`. A
// narrow screen opens on the character list, so pick the character there first.
async function vtmConceptField(page, characterName) {
  const card = `.monster-list-item ::-p-text(${JSON.stringify(characterName)})`
  await Locator.race([page.locator(card), page.locator('.vtm-identity-fields')]).wait()
  await (await page.$(card))?.click()
  await page.waitForFunction(
    (name) => [...document.querySelectorAll('.vtm-identity-fields input')].some((input) => input.value === name),
    {},
    characterName,
  )
  return roleLocator(page, 'textbox', 'Concept')
}

async function expectVtmConcept(page, characterName, expected) {
  const field = await vtmConceptField(page, characterName)
  const actual = await field.map((input) => input.value).wait()
  if (actual !== expected) throw new Error(`Expected the Concept "${expected}", found "${actual}".`)
}

async function expectStoredUnchanged(seeded) {
  const stored = await readDocumentFields(seeded.path)
  const expected = toFirestoreFields(seeded.fields)
  if (JSON.stringify(stored) !== JSON.stringify(expected)) {
    throw new Error(`${seeded.campaignName}'s character changed: ${JSON.stringify(stored)}`)
  }
}

// Clicks a control in the closed navigation drawer straight away, as the
// quickest tap a user could make, rather than waiting out the drawer's slide-in.
async function clickInDrawer(page, selector) {
  await page.$eval(selector, (element) => element.click())
}

async function editVtmConcept(page, seeded) {
  const field = await vtmConceptField(page, seeded.characterName)
  await field.fill(`${seeded.concept}, edited`)
}

const settle = () => new Promise((resolve) => setTimeout(resolve, VTM_EDIT_SETTLE_MS))

async function vtmLeaveSheetCase(page, testCase, seeded) {
  await step('open the VtM campaign', () => openCampaignCard(page, seeded.campaignName))
  await step('edit the VtM Concept', () => editVtmConcept(page, seeded))
  await step('open Notes at once', async () => {
    await clickInDrawer(page, '.side-nav a[href$="/notes"]')
    await page.waitForFunction(() => !document.querySelector('.vtm-character-tab'))
  })
  await settle()
  await step('see the edit after a reload', async () => {
    await page.goto(page.url().replace(/\/notes$/, '/character'), { waitUntil: 'domcontentloaded' })
    await expectVtmConcept(page, seeded.characterName, `${seeded.concept}, edited`)
  })
}

async function vtmSwitchCampaignCase(page, testCase, { origin, destination }) {
  await step('open the original VtM campaign', () => openCampaignCard(page, origin.campaignName))
  await step('edit the VtM Concept', () => editVtmConcept(page, origin))
  await step('switch campaign at once', async () => {
    await clickInDrawer(page, `[aria-label=${JSON.stringify(`Back to ${testCase.groupName}`)}]`)
    await openCampaignCard(page, destination.campaignName)
  })
  await settle()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await step('see the destination unchanged after a reload', async () => {
    await expectVtmConcept(page, destination.characterName, destination.concept)
    await expectStoredUnchanged(destination)
  })
  await step('see the edit on the original campaign', async () => {
    await backToGroupHome(page, testCase)
    await openCampaignCard(page, origin.campaignName)
    await expectVtmConcept(page, origin.characterName, `${origin.concept}, edited`)
  })
}

// The browser's back button can move from one campaign's sheet straight to
// another's, so the sheet stays open and only its campaign changes. The
// history this needs is the destination's sheet, then the original's.
async function vtmBackButtonCase(page, testCase, { origin, destination }) {
  await step('open the destination VtM campaign', () => openCampaignCard(page, destination.campaignName))
  await step('open the original VtM campaign after it', async () => {
    await clickInDrawer(page, '.side-nav a[href$="/notes"]')
    await page.waitForFunction(() => !document.querySelector('.vtm-character-tab'))
    await backToGroupHome(page, testCase)
    await openCampaignCard(page, origin.campaignName)
  })
  await step('edit the VtM Concept', () => editVtmConcept(page, origin))
  await step('go back to the destination at once', async () => {
    await page.goBack()
    if (!page.url().includes(destination.campaignId)) throw new Error(`Back went to ${page.url()}.`)
    await expectVtmConcept(page, destination.characterName, destination.concept)
  })
  await settle()
  await step('see the destination unchanged before and after a reload', async () => {
    await expectVtmConcept(page, destination.characterName, destination.concept)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expectVtmConcept(page, destination.characterName, destination.concept)
    await expectStoredUnchanged(destination)
  })
  await step('see the edit on the original campaign', async () => {
    await backToGroupHome(page, testCase)
    await openCampaignCard(page, origin.campaignName)
    await expectVtmConcept(page, origin.characterName, `${origin.concept}, edited`)
  })
}

async function seedVtmLastEditCampaigns(testCase, ids) {
  const seed = (label) => seedVtmCampaign({ ...ids, testCase, label })
  return {
    leave: await seed('Leave Sheet'),
    switch: { origin: await seed('Switch Origin'), destination: await seed('Switch Destination') },
    back: { origin: await seed('Back Origin'), destination: await seed('Back Destination') },
  }
}

// Each case reloads, so each gets a fresh browser context; see backToGroupHome
// for why one context cannot take many page loads.
async function inSignedInPage(browser, { testCase, groupId, browserErrors }, name, action) {
  const { context, page } = await newSmokePage(browser, testCase, browserErrors)
  try {
    await step(`sign in for ${name}`, () => signInToGroupHome(page, testCase, groupId))
    await step(name, () => action(page))
  } finally {
    await screenshot(page, `${testCase.name}-${name.replaceAll(' ', '-')}`)
    await context.close()
  }
}

async function vtmLastEditCases(browser, testCase, ids, browserErrors) {
  const seeded = await seedVtmLastEditCampaigns(testCase, ids)
  const session = { testCase, groupId: ids.groupId, browserErrors }
  const run = (name, action) => inSignedInPage(browser, session, name, action)
  await run('vtm-leave-sheet', (page) => vtmLeaveSheetCase(page, testCase, seeded.leave))
  await run('vtm-switch-campaign', (page) => vtmSwitchCampaignCase(page, testCase, seeded.switch))
  await run('vtm-back-button', (page) => vtmBackButtonCase(page, testCase, seeded.back))
}

// A filled-in VtM sheet, carrying fields the app does not model at the top
// level, nested in the sheet and in a list row. Editing it in the browser must
// store the edit and a new `updatedAt`, and leave every other field as seeded.
const VTM_FILLED_FIXTURE_URL = new URL('../src/features/ruleSets/vtm/fixtures/filled-sheet.json', import.meta.url)

// A checked-in fixture's own document, owned by the smoke's user. Its art is
// not in the Storage emulator, so its portrait and token image paths are left out.
export function ownedFixtureFields(fixtureData, { uid, username }) {
  const fields = reviveTimestamps(fixtureData, (iso) => new Date(iso))
  const tokenIcon = { ...fields.tokenIcon }
  delete tokenIcon.customImagePath
  return { ...fields, ownerUserId: uid, ownerUsername: username, portraitPath: '', tokenIcon }
}

export const withVtmConcept = (fields, concept) => ({ ...fields, vtm: { ...fields.vtm, concept } })

// A stored REST value with its map keys in order, and its timestamps and
// empty lists in one spelling, so it compares equal to an expected value
// Firestore calls equal.
function canonicalFirestoreValue(value) {
  if (Array.isArray(value)) return value.map(canonicalFirestoreValue)
  if (value === null || typeof value !== 'object') return value
  if (typeof value.timestampValue === 'string') return { timestampValue: new Date(value.timestampValue).toISOString() }
  if (value.arrayValue && !value.arrayValue.values) return { arrayValue: { values: [] } }
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalFirestoreValue(value[key])]))
}

const sameFirestoreValue = (a, b) =>
  JSON.stringify(canonicalFirestoreValue(a)) === JSON.stringify(canonicalFirestoreValue(b))

// The top-level fields, in the REST shape, where `stored` differs from `expected`.
export function changedFirestoreFields(stored, expected) {
  const keys = [...new Set([...Object.keys(stored), ...Object.keys(expected)])]
  return keys.filter((key) => !sameFirestoreValue(stored[key], expected[key])).sort()
}

async function seedFilledVtmCampaign({ uid, groupId, testCase }) {
  const fixture = JSON.parse(await readFile(VTM_FILLED_FIXTURE_URL, 'utf8'))
  const campaignName = `${testCase.label} VtM Filled Sheet`
  const campaignId = await seedCampaign({ groupId, gmUserId: uid, fields: { name: campaignName, system: 'vtm' } })
  const fields = migratedFixtureFields(vtmCharacterVersioning, fixture, { uid, username: testCase.username })
  await seedCharacter({ groupId, campaignId, characterId: fixture.id, fields })
  const path = characterPath({ groupId, campaignId, characterId: fixture.id })
  return { campaignId, campaignName, characterName: fields.name, concept: fields.vtm.concept, fields, path }
}

// The fields a save of a version 1 character changes beside the edit: the
// write time and `updatedAt`, in the order `changedFirestoreFields` names them.
// The save stamps version 1 too, which the character already carried.
const SAVE_STAMP_FIELDS = ['schemaWrittenAt', 'updatedAt']

// What is wrong with a stored character, in the REST shape, that a save
// should have left at version 1 with a write time.
export function storedVersionProblems(stored) {
  const problems = []
  if (stored.schemaVersion?.integerValue !== '1') problems.push(`schemaVersion is ${JSON.stringify(stored.schemaVersion)}, not 1`)
  if (typeof stored.schemaWrittenAt?.timestampValue !== 'string') problems.push('schemaWrittenAt is not a time')
  return problems
}

function expectStoredAtVersion1(stored) {
  const problems = storedVersionProblems(stored)
  if (problems.length > 0) throw new Error(`The save did not store the character at version 1: ${problems.join('; ')}.`)
}

async function expectOnlyEditStored(seeded, concept) {
  const stored = await readDocumentFields(seeded.path)
  const expected = toFirestoreFields(withVtmConcept(seeded.fields, concept))
  const changed = changedFirestoreFields(stored, expected)
  if (changed.join() !== SAVE_STAMP_FIELDS.join()) {
    throw new Error(`Expected only the edit, the version stamp and updatedAt to change, but these differ: ${changed.join(', ')}.`)
  }
  expectStoredAtVersion1(stored)
}

async function vtmEditKeepsFieldsCase(page, seeded) {
  const edited = `${seeded.concept}, edited`
  await step('open the filled-in VtM campaign', () => openCampaignCard(page, seeded.campaignName))
  await step('edit the VtM Concept', () => editVtmConcept(page, seeded))
  await settle()
  await step('see the edit after a reload', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expectVtmConcept(page, seeded.characterName, edited)
  })
  await step('see every other stored field as seeded', () => expectOnlyEditStored(seeded, edited))
}

async function vtmEditKeepsFieldsCases(browser, testCase, ids, browserErrors) {
  const seeded = await seedFilledVtmCampaign({ ...ids, testCase })
  const session = { testCase, groupId: ids.groupId, browserErrors }
  await inSignedInPage(browser, session, 'vtm-edit-keeps-fields', (page) => vtmEditKeepsFieldsCase(page, seeded))
}

// A VtM character made, edited, given a portrait and a token image, and
// deleted through the sheet, checked against what Firestore stores at each
// step. The images go to the Storage emulator, and after a reload the sheet
// shows them again from their stored paths alone.
const VTM_NEW_CHARACTER_NAME = 'New Vampire'
// A 1x1 PNG.
const SMOKE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')
const STORED_POLL_MS = 250
const STORED_TIMEOUT_MS = 10_000

// What is wrong with a stored character, in the REST shape, that should hold
// a portrait and a token image by their storage paths alone.
export function storedMediaProblems(stored) {
  return [...storedPortraitProblems(stored), ...storedTokenImageProblems(stored.tokenIcon?.mapValue?.fields ?? {})]
}

// What is wrong with a stored token icon's fields, in the REST shape, that
// should hold a custom image by its storage path alone.
export function storedTokenImageProblems(tokenIcon) {
  const problems = []
  if (tokenIcon.icon?.stringValue !== 'custom') problems.push('the token icon is not a custom image')
  if (!tokenIcon.customImagePath?.stringValue) problems.push('no token image path is stored')
  if (tokenIcon.customImageUrl) problems.push('a token image URL is stored')
  return problems
}

// What is wrong with a stored character, in the REST shape, that should hold
// a portrait by its storage path alone.
export function storedPortraitProblems(stored) {
  const problems = []
  if (!stored.portraitPath?.stringValue) problems.push('no portrait path is stored')
  if (stored.portraitUrl) problems.push('a portrait URL is stored')
  return problems
}

// Reads until `problemsOf` finds nothing wrong with what is read, or fails
// with what it last found.
async function waitForStored(read, problemsOf) {
  const deadline = Date.now() + STORED_TIMEOUT_MS
  for (;;) {
    const problems = problemsOf(await read())
    if (problems.length === 0) return
    if (Date.now() > deadline) throw new Error(`${problems.join('; ')}.`)
    await new Promise((resolve) => setTimeout(resolve, STORED_POLL_MS))
  }
}

async function smokeImageFile() {
  const path = join(await mkdtemp(join(tmpdir(), 'table-keep-smoke-')), 'vampire.png')
  await writeFile(path, SMOKE_PNG)
  return path
}

async function createVtmCharacter(page, charactersPath) {
  await roleLocator(page, 'button', 'Add character').click()
  await page.locator('[role="dialog"] ::-p-text(Established — direct entry)').click()
  let ids = []
  await waitForStored(() => listDocumentIds(charactersPath), (listed) => {
    ids = listed
    return listed.length === 1 ? [] : [`expected one stored character, found ${listed.length}`]
  })
  return `${charactersPath}/${ids[0]}`
}

async function uploadPortrait(page, imagePath) {
  const input = await page.locator('.vtm-identity .monster-portrait-frame-empty input[type="file"]').waitHandle()
  await input.uploadFile(imagePath)
  await roleLocator(page, 'button', 'Save portrait').click()
  await page.locator('.vtm-identity .monster-portrait-frame-filled img').wait()
}

async function uploadTokenImage(page, imagePath) {
  await roleLocator(page, 'button', 'Edit token icon').click()
  await pickTokenImage(page, imagePath)
}

// Uploads an image in the open token picker and confirms it.
async function pickTokenImage(page, imagePath) {
  const input = await page.locator('.token-picker-modal input[type="file"]').waitHandle()
  await input.uploadFile(imagePath)
  await page.locator('.token-picker-modal img.token-icon-preview-image').wait()
  await page.locator('.token-picker-modal [aria-label="Confirm"]:not([disabled])').click()
  await page.waitForFunction(() => !document.querySelector('.token-picker-modal'))
}

// Both images show with a renderable URL, which only the stored paths can
// have given them after a reload.
async function expectVtmMediaShown(page) {
  await page.waitForFunction(() => {
    const shown = (selector) => /^https?:/.test(document.querySelector(selector)?.getAttribute('src') ?? '')
    return shown('.vtm-identity .monster-portrait-frame-filled img') && shown('.vtm-identity .monster-token-thumb-btn img')
  })
}

async function deleteVtmCharacter(page, charactersPath) {
  await page.locator('.characters-detail button.confirm-danger').click()
  await page.locator('[role="dialog"] button.confirm-danger').click()
  await waitForStored(() => listDocumentIds(charactersPath), (listed) =>
    (listed.length === 0 ? [] : [`${listed.length} character(s) still stored`]))
  // A narrow screen stays on the sheet pane; go back to the list as a user would.
  await (await page.$('[aria-label="Back to character list"]'))?.click()
  await waitForBodyText(page, 'No characters available.')
}

async function vtmCharacterLifecycleCase(page, { campaignName, charactersPath }) {
  const concept = 'Made in the smoke'
  const imagePath = await smokeImageFile()
  await step('open the empty VtM campaign', () => openCampaignCard(page, campaignName))
  const path = await step('create a VtM character', () => createVtmCharacter(page, charactersPath))
  await step('edit its Concept', async () => {
    await (await vtmConceptField(page, VTM_NEW_CHARACTER_NAME)).fill(concept)
    await waitForStored(() => readDocumentFields(path), (stored) =>
      (stored.vtm?.mapValue?.fields?.concept?.stringValue === concept ? [] : ['the Concept edit is not stored']))
  })
  await step('give it a portrait', () => uploadPortrait(page, imagePath))
  await step('give it a token image', () => uploadTokenImage(page, imagePath))
  await step('store both images by path alone', () => waitForStored(() => readDocumentFields(path), storedMediaProblems))
  await step('see the edit and both images after a reload', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expectVtmConcept(page, VTM_NEW_CHARACTER_NAME, concept)
    await expectVtmMediaShown(page)
  })
  await step('delete it', () => deleteVtmCharacter(page, charactersPath))
}

async function vtmCharacterLifecycleCases(browser, testCase, ids, browserErrors) {
  const campaignName = `${testCase.label} VtM Lifecycle`
  const campaignId = await seedCampaign({ groupId: ids.groupId, gmUserId: ids.uid, fields: { name: campaignName, system: 'vtm' } })
  const charactersPath = `groups/${ids.groupId}/campaigns/${campaignId}/characters`
  const session = { testCase, groupId: ids.groupId, browserErrors }
  await inSignedInPage(browser, session, 'vtm-character-lifecycle', (page) => vtmCharacterLifecycleCase(page, { campaignName, charactersPath }))
}

// An OSE sheet saves 500 ms after the last keystroke too, but the hook that
// saves sits above the sheet, so the cases also cover the page being hidden.
const OSE_SHARED_CHARACTER_ID = 'smoke-shared-fighter'
const oseCharacterTab = ruleSetCampaigns.find((ruleSet) => ruleSet.system === 'ose').characterTab

export function oseCharacterFields({ uid, username, name }) {
  return {
    name,
    ownerUserId: uid,
    ownerUsername: username,
    class: 'Fighter',
    level: 1,
    hpCurrent: 8,
    hpMax: 8,
    creationStatus: 'active',
    schemaVersion: 1,
  }
}

// Seeds one OSE campaign holding one character, under OSE_SHARED_CHARACTER_ID
// so two campaigns can hold a character with the same id.
async function seedOseCampaign({ uid, groupId, testCase, label }) {
  const campaignName = `${testCase.label} OSE ${label}`
  const characterName = `${label} Fighter`
  const campaignId = await seedCampaign({ groupId, gmUserId: uid, fields: { name: campaignName, system: 'ose' } })
  const fields = oseCharacterFields({ uid, username: testCase.username, name: characterName })
  await seedCharacter({ groupId, campaignId, characterId: OSE_SHARED_CHARACTER_ID, fields })
  return { campaignId, campaignName, characterName, fields, path: characterPath({ groupId, campaignId, characterId: OSE_SHARED_CHARACTER_ID }) }
}

// The open sheet's Name field. Each seeded campaign holds one character, so
// select it in the list first, as a narrow screen needs.
async function oseNameField(page) {
  await page.locator('.character-list-item-wrap .monster-list-item').click()
  const field = page.locator('.character-header-field-name input')
  await field.filter((input) => input.value !== '').wait()
  return field
}

async function expectOseName(page, expected) {
  const field = await oseNameField(page)
  const actual = await field.map((input) => input.value).wait()
  if (actual !== expected) throw new Error(`Expected the Name "${expected}", found "${actual}".`)
}

// Types at a person's pace and checks the field shows the whole edit before
// the case leaves. Keys typed at machine speed can go missing from this field,
// which is a separate fault that would otherwise look like a lost save.
async function editOseName(page, seeded) {
  const field = await oseNameField(page)
  await (await field.waitHandle()).type(', edited', { delay: 100 })
  const actual = await field.map((input) => input.value).wait()
  const expected = `${seeded.characterName}, edited`
  if (actual !== expected) throw new Error(`The Name field shows "${actual}" after typing "${expected}".`)
}

async function oseLeaveForNotesCase(page, testCase, seeded) {
  await step('open the OSE campaign', () => openCampaignCard(page, seeded.campaignName, oseCharacterTab))
  await step('edit the OSE Name', () => editOseName(page, seeded))
  await step('open Notes at once', async () => {
    await clickInDrawer(page, '.side-nav a[href$="/notes"]')
    await page.waitForFunction((tab) => !document.querySelector(tab), {}, oseCharacterTab)
  })
  await settle()
  await step('see the edit after a reload', async () => {
    await page.goto(page.url().replace(/\/notes$/, '/character'), { waitUntil: 'domcontentloaded' })
    await expectOseName(page, `${seeded.characterName}, edited`)
  })
}

// Hides the page as a user switching to another browser tab would.
async function hidePage(page) {
  const other = await page.browserContext().newPage()
  await other.bringToFront()
  await page.waitForFunction(() => document.visibilityState === 'hidden')
  return other
}

async function oseHidePageCase(page, testCase, seeded) {
  await step('open the OSE campaign', () => openCampaignCard(page, seeded.campaignName, oseCharacterTab))
  await step('edit the OSE Name', () => editOseName(page, seeded))
  const other = await step('hide the page at once', () => hidePage(page))
  await settle()
  await step('see the edit after a reload', async () => {
    await other.close()
    await page.bringToFront()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expectOseName(page, `${seeded.characterName}, edited`)
  })
}

async function oseSwitchCampaignCase(page, testCase, { origin, destination }) {
  await step('open the original OSE campaign', () => openCampaignCard(page, origin.campaignName, oseCharacterTab))
  await step('edit the OSE Name', () => editOseName(page, origin))
  await step('switch campaign at once', async () => {
    await clickInDrawer(page, `[aria-label=${JSON.stringify(`Back to ${testCase.groupName}`)}]`)
    await openCampaignCard(page, destination.campaignName, oseCharacterTab)
  })
  await settle()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await step('see the destination unchanged after a reload', async () => {
    await expectOseName(page, destination.characterName)
    await expectStoredUnchanged(destination)
  })
  await step('see the edit on the original campaign', async () => {
    await backToGroupHome(page, testCase)
    await openCampaignCard(page, origin.campaignName, oseCharacterTab)
    await expectOseName(page, `${origin.characterName}, edited`)
  })
}

async function seedOseLastEditCampaigns(testCase, ids) {
  const seed = (label) => seedOseCampaign({ ...ids, testCase, label })
  return {
    notes: await seed('Leave For Notes'),
    hide: await seed('Hide Page'),
    switch: { origin: await seed('Switch Origin'), destination: await seed('Switch Destination') },
  }
}

async function oseLastEditCases(browser, testCase, ids, browserErrors) {
  const seeded = await seedOseLastEditCampaigns(testCase, ids)
  const session = { testCase, groupId: ids.groupId, browserErrors }
  const run = (name, action) => inSignedInPage(browser, session, name, action)
  await run('ose-leave-for-notes', (page) => oseLeaveForNotesCase(page, testCase, seeded.notes))
  await run('ose-hide-page', (page) => oseHidePageCase(page, testCase, seeded.hide))
  await run('ose-switch-campaign', (page) => oseSwitchCampaignCase(page, testCase, seeded.switch))
}

// Characters as the migration left them, at version 1, which is the only shape
// the app reads: the four demo party characters, and an Elf stored in the old
// format, with old weapon and pack lists, a pack row without an id and no spell
// book, which the migration turned into items with stable ids.
const OSE_DEMO_FIXTURES = ['demo-magic-user', 'demo-fighter', 'demo-thief', 'demo-cleric']
const OSE_LEGACY_FIXTURES_URL = new URL('../src/features/ruleSets/ose/fixtures/legacy.json', import.meta.url)
const OSE_MIGRATED_FIXTURE = 'caster-without-book'

const oseFixture = async (name) =>
  JSON.parse(await readFile(new URL(`../src/features/ruleSets/ose/fixtures/${name}.json`, import.meta.url), 'utf8'))

// A checked-in fixture's document as the migration leaves it, owned by the smoke's user.
export const migratedFixtureFields = (versioning, fixture, owner) =>
  migrateCharacter(versioning, fixture.id, ownedFixtureFields(fixture.data, owner)).document

async function seedDemoOseCampaign({ uid, groupId, testCase }) {
  const campaignName = `${testCase.label} OSE Demo Party`
  const campaignId = await seedCampaign({ groupId, gmUserId: uid, fields: { name: campaignName, system: 'ose' } })
  const characterNames = []
  for (const name of OSE_DEMO_FIXTURES) {
    const fixture = await oseFixture(name)
    const fields = migratedFixtureFields(oseCharacterVersioning, fixture, { uid, username: testCase.username })
    await seedCharacter({ groupId, campaignId, characterId: fixture.id, fields })
    characterNames.push(fields.name)
  }
  return { campaignName, characterNames }
}

// Picks a character in the open campaign's list; a narrow screen shows the
// list again only after leaving the sheet that is open.
async function openOseCharacterFromList(page, characterName) {
  const backToList = '[aria-label="Back to character list"]'
  if (await page.$(backToList)) await page.locator(backToList).click()
  await page.locator(`.character-list-grid ::-p-text(${JSON.stringify(characterName)})`).click()
  await waitForOseSheet(page, characterName)
}

async function oseDemoCharactersCase(page, seeded) {
  await step('open the OSE campaign with the demo party', () => openCampaignCard(page, seeded.campaignName, oseCharacterTab))
  for (const characterName of seeded.characterNames) {
    await step(`open ${characterName}'s sheet`, () => openOseCharacterFromList(page, characterName))
  }
}

async function seedMigratedOseCampaign({ uid, groupId, testCase }) {
  const fixture = JSON.parse(await readFile(OSE_LEGACY_FIXTURES_URL, 'utf8'))[OSE_MIGRATED_FIXTURE]
  const campaignName = `${testCase.label} OSE Migrated`
  const campaignId = await seedCampaign({ groupId, gmUserId: uid, fields: { name: campaignName, system: 'ose' } })
  const fields = migratedFixtureFields(oseCharacterVersioning, fixture, { uid, username: testCase.username })
  await seedCharacter({ groupId, campaignId, characterId: fixture.id, fields })
  const path = characterPath({ groupId, campaignId, characterId: fixture.id })
  return { campaignName, characterName: fields.name, fields, path }
}

// What is wrong with a stored character's items, in the REST shape, against
// the items it was seeded with, or null when they are the same.
export function storedItemsProblem(stored, seededFields) {
  const inventory = stored.details?.mapValue?.fields?.inventory
  if (sameFirestoreValue(inventory, toFirestoreFields(seededFields.details).inventory)) return null
  return `The sheet holds other items than the migration made: ${JSON.stringify(inventory)}`
}

// A save writes the items the sheet holds, so the stored items are the ones
// the sheet showed when it last saved: those the migration made, as seeded.
async function expectSeededItemsStored(seeded) {
  const problem = storedItemsProblem(await readDocumentFields(seeded.path), seeded.fields)
  if (problem) throw new Error(problem)
}

async function oseMigratedItemsCase(page, seeded) {
  await step('open the OSE campaign with a migrated character', () => openCampaignCard(page, seeded.campaignName, oseCharacterTab))
  await step('edit the OSE Name', () => editOseName(page, seeded))
  await settle()
  await step('see the save keep the items the migration made, with their ids', () => expectSeededItemsStored(seeded))
  await step('see the save store the character at version 1', async () => expectStoredAtVersion1(await readDocumentFields(seeded.path)))
  for (const reload of ['first', 'second']) {
    await step(`see the same items and ids after the ${reload} reload`, async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectOseName(page, `${seeded.characterName}, edited`)
      await settle()
      await expectSeededItemsStored(seeded)
    })
  }
}

async function oseMigratedCharacterCases(browser, testCase, ids, browserErrors) {
  const demo = await seedDemoOseCampaign({ ...ids, testCase })
  const migrated = await seedMigratedOseCampaign({ ...ids, testCase })
  const session = { testCase, groupId: ids.groupId, browserErrors }
  await inSignedInPage(browser, session, 'ose-demo-characters', (page) => oseDemoCharactersCase(page, demo))
  await inSignedInPage(browser, session, 'ose-migrated-items', (page) => oseMigratedItemsCase(page, migrated))
}

// A blank map whose grid is calibrated, so dragging a party token across it
// counts feet: 20 cells of 10 feet each, so the map is 200 feet wide.
const CALIBRATED_MAP_ID = 'smoke-calibrated-map'
const PARTY_TOKEN_ID = 'smoke-party-token'
const ENCOUNTER_ALERT = '[role="dialog"][aria-label="Encounter alert"]'

export function calibratedMapFields() {
  return {
    name: 'Calibrated Map',
    kind: 'blank',
    width: 1600,
    height: 1000,
    sortOrder: 0,
    gridEnabled: true,
    gridCalibrated: true,
    gridCellScale: 0.05,
    gridUnitsPerCell: 10,
  }
}

export function partyTokenFields() {
  return { x: 0.1, y: 0.5, party: true, name: 'Party', size: 28, color: '#b45309' }
}

async function seedCalibratedMapCampaign({ uid, groupId, testCase, ruleSet }) {
  const campaignName = `${testCase.label} ${ruleSet.label} Wandering Monsters`
  const campaignId = await seedCampaign({ groupId, gmUserId: uid, fields: { name: campaignName, system: ruleSet.system } })
  const mapPath = `groups/${groupId}/campaigns/${campaignId}/maps/${CALIBRATED_MAP_ID}`
  await seedDocument(mapPath, calibratedMapFields())
  await seedDocument(`${mapPath}/tokens/${PARTY_TOKEN_ID}`, partyTokenFields())
  return { groupId, campaignId }
}

async function centreOf(handle) {
  const box = await handle.boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// A desktop GM opens a map in a preview of the players' view, where tokens
// stay put, and runs it to move them; a phone GM moves them straight away.
async function runTheMap(page) {
  await roleLocator(page, 'button', 'Run this map').click()
  await page.locator('.map-token:not(.player)').wait()
}

async function mouseMove(page, path) {
  await page.mouse.move(path[0].x, path[0].y)
  await page.mouse.down()
  for (const point of path.slice(1)) await page.mouse.move(point.x, point.y, { steps: 40 })
}

// A phone GM holds a token for a moment before it follows the finger.
async function touchMove(page, path) {
  await page.touchscreen.touchStart(path[0].x, path[0].y)
  await new Promise((resolve) => setTimeout(resolve, 400))
  for (const point of interpolatePath(path, 40)) await page.touchscreen.touchMove(point.x, point.y)
}

// The points a pointer passes through along `path`, `steps` to each leg, so a
// gesture moves the way a hand does rather than jumping corner to corner.
export function interpolatePath(path, steps) {
  return path.slice(1).flatMap((to, leg) => Array.from({ length: steps }, (_, index) => {
    const from = path[leg]
    const share = (index + 1) / steps
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share }
  }))
}

// Each viewport's way to open a map for moving tokens, to drag a token along
// a path, and to let go of it.
const mapGestures = {
  desktop: { open: runTheMap, move: mouseMove, release: (page) => page.mouse.up() },
  mobile: { open: async () => {}, move: touchMove, release: (page) => page.touchscreen.touchEnd() },
}

// Opens the seeded map and drags the party token to the far side and back:
// over 400 feet, past the first turn's warning at 120 and the roll at 240.
// Every d6 rolls a 1 while the token moves, so any check made finds an
// encounter. Randomness is real again before the token is let go, because
// letting go saves the fog through Storage, whose upload is framed with a
// random boundary that a constant Math.random leaves empty.
async function dragPartyTokenThroughACheckCycle(page, testCase, seeded) {
  const gestures = mapGestures[testCase.name]
  await page.goto(`${APP_URL}/groups/${seeded.groupId}/campaigns/${seeded.campaignId}/maps`, { waitUntil: 'domcontentloaded' })
  await page.locator('.map-select').click()
  await gestures.open(page)
  const start = await centreOf(await page.locator('.map-token').waitHandle())
  const layer = await (await page.locator('.blank-map-layer').waitHandle()).boundingBox()
  await page.evaluate(() => {
    globalThis.smokeRandom = Math.random
    Math.random = () => 0
  })
  await gestures.move(page, [start, { x: layer.x + layer.width * 0.9, y: start.y }, start])
  await page.evaluate(() => { Math.random = globalThis.smokeRandom })
  await gestures.release(page)
}

async function oseWanderingMonsterCase(page, testCase, seeded) {
  await step('drag the party token through a check cycle', () => dragPartyTokenThroughACheckCycle(page, testCase, seeded))
  await step('see the encounter alert', () => page.locator(ENCOUNTER_ALERT).wait())
}

// Whether every distance tracker on the page still reads 0 feet; a page
// without one proves nothing.
export function trackersAtZero(values) {
  return values.length > 0 && values.every((value) => value === "0'")
}

async function expectNoEncounterAlert(page) {
  if (await page.$(ENCOUNTER_ALERT)) throw new Error('A VtM map raised the encounter alert.')
}

async function expectTrackersAtZero(page) {
  const values = await page.$$eval('.map-distance-tracker-value', (elements) => elements.map((element) => element.textContent))
  if (!trackersAtZero(values)) throw new Error(`The distance tracker moved on a VtM map: ${JSON.stringify(values)}.`)
}

async function vtmWanderingMonsterCase(page, testCase, seeded) {
  await step('drag the party token through a check cycle', () => dragPartyTokenThroughACheckCycle(page, testCase, seeded))
  await settle()
  await step('see no encounter alert', () => expectNoEncounterAlert(page))
  await step('see the distance tracker still at 0 feet', () => expectTrackersAtZero(page))
}

async function wanderingMonsterCases(browser, testCase, ids, browserErrors) {
  const [ose, vtm] = ruleSetCampaigns
  const session = { testCase, groupId: ids.groupId, browserErrors }
  const oseMap = await seedCalibratedMapCampaign({ ...ids, testCase, ruleSet: ose })
  const vtmMap = await seedCalibratedMapCampaign({ ...ids, testCase, ruleSet: vtm })
  await inSignedInPage(browser, session, 'ose-wandering-monsters', (page) => oseWanderingMonsterCase(page, testCase, oseMap))
  await inSignedInPage(browser, session, 'vtm-wandering-monsters', (page) => vtmWanderingMonsterCase(page, testCase, vtmMap))
}

// The Lubec campaign the GM made through the picker, still empty. It
// opens in Lubec's own skin with its five tabs, and Tommy Eves, a Working Kid,
// comes in through Import a file as the standalone sheet saved him, with the
// smoke's PNG as his portrait, then gets the same PNG as his map token from
// the token beside the portrait. Both go to the Storage emulator, and after a
// reload the sheet shows them again from their stored paths alone. His Core
// page shows each Stat and Save in the v4 frame, without the page scrolling
// sideways, with a new active effect's editor closed or open. His Skills page
// shows the skill tree with his skills filled in and its wires drawn, reads a
// skill into the detail bar, and does not scroll sideways either.
const LUBEC_TAB = '.shell-root[data-theme="lubec"] .lubec-character-tab'
const LUBEC_CORE_PAGE = '.shell-root[data-theme="lubec"] .lubec-sheet .lubec-core'
const LUBEC_SKILLS_PAGE = '.shell-root[data-theme="lubec"] .lubec-sheet .lubec-skills'
const LUBEC_GEAR_PAGE = '.shell-root[data-theme="lubec"] .lubec-sheet .lubec-gear'
const LUBEC_CHARACTER_NAME = 'Tommy'
const LUBEC_FIXTURE_URL = new URL('../src/features/ruleSets/lubec/fixtures/tommy-eves.lubec-character.json', import.meta.url)
const LUBEC_PORTRAIT = `.lubec-idband img.lubec-portrait[alt=${JSON.stringify(`${LUBEC_CHARACTER_NAME} portrait`)}]`
const LUBEC_TOKEN = '.lubec-idband .lubec-id-art button.lubec-token[aria-label="Edit map token"]'

// Each Stat and Save as the imported draft's Core page shows it: the base
// typed in its circle's place, and under it what the Working Kid's +5 to every
// Stat and +10 to every Save make of it, with no effects.
const LUBEC_CORE_VALUES = [
  ['Strength', '24', '+5 class = 29'],
  ['Speed', '51', '+5 class = 56'],
  ['Intellect', '38', '+5 class = 43'],
  ['Handle', '50', '+5 class = 55'],
  ['Charm', '48', '+5 class = 53'],
  ['Sanity', '20', '+10 class = 30'],
  ['Fear', '24', '+10 class = 34'],
  ['Body', '21', '+10 class = 31'],
]

// The skills the tree fills in, in tree order, with their node's classes: the
// imported draft is still being chosen, so his free class skill's dot is the fixed one.
const LUBEC_TREE_MARKS = [['Swimming', 'skill-node on'], ['Diving', 'skill-node on'], ['Boatwork', 'skill-node on fixed']]
// One wire for each Expert's prerequisite.
const LUBEC_TREE_WIRES = 59
const LUBEC_TREE = `${LUBEC_SKILLS_PAGE} .skill-tree`
const LUBEC_SKILL_CHIPS = ['Boatwork +10', 'Swimming +10', 'Diving +15']
// The class record's title, Trauma Response and Melee Strength Mod; Strength 29 is one full 20.
const LUBEC_CLASS_RECORD = ['Working Kid', 'Steady Under Pressure', '+1 Impact']

/** A Lubec character file with a PNG as its portrait data URL. */
export const withLubecPortrait = (file, png) => ({ ...file, portrait: `data:image/png;base64,${png.toString('base64')}` })

async function lubecImportFile() {
  const fixture = JSON.parse(await readFile(LUBEC_FIXTURE_URL, 'utf8'))
  const path = join(await mkdtemp(join(tmpdir(), 'table-keep-smoke-')), 'lubec-Tommy-Eves.json')
  await writeFile(path, JSON.stringify(withLubecPortrait(fixture, SMOKE_PNG), null, 2))
  return path
}

const LUBEC_EFFECT_EDITOR = `${LUBEC_CORE_PAGE} .lubec-effects .lubec-effect-editor`

async function expectNavTabs(page, expected) {
  const labels = await page.$$eval('.side-nav .nav-list .tab-button', (tabs) => tabs.map((tab) => tab.textContent.trim()))
  if (labels.join() !== expected.join()) throw new Error(`The side nav shows ${labels.join(', ')}, not ${expected.join(', ')}.`)
}

// A narrow screen opens on the character list, so pick the character there first.
async function openLubecSheet(page) {
  const card = `.lubec-roster .monster-list-item ::-p-text(${JSON.stringify(LUBEC_CHARACTER_NAME)})`
  await Locator.race([page.locator(card), page.locator(LUBEC_CORE_PAGE)]).wait()
  await (await page.$(card))?.click()
  await page.locator(LUBEC_CORE_PAGE).wait()
}

async function importLubecCharacter(page, charactersPath, filePath) {
  // By class: the Lubec skin sets the button in capitals, which Chrome puts in its accessible name.
  await page.locator('.lubec-roster .lubec-new-btn').click()
  await page.locator('[role="dialog"] .lubec-door ::-p-text(Import a file)').click()
  const input = await page.locator('[role="dialog"] .lubec-import-file input[type="file"]').waitHandle()
  await input.uploadFile(filePath)
  let ids = []
  await waitForStored(() => listDocumentIds(charactersPath), (listed) => {
    ids = listed
    return listed.length === 1 ? [] : [`expected one stored character, found ${listed.length}`]
  })
  return `${charactersPath}/${ids[0]}`
}

// The portrait shows with a renderable http(s) URL, which after a reload only
// its stored path can have given it.
async function expectLubecPortraitShown(page) {
  await page.locator(`${LUBEC_PORTRAIT}[src^="http"]`).wait()
}

// The token's image shows with a renderable URL, which after a reload only its stored path can have given it.
async function expectLubecTokenShown(page) {
  await page.locator(`${LUBEC_TOKEN} img.token-icon-preview-image[src^="http"]`).wait()
}

async function setLubecTokenImage(page, imagePath) {
  await page.locator(LUBEC_TOKEN).click()
  await pickTokenImage(page, imagePath)
}

// The imported portrait, then a token image set from the sheet, both stored by path and shown again after a reload.
async function lubecMediaSteps(page, path) {
  await step('show the imported portrait on the sheet', () => expectLubecPortraitShown(page))
  await step('show the Lubec pawn as the token beside the portrait', () => page.locator(`${LUBEC_TOKEN} .token-pawn-preview`).wait())
  await step('give the character a token image from the token beside the portrait', async () => {
    await setLubecTokenImage(page, await smokeImageFile())
    await expectLubecTokenShown(page)
  })
  await step('store the portrait and the token image by path alone', () => waitForStored(() => readDocumentFields(path), storedMediaProblems))
  await step('see the portrait and the token image after a reload', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openLubecSheet(page)
    await expectLubecPortraitShown(page)
    await expectLubecTokenShown(page)
  })
}

// The Stats and Saves sections, not the Panic and Recovery circles below them.
const LUBEC_VALUE_ABILITIES = ['stats', 'saves']
  .map((section) => `${LUBEC_CORE_PAGE} [aria-labelledby="lubec-${section}-title"] .ability`).join(', ')

async function expectLubecCoreValues(page) {
  const rows = await page.$$eval(LUBEC_VALUE_ABILITIES, (elements) =>
    // An imported character is a draft, so each base value is in its field in the circle's place.
    elements.map((ability) => [
      ability.querySelector('.ability-name').textContent,
      ability.querySelector('.roll-circle.typed input').value,
      ability.querySelector('.base-note').textContent,
    ]))
  if (JSON.stringify(rows) !== JSON.stringify(LUBEC_CORE_VALUES)) throw new Error(`The Core page shows ${JSON.stringify(rows)}.`)
}

// Tommy comes in at the starting Stress of 2, and Sanity 30 is his lowest Save.
async function expectLubecPanicCircles(page) {
  const circles = await page.$$eval(`${LUBEC_CORE_PAGE} [aria-labelledby="lubec-panic-title"] .ability`, (elements) =>
    elements.map((ability) => [ability.querySelector('.ability-name').textContent, ability.querySelector('.roll-circle').textContent]))
  const expected = [['Panic Check', '2'], ['Recovery Save', '30']]
  if (JSON.stringify(circles) !== JSON.stringify(expected)) throw new Error(`The Panic section shows ${JSON.stringify(circles)}.`)
}

async function expectLubecPage(page, expected) {
  const current = await page.$eval('.lubec-page-tabs [aria-current="page"]', (tab) => tab.textContent)
  if (current !== expected) throw new Error(`The sheet shows its ${current} page, not ${expected}.`)
}

async function expectNoSidewaysScroll(page) {
  const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  if (widths[0] > widths[1]) throw new Error(`The page is ${widths[0]}px wide in a ${widths[1]}px viewport.`)
}

// Beside the roster on a desktop, the whole page fits its pane without scrolling.
async function expectLubecPageOnOneScreen(page, name) {
  const [height, visible] = await page.$eval(`${LUBEC_TAB} .characters-detail`, (pane) => [pane.scrollHeight, pane.clientHeight])
  if (height > visible) throw new Error(`The ${name} page is ${height}px tall in a ${visible}px pane.`)
}

const expectLubecCoreOnOneScreen = (page) => expectLubecPageOnOneScreen(page, 'Core')

const expectLubecGearOnOneScreen = (page) => expectLubecPageOnOneScreen(page, 'Gear')

// A new effect's editor opens in the effects panel; Cancel closes it unsaved.
async function openAndCloseLubecEffect(page) {
  await page.locator(`${LUBEC_CORE_PAGE} .lubec-effects .lubec-effect-add`).click()
  await page.locator(LUBEC_EFFECT_EDITOR).wait()
  await expectNoSidewaysScroll(page)
  await page.locator(`${LUBEC_EFFECT_EDITOR} ::-p-text(Cancel)`).click()
  await page.waitForFunction((selector) => !document.querySelector(selector), {}, LUBEC_EFFECT_EDITOR)
}

async function expectLubecSkillChips(page) {
  const chips = await page.$$eval(`${LUBEC_CORE_PAGE} .skill-chips .skill-chip`, (elements) => elements.map((chip) => chip.textContent))
  if (JSON.stringify(chips) !== JSON.stringify(LUBEC_SKILL_CHIPS)) throw new Error(`The skill strip offers ${JSON.stringify(chips)}.`)
}

// The three come back in page order: title, Trauma Response, Melee Strength Mod.
const LUBEC_CLASS_RECORD_PARTS = ['.section-bar h3', '.trauma-response strong', '.record-value strong']
  .map((part) => `${LUBEC_CORE_PAGE} .class-section ${part}`).join(', ')

async function expectLubecClassRecord(page) {
  const record = await page.$$eval(LUBEC_CLASS_RECORD_PARTS, (elements) => elements.map((element) => element.textContent))
  if (JSON.stringify(record) !== JSON.stringify(LUBEC_CLASS_RECORD)) throw new Error(`The class record shows ${JSON.stringify(record)}.`)
}

// The Skills tab at the top of the sheet opens the Skills page, where the tree is.
async function openLubecSkillsPage(page) {
  await page.locator('.lubec-page-tabs ::-p-text(Skills)').click()
  await page.locator(LUBEC_SKILLS_PAGE).wait()
}

async function expectLubecTreeSize(page) {
  const nodes = await page.$$eval(`${LUBEC_TREE} .skill-node`, (elements) => elements.length)
  if (nodes !== 54) throw new Error(`The skill tree shows ${nodes} skills, not 54.`)
}

async function expectLubecTreeMarks(page) {
  const marks = await page.$$eval(`${LUBEC_TREE} .skill-node.on`, (elements) => elements.map((node) => [node.dataset.skill, node.className]))
  if (JSON.stringify(marks) !== JSON.stringify(LUBEC_TREE_MARKS)) throw new Error(`The skill tree marks ${JSON.stringify(marks)}.`)
}

// The wires are measured from the laid-out tree, so they appear once it has a size.
async function expectLubecTreeWires(page) {
  await page.waitForFunction((selector, count) => document.querySelectorAll(selector).length === count, {}, `${LUBEC_TREE} path.wire`, LUBEC_TREE_WIRES)
}

// A narrow screen shows the skills as a list instead of the tree, so Diving's
// name is clicked wherever it shows: the hidden one has no box on the page.
async function clickShownDivingLabel(page) {
  await page.$$eval(`${LUBEC_SKILLS_PAGE} .skill-node[data-skill="Diving"] .skill-label`, (labels) =>
    labels.find((label) => label.getClientRects().length > 0).click())
}

// Reading Diving lights its two wires and puts it in the detail bar.
async function readLubecSkill(page) {
  await clickShownDivingLabel(page)
  const read = await page.$eval(LUBEC_SKILLS_PAGE, (section) =>
    [section.querySelector('.skill-detail h4').textContent, section.querySelectorAll('.skill-tree path.wire.hot').length])
  if (JSON.stringify(read) !== JSON.stringify(['Diving', 2])) throw new Error(`Reading Diving showed ${JSON.stringify(read)}.`)
}

async function lubecSkillsPageSteps(page, testCase) {
  await step('open the Lubec Skills page from its tab', () => openLubecSkillsPage(page))
  await page.mouse.move(0, page.viewport().height - 1)
  await step('show the Skills page in the v4 frame', () => expectLubecPage(page, 'Skills'))
  await step('show all 27 Trained and 27 Expert skills on the tree', () => expectLubecTreeSize(page))
  await step('fill in the free skill and picks on the tree', () => expectLubecTreeMarks(page))
  await step('wire each Trained skill to the Experts it unlocks', () => expectLubecTreeWires(page))
  await step('read a skill into the detail bar with its wires lit', () => readLubecSkill(page))
  await step('fit the Lubec Skills page without scrolling sideways', () => expectNoSidewaysScroll(page))
  await screenshot(page, `${testCase.name}-lubec-skills`)
}

// The GM makes an NPC in the same campaign, opens its Character sheet tab,
// makes a Direct entry sheet there and finalizes it. The sheet is stored in
// npcSheets under the NPC's own id, never scrolls sideways, and on a desktop
// fits the NPC's detail pane as a character's fits beside the roster.
const LUBEC_NPC_SHEET = '.shell-root[data-theme="lubec"] .npc-detail-tabs .lubec-sheet'
const LUBEC_NPC_PANE = '.shell-root[data-theme="lubec"] .monsters-layout .monsters-detail'

async function openLubecNpcsTab(page) {
  if (!(await page.$('.side-nav.open'))) await roleLocator(page, 'button', 'Open navigation').click()
  await page.locator('.side-nav .nav-list .tab-button ::-p-text(NPCs)').click()
  await closeNavigationDrawer(page)
  await page.locator('.shell-root[data-theme="lubec"] .monsters-layout').wait()
}

async function addLubecNpc(page, npcsPath) {
  await roleLocator(page, 'button', 'Add NPC').click()
  let ids = []
  await waitForStored(() => listDocumentIds(npcsPath), (listed) => {
    ids = listed
    return listed.length === 1 ? [] : [`expected one stored NPC, found ${listed.length}`]
  })
  return ids[0]
}

// The stage the NPC's stored sheet is at; null while there is none.
async function storedSheetStatus(path) {
  try {
    return (await readDocumentFields(path)).creationStatus.stringValue
  } catch {
    return null
  }
}

const sheetStatusIs = (expected) => (status) => (status === expected ? [] : [`the NPC's sheet is stored as ${status}, not ${expected}`])

async function makeLubecNpcSheet(page, sheetPath) {
  await page.locator('.npc-detail-tab-strip ::-p-text(Character sheet)').click()
  await page.locator('.lubec-npc-sheet-start .lubec-new-btn').click()
  await page.locator('[role="dialog"] .lubec-door ::-p-text(Direct entry)').click()
  await page.locator(`${LUBEC_NPC_SHEET} .lubec-draft-bar`).wait()
  await waitForStored(() => storedSheetStatus(sheetPath), sheetStatusIs('established_draft'))
}

async function finalizeLubecNpcSheet(page, sheetPath) {
  await page.locator(`${LUBEC_NPC_SHEET} .lubec-draft-bar .confirm-button`).click()
  await page.locator('[role="dialog"] .lubec-finalize .confirm-button').click()
  await page.waitForFunction((selector) => !document.querySelector(selector), {}, `${LUBEC_NPC_SHEET} .lubec-draft-bar`)
  await waitForStored(() => storedSheetStatus(sheetPath), sheetStatusIs('active'))
}

async function expectLubecNpcSheetOnOneScreen(page) {
  const [height, visible] = await page.$eval(LUBEC_NPC_PANE, (pane) => [pane.scrollHeight, pane.clientHeight])
  if (height > visible) throw new Error(`The NPC's Core page is ${height}px tall in a ${visible}px pane.`)
}

async function lubecNpcSheetSteps(page, testCase, campaignPath) {
  await step('open the Lubec NPCs tab', () => openLubecNpcsTab(page))
  const npcId = await step('make an NPC', () => addLubecNpc(page, `${campaignPath}/npcs`))
  const sheetPath = `${campaignPath}/npcSheets/${npcId}`
  await step('make a Direct entry sheet on the NPC\'s Character sheet tab', () => makeLubecNpcSheet(page, sheetPath))
  await step('finalize the NPC\'s sheet', () => finalizeLubecNpcSheet(page, sheetPath))
  await page.mouse.move(0, page.viewport().height - 1)
  await step('fit the NPC\'s sheet without scrolling sideways', () => expectNoSidewaysScroll(page))
  if (!testCase.viewport.isMobile) await step('fit the NPC\'s Core page on one desktop screen', () => expectLubecNpcSheetOnOneScreen(page))
  await screenshot(page, `${testCase.name}-lubec-npc-sheet`)
}

async function expectLubecPageTabs(page) {
  const tabs = await page.$$eval('.lubec-page-tabs button', (buttons) => buttons.map((button) => button.textContent))
  if (tabs.join() !== 'Core sheet,Skills,Gear') throw new Error(`The sheet offers the pages ${tabs.join(', ')}.`)
}

// The draft bar's Finalize, then the dialog's: the character goes into use, and the draft bar goes.
async function finalizeLubecCharacter(page) {
  await page.locator('.lubec-draft-bar .confirm-button').click()
  await page.locator('[role="dialog"] .lubec-finalize .confirm-button').click()
  await page.waitForFunction(() => !document.querySelector('.lubec-draft-bar'))
}

async function openLubecGearPage(page) {
  await page.locator('.lubec-page-tabs ::-p-text(Gear)').click()
  await page.locator(`${LUBEC_GEAR_PAGE} .pack`).wait()
}

// What the Gear page shows of its boxes, read in the page.
const readLubecGearBoxes = (gear) => ({
  main: gear.querySelectorAll('.pack [aria-label="Empty main-pocket slot, add an item"]').length,
  front: gear.querySelectorAll('.pack [aria-label$="pocket, empty, add an item"]').length,
  small: gear.querySelector('.pack .small-stuff')?.getAttribute('aria-label'),
  handsAndBody: gear.querySelectorAll('.hb .slot:not(.item)').length,
  items: gear.querySelectorAll('.slot.item').length,
  full: gear.querySelectorAll('.gear-bar .tag.red').length > 0,
})

// The empty backpack: five main boxes, two front boxes and the small stuff pill, empty hands and body, and no full tag.
async function expectEmptyLubecGear(page) {
  const shown = await page.$eval(LUBEC_GEAR_PAGE, readLubecGearBoxes)
  const expected = { main: 5, front: 2, small: 'Small stuff: empty', handsAndBody: 4, items: 0, full: false }
  if (JSON.stringify(shown) !== JSON.stringify(expected)) throw new Error(`The empty Gear page shows ${JSON.stringify(shown)}.`)
}

const LUBEC_GEAR_SHEET = `${LUBEC_GEAR_PAGE} [role="dialog"]`

// On a phone the form is pages, and only the last one offers Add it: its step tab turns straight to it.
async function pressLubecGearSubmit(page) {
  if (await page.$(`${LUBEC_GEAR_SHEET} .form-steps`)) await page.locator(`${LUBEC_GEAR_SHEET} .form-steps button:last-child`).click()
  await page.locator(`${LUBEC_GEAR_SHEET} button[type="submit"]`).click()
}

const lubecGearSheetClosed = (page) => page.waitForFunction((selector) => !document.querySelector(selector), {}, LUBEC_GEAR_SHEET)

async function submitLubecGearForm(page) {
  await pressLubecGearSubmit(page)
  await lubecGearSheetClosed(page)
}

// The Gear bar's add opens the form at the main pocket; Browse stock opens on the form's kind, a Thing, so the
// search is widened to every kind before it finds the item, and picking its tile copies it in.
async function addLubecStockItem(page, name) {
  await page.locator(`${LUBEC_GEAR_PAGE} .gear-bar .add-top`).click()
  await page.locator(`${LUBEC_GEAR_SHEET} .link-btn`).click()
  await page.locator(`${LUBEC_GEAR_SHEET} .stock-kinds label:first-child`).click()
  await page.locator(`${LUBEC_GEAR_SHEET} .stock-tools input[type="text"]`).fill(name)
  await page.locator(`${LUBEC_GEAR_SHEET} .stock-tile ::-p-text(${name})`).click()
  await submitLubecGearForm(page)
}

async function expectLubecGearItemInMainPocket(page, name, line = '') {
  const items = await page.$$eval(`${LUBEC_GEAR_PAGE} .pack .slot.item .slot-text`, (texts) => texts.map((item) => item.textContent))
  if (items.join() !== `${name}${line}`) throw new Error(`The backpack holds ${JSON.stringify(items)}, not ${name} reading "${line}".`)
}

// The value down `path` in a stored document's REST shape, or undefined where any step is missing.
const storedAt = (value, path) => path.reduce((at, key) => (at == null ? undefined : at[key]), value)

const storedGearItems = (gear) => storedAt(gear, ['mapValue', 'fields', 'items', 'arrayValue', 'values']) || []

const storedItemNames = (items) => items.map((item) => storedAt(item, ['mapValue', 'fields', 'name', 'stringValue'])).join()

const gearItemsProblem = (items, name) => (storedItemNames(items) === name ? [] : [`the stored gear items are ${JSON.stringify(items)}`])

const gearUrlProblem = (gear) => (String(JSON.stringify(gear)).includes('http') ? ['the stored gear holds a URL'] : [])

// One item in `lubec.gear.items`, and nothing in the gear that is a URL.
function storedGearProblems(stored, name) {
  const gear = storedAt(stored, ['lubec', 'mapValue', 'fields', 'gear'])
  return [...gearItemsProblem(storedGearItems(gear), name), ...gearUrlProblem(gear)]
}

const LUBEC_ARMOR_PANEL = `${LUBEC_GEAR_PAGE} .armor-panel`

// "+ Make armor" opens the form on armor, to be worn, and Browse stock opens on armor, where the helmet's tile copies it in.
async function fillLubecStockHelmet(page) {
  await page.locator(`${LUBEC_ARMOR_PANEL} .section-head .btn`).click()
  await page.locator(`${LUBEC_GEAR_SHEET} .link-btn`).click()
  await page.locator(`${LUBEC_GEAR_SHEET} .stock-tile ::-p-text(Hockey helmet)`).click()
  await pressLubecGearSubmit(page)
}

// The head's shade on the drawing, and the readout once the head has focus, read in the page.
// The head is an SVG region, which Puppeteer's own focus refuses, so the page focuses it.
async function readLubecArmorHead(page) {
  await page.$eval(`${LUBEC_ARMOR_PANEL} .hit[aria-label^="Head:"]`, (head) => head.focus())
  await page.waitForFunction((selector) => document.querySelector(selector)?.textContent.startsWith('Head'), {}, `${LUBEC_ARMOR_PANEL} .readout`)
  return page.$eval(LUBEC_ARMOR_PANEL, (panel) => ({
    worn: panel.querySelectorAll('.body-map .worn').length,
    readout: panel.querySelector('.readout').textContent,
  }))
}

// The head's readout with one helmet on, and with two: their layers, their numbers added up, and who covers it.
const LUBEC_HELMET_READOUTS = {
  1: 'Head1 of 2 layersCut−1Pierce−1Blunt−2Gun0Hockey helmet',
  2: 'Head2 of 2 layersCut−2Pierce−2Blunt−4Gun0Hockey helmet, Hockey helmet',
}

async function expectLubecArmorHead(page, layers) {
  const head = await readLubecArmorHead(page)
  const expected = { worn: 1, readout: LUBEC_HELMET_READOUTS[layers] }
  if (JSON.stringify(head) !== JSON.stringify(expected)) throw new Error(`The Armor panel shows ${JSON.stringify(head)}.`)
}

async function wearLubecStockHelmet(page, layers) {
  await fillLubecStockHelmet(page)
  await lubecGearSheetClosed(page)
  await expectLubecArmorHead(page, layers)
}

// With both of the head's layers taken, the form stays open with the refusal, and its close button leaves it unsaved.
async function expectLubecThirdHelmetRefused(page) {
  await fillLubecStockHelmet(page)
  const refusal = await page.locator(`${LUBEC_GEAR_SHEET} .form-error`).map((error) => error.textContent).wait()
  if (!refusal.startsWith('No free layer on the head: 2 of 2 taken by ')) throw new Error(`The third helmet is refused with "${refusal}".`)
  await page.locator(`${LUBEC_GEAR_SHEET} .close`).click()
  await lubecGearSheetClosed(page)
}

// How many columns On you has, and which page tab is current in the top bar, read in the page.
const readLubecGearLayout = (gear) => {
  const columns = gear.ownerDocument.defaultView.getComputedStyle(gear.querySelector('.on-you')).gridTemplateColumns.split(' ').length
  const tab = gear.ownerDocument.querySelector('.lubec-topbar .lubec-page-tabs [aria-current="page"]')?.textContent
  return `${columns} column(s), with the ${tab} tab current in the top bar`
}

// On a phone the On you view is one column, under the page tabs in the top bar.
async function expectLubecGearOneColumn(page) {
  const layout = await page.$eval(LUBEC_GEAR_PAGE, readLubecGearLayout)
  if (layout !== '1 column(s), with the Gear tab current in the top bar') throw new Error(`On you shows ${layout}.`)
}

// On a desktop On you fits one screen; on a phone it is one column under the page tabs.
function lubecGearFitStep(page, testCase) {
  if (testCase.viewport.isMobile) return step('fit the Gear page on a phone in one column with the page tabs in place', () => expectLubecGearOneColumn(page))
  return step('fit On you on one desktop screen', () => expectLubecGearOnOneScreen(page))
}

async function lubecGearPageSteps(page, testCase, path) {
  await step('offer the three page tabs: Core sheet, Skills, Gear', () => expectLubecPageTabs(page))
  await step('finalize Tommy with the draft bar\'s Finalize and the dialog\'s Finalize', () => finalizeLubecCharacter(page))
  await step('open the Lubec Gear page from its tab', () => openLubecGearPage(page))
  await page.mouse.move(0, page.viewport().height - 1)
  await step('show the Gear page in the v4 frame', () => expectLubecPage(page, 'Gear'))
  await step('show the empty backpack, hands and body with no full-inventory tag', () => expectEmptyLubecGear(page))
  await step('fit the Lubec Gear page without scrolling sideways', () => expectNoSidewaysScroll(page))
  await lubecGearFitStep(page, testCase)
  await step('add a Flashlight from the stock picker into the main pocket, reading "2 of 2 loaded"', async () => {
    await addLubecStockItem(page, 'Flashlight')
    await expectLubecGearItemInMainPocket(page, 'Flashlight', '2 of 2 loaded')
  })
  await step('store the gear by path alone, with one item', () => waitForStored(() => readDocumentFields(path), (stored) => storedGearProblems(stored, 'Flashlight')))
  await step('see the Flashlight in the main pocket after a reload', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openLubecSheet(page)
    await openLubecGearPage(page)
    await expectLubecGearItemInMainPocket(page, 'Flashlight', '2 of 2 loaded')
  })
  await step('wear a stock hockey helmet, shading the head, with its layers and numbers in the readout', () => wearLubecStockHelmet(page, 1))
  await step('wear a second helmet as the head\'s second layer', () => wearLubecStockHelmet(page, 2))
  await step('refuse a third helmet with "No free layer on the head: 2 of 2 taken by ..."', () => expectLubecThirdHelmetRefused(page))
  await page.mouse.move(0, page.viewport().height - 1)
  await step('fit the Gear page without scrolling sideways after the adds', () => expectNoSidewaysScroll(page))
  await lubecGearFitStep(page, testCase)
  await screenshot(page, `${testCase.name}-lubec-gear`)
}

async function lubecSheetCase(page, testCase, { campaignName, charactersPath }) {
  const filePath = await lubecImportFile()
  await step('open the Lubec campaign made through the picker', () => openCampaignCard(page, campaignName, LUBEC_TAB))
  await step('offer the five Lubec tabs', () => expectNavTabs(page, ['Characters', 'Maps', 'NPCs', 'Notes', 'Calendar']))
  const path = await step('import the Tommy Eves file with a portrait', () => importLubecCharacter(page, charactersPath, filePath))
  await lubecMediaSteps(page, path)
  // Clear of the page tabs, so the review screenshot shows them at rest.
  await page.mouse.move(0, page.viewport().height - 1)
  await step('show the Core page in the v4 frame', () => expectLubecPage(page, 'Core sheet'))
  await step('show each Stat and Save\'s typed base in its roll circle with what its class makes of it under it', () => expectLubecCoreValues(page))
  await step('offer the skills to add to a roll in the strip under the Saves', () => expectLubecSkillChips(page))
  await step('show the Panic Check over Stress and the Recovery Save on the lowest Save in roll circles', () => expectLubecPanicCircles(page))
  await step('show the class record with its Trauma Response and Melee Strength Mod', () => expectLubecClassRecord(page))
  await step('fit a new active effect\'s editor without scrolling sideways', () => openAndCloseLubecEffect(page))
  await page.mouse.move(0, page.viewport().height - 1)
  await step('fit the Lubec sheet without scrolling sideways', () => expectNoSidewaysScroll(page))
  if (!testCase.viewport.isMobile) await step('fit the Lubec Core page on one desktop screen', () => expectLubecCoreOnOneScreen(page))
  await screenshot(page, `${testCase.name}-lubec-core`)
  await lubecSkillsPageSteps(page, testCase)
  await lubecGearPageSteps(page, testCase, path)
  await lubecNpcSheetSteps(page, testCase, charactersPath.replace(/\/characters$/, ''))
}

// Runs in the Lubec campaign `createAndOpenCampaign` made through the picker.
async function lubecCampaignCase(browser, testCase, ids, campaignId, browserErrors) {
  const campaignName = `${testCase.label} Lubec Campaign`
  const charactersPath = `groups/${ids.groupId}/campaigns/${campaignId}/characters`
  const session = { testCase, groupId: ids.groupId, browserErrors }
  await inSignedInPage(browser, session, 'lubec-sheet', (page) => lubecSheetCase(page, testCase, { campaignName, charactersPath }))
}

function collectBrowserErrors(page, errors, surface) {
  page.on('pageerror', (error) => {
    errors.push(`${surface} page error: ${error.message}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location()
      // The Firestore emulator can close and retry its long-lived Listen or
      // Write WebChannel with a bare 400 after the operation has succeeded.
      // Keep this exception exact so every other console error stays fatal.
      if (isExpectedFirestoreEmulatorChannelError({
        text: message.text(),
        url: location.url,
      })) {
        console.log(`EXPECTED ${surface}: Firestore emulator retried a WebChannel.`)
        return
      }
      const source = location.url ? ` (${location.url}:${location.lineNumber ?? 0})` : ''
      errors.push(`${surface} console error: ${message.text()}${source}`)
    }
  })
}

async function newSmokePage(browser, testCase, browserErrors) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  collectBrowserErrors(page, browserErrors, testCase.name)
  await page.setViewport(testCase.viewport)
  page.setDefaultTimeout(15_000)
  return { context, page }
}

async function submitEmailSignIn(page, testCase, path = '/') {
  await page.goto(`${APP_URL}${path}`, { waitUntil: 'domcontentloaded' })
  await roleLocator(page, 'region', 'Authentication').wait()
  await page.locator('input[type="email"]').fill(testCase.email)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await roleLocator(page, 'button', 'Sign in with email').click()
}

// Signs in an account that is already verified and has a handle, on the
// group's home page.
async function signInToGroupHome(page, testCase, groupId) {
  await submitEmailSignIn(page, testCase, `/groups/${groupId}`)
  await roleLocator(page, 'button', 'Create new draft').wait()
}

async function runViewport(browser, testCase) {
  const browserErrors = []
  const { context, page } = await newSmokePage(browser, testCase, browserErrors)

  try {
    const uid = await createAuthUser(testCase.email)
    await submitEmailSignIn(page, testCase)

    await roleLocator(page, 'region', 'Email verification').wait()
    await waitForBodyText(page, 'Verification email sent.')

    const verificationPage = await context.newPage()
    try {
      const verificationLink = await waitForVerificationLink(testCase.email)
      await verificationPage.goto(verificationLink, { waitUntil: 'domcontentloaded' })
      await waitForBodyText(verificationPage, 'successfully verified')
    } finally {
      await verificationPage.close()
    }

    await roleLocator(page, 'region', 'Choose a handle').wait()
    await page.locator('input[autocomplete="username"]').fill(testCase.username)
    await waitForBodyText(page, 'Handle is available.')
    await roleLocator(page, 'button', 'Save handle').click()

    await waitForBodyText(page, 'No groups yet')
    await roleLocator(page, 'button', '+ Create a group').click()
    await roleLocator(page, 'dialog', 'New group').wait()
    await page.locator('[role="dialog"] input[type="text"]').fill(testCase.groupName)
    await roleLocator(page, 'button', 'Create').click()
    await waitForBodyText(page, testCase.groupName)
    const groupId = groupIdFromUrl(page)
    const created = await openCampaignCases(page, testCase, { uid, groupId })
    await vtmLastEditCases(browser, testCase, { uid, groupId }, browserErrors)
    await vtmEditKeepsFieldsCases(browser, testCase, { uid, groupId }, browserErrors)
    await vtmCharacterLifecycleCases(browser, testCase, { uid, groupId }, browserErrors)
    await oseLastEditCases(browser, testCase, { uid, groupId }, browserErrors)
    await oseMigratedCharacterCases(browser, testCase, { uid, groupId }, browserErrors)
    await wanderingMonsterCases(browser, testCase, { uid, groupId }, browserErrors)
    await lubecCampaignCase(browser, testCase, { uid, groupId }, created.lubec, browserErrors)
    await new Promise((resolve) => setTimeout(resolve, 500))

    if (browserErrors.length > 0) {
      throw new Error(browserErrors.join('\n'))
    }

    console.log(
      `PASS ${testCase.name}: signed in, verified email, claimed a handle, created a group, `
      + 'opened a seeded character, and opened the character tab of a new '
      + `${ruleSetCampaigns.map((ruleSet) => ruleSet.label).join(' and a new ')} campaign made through the picker, `
      + 'and kept a VtM edit made just before leaving the sheet or switching campaign, '
      + 'and saved a VtM edit leaving every other stored field of a filled-in sheet as it was, '
      + 'and created, edited, gave a portrait and a token image to, reloaded and deleted a VtM character, '
      + 'and an OSE edit made just before opening Notes, hiding the page or switching campaign, '
      + 'and opened the sheets of the demo party as the migration left them, '
      + 'and kept the items and ids the migration made of an old-format character through a save and two reloads, '
      + 'storing it at version 1, '
      + 'and saw a party moved through a check cycle meet a wandering monster on an OSE map but not on a VtM map, '
      + 'and, in the Lubec campaign made through the picker, in its own skin, with its five tabs, imported a character file with a portrait, '
      + 'gave it a token image from the sheet, saw both again after a reload from their stored paths, opened the imported character\'s Core page and Skills page, '
      + 'finalized it and added a stock Flashlight on its Gear page that was stored by path alone and kept through a reload, '
      + 'wore two stock hockey helmets on its head and was refused a third, '
      + 'and made an NPC a Direct entry sheet on its Character sheet tab and finalized it.',
    )
  } finally {
    await screenshot(page, testCase.name)
    await context.close()
  }
}

// Importing this file (as its unit test does) must not start the smoke.
const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`

if (invokedDirectly) {
  await mkdir(SCREENSHOT_DIR, { recursive: true })
  const server = startApp()
  let browser

  try {
    await waitForApp(server)
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const failures = []
    for (const testCase of viewports) {
      try {
        await runViewport(browser, testCase)
      } catch (error) {
        failures.push(`${testCase.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (failures.length > 0) {
      throw new Error(`Browser smoke failures:\n${failures.join('\n')}`)
    }
  } finally {
    await browser?.close()
    await stopApp(server)
  }
}
