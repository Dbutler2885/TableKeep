// Reports the size of the committed demo snapshot and fails if it is over
// budget.
//
// `emulator-data/` carries every Storage object the demo campaign uses - map
// images and portraits - and git keeps every version of every one of them
// forever. A 12 MB source PNG dropped in during authoring is permanent weight
// on every future clone, so check this before committing a re-export.

import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  snapshotArg,
  snapshotDir,
  snapshotFileSizeLimitBytes,
  snapshotSizeLimitBytes,
} from './config.mjs'

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function collectFiles(directory) {
  const files = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath))
    } else if (entry.isFile()) {
      files.push({ path: entryPath, size: statSync(entryPath).size })
    }
  }

  return files
}

let files
try {
  files = collectFiles(snapshotDir)
} catch {
  console.error(`No demo snapshot at ${snapshotArg}. Build one with "npm run demo:author".`)
  process.exit(1)
}

const total = files.reduce((sum, file) => sum + file.size, 0)
const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 10)

console.log(`${snapshotArg}: ${files.length} files, ${formatBytes(total)} total`)
console.log(`budget: ${formatBytes(snapshotSizeLimitBytes)} total, ${formatBytes(snapshotFileSizeLimitBytes)} per file`)
console.log('')
console.log('largest files:')

for (const file of largest) {
  console.log(`  ${formatBytes(file.size).padStart(9)}  ${path.relative(snapshotDir, file.path)}`)
}

const oversizedFiles = files.filter((file) => file.size > snapshotFileSizeLimitBytes)
const problems = []

if (total > snapshotSizeLimitBytes) {
  problems.push(`the snapshot is ${formatBytes(total)}, over the ${formatBytes(snapshotSizeLimitBytes)} budget`)
}

if (oversizedFiles.length > 0) {
  problems.push(`${oversizedFiles.length} file(s) are over the ${formatBytes(snapshotFileSizeLimitBytes)} per-file budget`)
}

if (problems.length > 0) {
  console.error('')
  for (const problem of problems) {
    console.error(`over budget: ${problem}`)
  }
  console.error('')
  console.error('Shrink the source images and re-upload them in the app, then re-export.')
  process.exit(1)
}

console.log('')
console.log('within budget.')
