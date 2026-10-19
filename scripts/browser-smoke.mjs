import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import process from 'node:process'
import puppeteer, { Locator } from 'puppeteer'
import { isExpectedFirestoreEmulatorChannelError } from './browser-smoke-errors.mjs'
import {
  characterPath,
  PROJECT_ID,
  readDocumentFields,
  seedCampaign,
  seedCharacter,
  seedDocument,
  toFirestoreFields,
} from './browser-smoke-seed.mjs'

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

async function createAndOpenCampaign(page, testCase, ruleSet) {
  const campaignName = `${testCase.label} ${ruleSet.label} Campaign`
  await step(`create the ${ruleSet.label} campaign`, async () => {
    await roleLocator(page, 'button', 'Create new draft').click()
    await page.locator('[role="dialog"] input[type="text"]').fill(campaignName)
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
    await oseLastEditCases(browser, testCase, { uid, groupId }, browserErrors)
    await wanderingMonsterCases(browser, testCase, { uid, groupId }, browserErrors)
    await new Promise((resolve) => setTimeout(resolve, 500))

    if (browserErrors.length > 0) {
      throw new Error(browserErrors.join('\n'))
    }

    console.log(
      `PASS ${testCase.name}: signed in, verified email, claimed a handle, created a group, `
      + 'opened a seeded character, and opened the character tab of a new '
      + `${ruleSetCampaigns.map((ruleSet) => ruleSet.label).join(' and a new ')} campaign, `
      + 'and kept a VtM edit made just before leaving the sheet or switching campaign, '
      + 'and an OSE edit made just before opening Notes, hiding the page or switching campaign, '
      + 'and saw a party moved through a check cycle meet a wandering monster on an OSE map but not on a VtM map.',
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
