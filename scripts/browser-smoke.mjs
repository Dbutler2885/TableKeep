import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import process from 'node:process'
import puppeteer from 'puppeteer'

const APP_URL = 'http://127.0.0.1:4173'
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099'
const FIRESTORE_EMULATOR_URL = 'http://127.0.0.1:8080'
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
const API_KEY = 'demo-api-key'
const PASSWORD = 'table-keep-smoke-password'
const SCREENSHOT_DIR = 'artifacts/browser-smoke'

const viewports = [
  {
    name: 'desktop',
    viewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
    email: 'browser-desktop@example.test',
    username: 'desk001',
    groupName: 'Desktop Smoke Group',
  },
  {
    name: 'mobile',
    viewport: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    email: 'browser-mobile@example.test',
    username: 'mobi001',
    groupName: 'Mobile Smoke Group',
  },
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
  await requestJson(
    `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
    },
  )
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

function collectBrowserErrors(page, errors, surface) {
  page.on('pageerror', (error) => {
    errors.push(`${surface} page error: ${error.message}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location()
      // The Firestore emulator can close and retry its long-lived Listen
      // WebChannel with a bare 400 even after the write and subsequent snapshot
      // have succeeded. Keep this exception exact so application errors, other
      // emulator failures, and every other HTTP 400 still fail the smoke gate.
      if (
        message.text() === 'Failed to load resource: the server responded with a status of 400 (Bad Request)'
        && location.url.startsWith(`${FIRESTORE_EMULATOR_URL}/google.firestore.v1.Firestore/Listen/channel`)
      ) {
        console.log(`EXPECTED ${surface}: Firestore emulator retried a Listen WebChannel.`)
        return
      }
      const source = location.url ? ` (${location.url}:${location.lineNumber ?? 0})` : ''
      errors.push(`${surface} console error: ${message.text()}${source}`)
    }
  })
}

async function runViewport(browser, testCase) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  const browserErrors = []
  collectBrowserErrors(page, browserErrors, testCase.name)
  await page.setViewport(testCase.viewport)
  page.setDefaultTimeout(15_000)

  try {
    await createAuthUser(testCase.email)
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await roleLocator(page, 'region', 'Authentication').wait()

    await page.locator('input[type="email"]').fill(testCase.email)
    await page.locator('input[type="password"]').fill(PASSWORD)
    await roleLocator(page, 'button', 'Sign in with email').click()

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
    await new Promise((resolve) => setTimeout(resolve, 500))

    if (browserErrors.length > 0) {
      throw new Error(browserErrors.join('\n'))
    }

    console.log(`PASS ${testCase.name}: signed in, verified email, claimed a handle, and created a group.`)
  } finally {
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/${testCase.name}.png`,
      fullPage: true,
    })
    await context.close()
  }
}

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
