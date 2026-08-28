#!/usr/bin/env node
// Seeds the hosted demo's one pristine template campaign.
//
//   npm run demo:seed-template              # dry run against the emulator
//   npm run demo:seed-template -- --apply   # write it into the emulator
//
// Both forms boot the emulators with the committed `emulator-data/` snapshot
// imported and read the campaign back out of them, so the demo everyone can run
// locally and the demo on the deployed site are the same campaign by
// construction rather than by anyone keeping two copies in step. The snapshot
// is only ever read.
//
// To seed a real Firebase project, add `--target=project`:
//
//   GOOGLE_ACCESS_TOKEN=$(gcloud auth print-access-token) \
//     npm run demo:seed-template -- --target=project --project=<id> --bucket=<bucket> --apply
//
// That path is deliberately the same code as the emulator path: Firestore's REST
// API and Cloud Storage's JSON API are the same shape on the emulator as they
// are in production, so a dry run against the emulator rehearses the real one.
// Nothing here has ever been pointed at a production project - the captain
// decides when that happens.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TEMPLATE_CAMPAIGN_ID,
  TEMPLATE_GROUP_ID,
  TEMPLATE_SUBCOLLECTIONS,
  collectStorageObjects,
  rewriteFields,
  storagePrefixes,
  templateCampaignDoc,
  templateGroupDoc,
} from './templatePlan.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

function parseArgs(argv) {
  const args = { apply: false, target: 'emulator', project: '', bucket: '', sourceGroup: '', sourceCampaign: '' }
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true
    else if (arg.startsWith('--target=')) args.target = arg.slice('--target='.length)
    else if (arg.startsWith('--project=')) args.project = arg.slice('--project='.length)
    else if (arg.startsWith('--bucket=')) args.bucket = arg.slice('--bucket='.length)
    else if (arg.startsWith('--source-group=')) args.sourceGroup = arg.slice('--source-group='.length)
    else if (arg.startsWith('--source-campaign=')) args.sourceCampaign = arg.slice('--source-campaign='.length)
    else throw new Error(`Unrecognised argument: ${arg}`)
  }
  if (args.target !== 'emulator' && args.target !== 'project') {
    throw new Error(`--target must be "emulator" or "project", got "${args.target}"`)
  }
  return args
}

function readDemoEnvValue(key) {
  const contents = readFileSync(path.join(repoRoot, '.env.demo'), 'utf8')
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator !== -1 && trimmed.slice(0, separator).trim() === key) {
      return trimmed.slice(separator + 1).trim()
    }
  }
  throw new Error(`.env.demo has no ${key}`)
}

/**
 * The emulator this script is running inside, as the source of the campaign.
 *
 * `firebase emulators:exec` exports these, and the "owner" bearer token is the
 * emulators' documented way to bypass security rules from a script.
 */
function emulatorEndpoints() {
  const firestore = process.env.FIRESTORE_EMULATOR_HOST
  const storage = process.env.FIREBASE_STORAGE_EMULATOR_HOST
  const projectId = process.env.GCLOUD_PROJECT
  if (!firestore || !storage || !projectId) {
    throw new Error('Run this through `npm run demo:seed-template`, which starts the emulators around it.')
  }
  return {
    label: `emulator (${projectId})`,
    projectId,
    firestoreBase: `http://${firestore}`,
    storageBase: `http://${storage}`,
    bucket: readDemoEnvValue('VITE_FIREBASE_STORAGE_BUCKET'),
    token: 'owner',
  }
}

function projectEndpoints(args) {
  const token = process.env.GOOGLE_ACCESS_TOKEN
  if (!args.project) throw new Error('--target=project needs --project=<firebase project id>')
  if (!args.bucket) throw new Error('--target=project needs --bucket=<storage bucket>')
  if (!token) throw new Error('--target=project needs GOOGLE_ACCESS_TOKEN (gcloud auth print-access-token)')
  return {
    label: `project ${args.project}`,
    projectId: args.project,
    firestoreBase: 'https://firestore.googleapis.com',
    storageBase: 'https://storage.googleapis.com',
    bucket: args.bucket,
    token,
  }
}

const documentsUrl = (endpoint) =>
  `${endpoint.firestoreBase}/v1/projects/${endpoint.projectId}/databases/(default)/documents`

