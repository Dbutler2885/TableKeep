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
import { oseCharacterV0ToV1, RETIRED_DETAIL_FIELDS } from '../src/features/ruleSets/ose/characterMigrations.ts'

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
// matches only that rule set's character tab, so opening the wrong sheet fails.
const ruleSetCampaigns = [
  { system: 'ose', label: 'OSE', characterTab: '.characters-layout:not(.vtm-character-tab)' },
  { system: 'vtm', label: 'VtM', characterTab: '.vtm-character-tab' },
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
// such as Lubec never shows there.
async function expectPickerOffersOnly(page, systems) {
  const offered = await page.$$eval('[role="dialog"] select option', (options) => options.map((option) => option.value))
  if (offered.join() !== systems.join()) {
    throw new Error(`The campaign picker offers ${offered.join(', ')}, not ${systems.join(', ')}.`)
  }
}

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
  await step(`show the empty ${ruleSet.label} character list`, () => waitForBodyText(page, 'No characters available.'))
  await screenshot(page, `${testCase.name}-${ruleSet.system}-character`)
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

// Everything the smoke checks inside the group, once it exists. Add a case here.
async function openCampaignCases(page, testCase, { uid, groupId }) {
  await step('open a seeded character', () => openSeededCharacter(page, testCase, { uid, groupId }))
  for (const ruleSet of ruleSetCampaigns) {
    await step('go back to the group home', () => backToGroupHome(page, testCase))
    await createAndOpenCampaign(page, testCase, ruleSet)
  }
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
  const fields = ownedFixtureFields(fixture.data, { uid, username: testCase.username })
  await seedCharacter({ groupId, campaignId, characterId: fixture.id, fields })
  const path = characterPath({ groupId, campaignId, characterId: fixture.id })
  return { campaignId, campaignName, characterName: fields.name, concept: fields.vtm.concept, fields, path }
}

// The fields every save sets beside the edit: the rule set's version, the
// write time and `updatedAt`, in the order `changedFirestoreFields` names them.
const SAVE_STAMP_FIELDS = ['schemaVersion', 'schemaWrittenAt', 'updatedAt']

// What is wrong with a stored character, in the REST shape, that a save
// should have left at version 1 with a write time.
export function storedVersionProblems(stored) {
  const problems = []
  if (stored.schemaVersion?.integerValue !== '1') problems.push(`schemaVersion is ${JSON.stringify(stored.schemaVersion)}, not 1`)
  if (typeof stored.schemaWrittenAt?.timestampValue !== 'string') problems.push('schemaWrittenAt is not a time')
  return problems
}

// The OSE detail fields a save at version 1 must have removed.
export function retiredDetailFieldsStored(stored) {
  const details = stored.details?.mapValue?.fields ?? {}
  return RETIRED_DETAIL_FIELDS.filter((name) => Object.hasOwn(details, name))
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
  const problems = []
  const tokenIcon = stored.tokenIcon?.mapValue?.fields ?? {}
  if (!stored.portraitPath?.stringValue) problems.push('no portrait path is stored')
  if (stored.portraitUrl) problems.push('a portrait URL is stored')
  if (tokenIcon.icon?.stringValue !== 'custom') problems.push('the token icon is not a custom image')
  if (!tokenIcon.customImagePath?.stringValue) problems.push('no token image path is stored')
  if (tokenIcon.customImageUrl) problems.push('a token image URL is stored')
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

// An old-format OSE character, stored before characters carried a version: an
// Elf with old weapon and pack lists, a pack row without an id, and no spell
// book. The sheet reads it through OSE's step, so it holds the items the step
// makes, with the step's ids, on every reload.
const OSE_LEGACY_FIXTURES_URL = new URL('../src/features/ruleSets/ose/fixtures/legacy.json', import.meta.url)
const OSE_LEGACY_FIXTURE = 'caster-without-book'

// The inventory OSE's step makes of a stored character, in the REST shape.
export const stepInventory = (characterId, fields) =>
  toFirestoreFields(oseCharacterV0ToV1(fields, characterId).details).inventory

async function seedLegacyOseCampaign({ uid, groupId, testCase }) {
  const fixture = JSON.parse(await readFile(OSE_LEGACY_FIXTURES_URL, 'utf8'))[OSE_LEGACY_FIXTURE]
  const campaignName = `${testCase.label} OSE Old Format`
  const campaignId = await seedCampaign({ groupId, gmUserId: uid, fields: { name: campaignName, system: 'ose' } })
  const fields = ownedFixtureFields(fixture.data, { uid, username: testCase.username })
  await seedCharacter({ groupId, campaignId, characterId: fixture.id, fields })
  const path = characterPath({ groupId, campaignId, characterId: fixture.id })
  return { campaignName, characterName: fields.name, characterId: fixture.id, fields, path }
}

// A save writes the items the sheet holds, so the stored items are the ones
// the sheet showed when it last saved.
async function expectStepItemsStored(seeded) {
  const stored = (await readDocumentFields(seeded.path)).details?.mapValue?.fields?.inventory
  const expected = stepInventory(seeded.characterId, seeded.fields)
  if (!sameFirestoreValue(stored, expected)) {
    throw new Error(`The sheet holds other items than OSE's step makes: ${JSON.stringify(stored)}`)
  }
}

// A save of an old-format character stores it at version 1, without the old
// lists or the manual-AC flag a merge would otherwise keep.
async function expectStoredAsVersion1(seeded) {
  const stored = await readDocumentFields(seeded.path)
  expectStoredAtVersion1(stored)
  const retired = retiredDetailFieldsStored(stored)
  if (retired.length > 0) throw new Error(`The save left old fields stored: ${retired.join(', ')}.`)
}

async function oseLegacyItemsCase(page, seeded) {
  await step('open the OSE campaign with an old-format character', () => openCampaignCard(page, seeded.campaignName, oseCharacterTab))
  await step('edit the OSE Name', () => editOseName(page, seeded))
  await settle()
  await step('see the save store the items OSE\'s step makes, with its ids', () => expectStepItemsStored(seeded))
  await step('see the save store the character at version 1, without the old lists', () => expectStoredAsVersion1(seeded))
  for (const reload of ['first', 'second']) {
    await step(`see the same items and ids after the ${reload} reload`, async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectOseName(page, `${seeded.characterName}, edited`)
      await settle()
      await expectStepItemsStored(seeded)
    })
  }
}

async function oseLegacyItemsCases(browser, testCase, ids, browserErrors) {
  const seeded = await seedLegacyOseCampaign({ ...ids, testCase })
  const session = { testCase, groupId: ids.groupId, browserErrors }
  await inSignedInPage(browser, session, 'ose-legacy-items', (page) => oseLegacyItemsCase(page, seeded))
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

// No GM can create a Lubec campaign, so the smoke seeds one. It opens to the
// placeholder page in Lubec's own skin, with the character tab its only tab.
const LUBEC_PLACEHOLDER = '.shell-root[data-theme="lubec"] .lubec-sheet-placeholder'

async function expectNavTabs(page, expected) {
  const labels = await page.$$eval('.side-nav .nav-list .tab-button', (tabs) => tabs.map((tab) => tab.textContent.trim()))
  if (labels.join() !== expected.join()) throw new Error(`The side nav shows ${labels.join(', ')}, not ${expected.join(', ')}.`)
}

async function lubecPlaceholderCase(page, campaignName) {
  await step('open the seeded Lubec campaign', () => openCampaignCard(page, campaignName, LUBEC_PLACEHOLDER))
  await step('show the Lubec placeholder page', () => waitForBodyText(page, 'The Lubec character sheet is not built yet.'))
  await step('offer only the character tab', () => expectNavTabs(page, ['Characters']))
}

async function lubecCampaignCase(browser, testCase, ids, browserErrors) {
  const campaignName = `${testCase.label} Lubec Campaign`
  await seedCampaign({ groupId: ids.groupId, gmUserId: ids.uid, fields: { name: campaignName, system: 'lubec' } })
  const session = { testCase, groupId: ids.groupId, browserErrors }
  await inSignedInPage(browser, session, 'lubec-placeholder', (page) => lubecPlaceholderCase(page, campaignName))
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
    await openCampaignCases(page, testCase, { uid, groupId })
    await vtmLastEditCases(browser, testCase, { uid, groupId }, browserErrors)
    await vtmEditKeepsFieldsCases(browser, testCase, { uid, groupId }, browserErrors)
    await vtmCharacterLifecycleCases(browser, testCase, { uid, groupId }, browserErrors)
    await oseLastEditCases(browser, testCase, { uid, groupId }, browserErrors)
    await oseLegacyItemsCases(browser, testCase, { uid, groupId }, browserErrors)
    await wanderingMonsterCases(browser, testCase, { uid, groupId }, browserErrors)
    await lubecCampaignCase(browser, testCase, { uid, groupId }, browserErrors)
    await new Promise((resolve) => setTimeout(resolve, 500))

    if (browserErrors.length > 0) {
      throw new Error(browserErrors.join('\n'))
    }

    console.log(
      `PASS ${testCase.name}: signed in, verified email, claimed a handle, created a group, `
      + 'opened a seeded character, and opened the character tab of a new '
      + `${ruleSetCampaigns.map((ruleSet) => ruleSet.label).join(' and a new ')} campaign, `
      + 'and kept a VtM edit made just before leaving the sheet or switching campaign, '
      + 'and saved a VtM edit leaving every other stored field of a filled-in sheet as it was, '
      + 'and created, edited, gave a portrait and a token image to, reloaded and deleted a VtM character, '
      + 'and an OSE edit made just before opening Notes, hiding the page or switching campaign, '
      + 'and kept the items and ids OSE\'s step makes of an old-format character through a save and two reloads, '
      + 'storing it at version 1 without its old lists, '
      + 'and saw a party moved through a check cycle meet a wandering monster on an OSE map but not on a VtM map, '
      + 'and opened a seeded Lubec campaign to its placeholder page in its own skin.',
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
