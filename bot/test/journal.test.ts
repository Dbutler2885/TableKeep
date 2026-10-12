import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { JournalWriter, readJournal, type JournalRecord } from '../src/journal/journal.ts'
import { Voice, Wire } from './helpers/synth.ts'

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'tablekeep-journal-'))
  file = path.join(dir, 'session.journal')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function someRecords(): JournalRecord[] {
  const packets = new Wire('jem', { startMs: 1_000 }).send(new Voice().speak(0.2))
  return [
    { type: 'event', event: { atMs: 990, kind: 'session-started', sessionId: 'session-1' } },
    { type: 'event', event: { atMs: 995, kind: 'speaker-joined', speakerId: 'jem', displayName: 'Jem' } },
    ...packets.map((packet): JournalRecord => ({ type: 'packet', packet })),
    { type: 'event', event: { atMs: 1_300, kind: 'session-stopped', reason: 'stop command' } },
  ]
}

function write(records: JournalRecord[]): void {
  const writer = new JournalWriter(file, 0)
  for (const record of records) writer.append(record)
  writer.close()
}

/** Compares records by value: a payload read from disk is a different object holding the same bytes. */
function assertSameRecords(actual: JournalRecord[], expected: JournalRecord[]): void {
  const plain = (records: JournalRecord[]) =>
    records.map((record) =>
      record.type === 'packet'
        ? { ...record, packet: { ...record.packet, payload: Buffer.from(record.packet.payload).toString('hex') } }
        : record,
    )
  assert.deepEqual(plain(actual), plain(expected))
}

test('everything appended is read back, in order', () => {
  const records = someRecords()
  write(records)

  const contents = readJournal(file)

  assertSameRecords(contents.records, records)
  assert.equal(contents.tornBytes, 0)
})

test('a record is in the file as soon as it is appended, before the journal is closed', () => {
  const records = someRecords()
  const writer = new JournalWriter(file, 0)
  writer.append(records[0]!)
  writer.append(records[1]!)

  assertSameRecords(readJournal(file).records, records.slice(0, 2))
  writer.close()
})

test('a record torn off mid-write is discarded and everything before it is kept', () => {
  const records = someRecords()
  write(records)
  truncateSync(file, readFileSync(file).length - 7)

  const contents = readJournal(file)

  assertSameRecords(contents.records, records.slice(0, -1))
  assert.ok(contents.tornBytes > 0)
})

test('reading stops at a damaged record and does not trust anything after it', () => {
  const records = someRecords()
  write(records)
  const bytes = readFileSync(file)
  // Flip a byte inside the fourth record's body.
  let offset = 4
  for (let index = 0; index < 3; index += 1) offset += 4 + bytes.readUInt32LE(offset) + 4
  bytes[offset + 6]! ^= 0xff
  writeFileSync(file, bytes)

  const contents = readJournal(file)

  assertSameRecords(contents.records, records.slice(0, 3))
  assert.ok(contents.tornBytes > 0)
})

test('a journal can be reopened and appended to, as after a restart', () => {
  const records = someRecords()
  write(records.slice(0, 5))
  write(records.slice(5))

  assertSameRecords(readJournal(file).records, records)
})

test('a file that is not a journal yields nothing', () => {
  appendFileSync(file, 'not a journal at all')
  assert.deepEqual(readJournal(file), { records: [], tornBytes: 20 })
})