async function firestoreRequest(endpoint, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${endpoint.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${url} -> ${response.status} ${await response.text()}`)
  }
  return response.json()
}

async function listDocuments(endpoint, collectionPath) {
  const documents = []
  let pageToken
  do {
    const url = new URL(`${documentsUrl(endpoint)}${collectionPath}`)
    url.searchParams.set('pageSize', '300')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const body = await firestoreRequest(endpoint, url.toString())
    documents.push(...(body.documents ?? []))
    pageToken = body.nextPageToken
  } while (pageToken)
  return documents
}

async function getDocument(endpoint, documentPath) {
  return firestoreRequest(endpoint, `${documentsUrl(endpoint)}${documentPath}`)
}

async function writeDocument(endpoint, documentPath, fields) {
  const url = new URL(`${documentsUrl(endpoint)}${documentPath}`)
  for (const key of Object.keys(fields)) url.searchParams.append('updateMask.fieldPaths', key)
  await firestoreRequest(endpoint, url.toString(), { method: 'PATCH', body: JSON.stringify({ fields }) })
}

async function downloadObject(endpoint, objectPath) {
  const url = `${endpoint.storageBase}/storage/v1/b/${endpoint.bucket}/o/${encodeURIComponent(objectPath)}?alt=media`
  const response = await fetch(url, { headers: { Authorization: `Bearer ${endpoint.token}` } })
  if (!response.ok) throw new Error(`GET ${objectPath} -> ${response.status}`)
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
  }
}

async function uploadObject(endpoint, objectPath, body, contentType) {
  const url = `${endpoint.storageBase}/upload/storage/v1/b/${endpoint.bucket}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${endpoint.token}`, 'Content-Type': contentType },
    body,
  })
  if (!response.ok) throw new Error(`POST ${objectPath} -> ${response.status} ${await response.text()}`)
}

/**
 * Finds the campaign in the snapshot, or explains why it could not.
 *
 * The snapshot holds exactly one group with exactly one campaign, and that is
 * the demo. Guessing is safe while that stays true and refuses rather than picks
 * when it stops being true.
 */
async function resolveSource(endpoint, args) {
  if (args.sourceGroup && args.sourceCampaign) {
    return { groupId: args.sourceGroup, campaignId: args.sourceCampaign }
  }

  const groups = (await listDocuments(endpoint, '/groups')).map((doc) => doc.name.split('/').pop())
  const candidates = []
  for (const groupId of groups) {
    if (groupId === TEMPLATE_GROUP_ID) continue
    for (const campaign of await listDocuments(endpoint, `/groups/${groupId}/campaigns`)) {
      candidates.push({ groupId, campaignId: campaign.name.split('/').pop() })
    }
  }

  if (candidates.length === 1) return candidates[0]
  throw new Error(
    candidates.length === 0
      ? 'The snapshot has no campaign to copy. Is emulator-data/ present and imported?'
      : `The snapshot has ${candidates.length} campaigns; name one with --source-group=... --source-campaign=...`,
  )
}

async function readCampaignTree(endpoint, source) {
  const base = `/groups/${source.groupId}/campaigns/${source.campaignId}`
  const collected = []

  const walk = async (documentPath, specs) => {
    for (const spec of specs) {
      for (const document of await listDocuments(endpoint, `${documentPath}/${spec.name}`)) {
        const id = document.name.split('/').pop()
        collected.push({ path: `${documentPath}/${spec.name}/${id}`, fields: document.fields ?? {} })
        if (spec.children?.length) await walk(`${documentPath}/${spec.name}/${id}`, spec.children)
      }
    }
  }

  await walk(base, TEMPLATE_SUBCOLLECTIONS)
  return collected
}

function templatePathFor(documentPath, source) {
  const from = `/groups/${source.groupId}/campaigns/${source.campaignId}/`
  const to = `/groups/${TEMPLATE_GROUP_ID}/campaigns/${TEMPLATE_CAMPAIGN_ID}/`
  return to + documentPath.slice(from.length)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sourceEndpoint = emulatorEndpoints()
  const targetEndpoint = args.target === 'project' ? projectEndpoints(args) : sourceEndpoint

  const source = await resolveSource(sourceEndpoint, args)
  const prefixes = storagePrefixes(source)

  const sourceGroup = await getDocument(sourceEndpoint, `/groups/${source.groupId}`)
  const sourceCampaign = await getDocument(
    sourceEndpoint,
    `/groups/${source.groupId}/campaigns/${source.campaignId}`,
  )
  const children = await readCampaignTree(sourceEndpoint, source)

  const writes = [
    { path: `/groups/${TEMPLATE_GROUP_ID}`, fields: templateGroupDoc(sourceGroup.fields ?? {}) },
    {
      path: `/groups/${TEMPLATE_GROUP_ID}/campaigns/${TEMPLATE_CAMPAIGN_ID}`,
      fields: templateCampaignDoc(sourceCampaign.fields ?? {}, prefixes),
    },
    ...children.map((child) => ({
      path: templatePathFor(child.path, source),
      fields: rewriteFields(child.fields, prefixes),
    })),
  ]

  const objects = collectStorageObjects(
    [{ fields: sourceCampaign.fields ?? {} }, ...children],
    prefixes,
  )

  console.log(`Source     : ${sourceEndpoint.label} groups/${source.groupId}/campaigns/${source.campaignId}`)
  console.log(`Destination: ${targetEndpoint.label} groups/${TEMPLATE_GROUP_ID}/campaigns/${TEMPLATE_CAMPAIGN_ID}`)
  console.log(`Documents  : ${writes.length}`)
  console.log(`Objects    : ${objects.length}`)
  for (const object of objects) console.log(`  ${object.from}\n    -> ${object.to}`)

  if (!args.apply) {
    console.log('\nDry run. Nothing was written. Add --apply to seed.')
    return
  }

  for (const write of writes) {
    await writeDocument(targetEndpoint, write.path, write.fields)
  }
  for (const object of objects) {
    const { body, contentType } = await downloadObject(sourceEndpoint, object.from)
    await uploadObject(targetEndpoint, object.to, body, contentType)
  }

  console.log(`\nSeeded ${writes.length} documents and ${objects.length} objects into ${targetEndpoint.label}.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
