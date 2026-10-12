import { describe, expect, it } from 'vitest'
import { buildSessionTimeline, formatGapLength, formatSessionClock, sessionStatusLabel, SAMPLES_PER_SECOND as S } from './sessionTimeline'

const speakers = [
  { discordId: 'jem', displayName: 'Jem' },
  { discordId: 'peter', displayName: 'Peter' },
]
const say = (id: string, speakerId: string, start: number, end: number, text: string) => ({
  id,
  speakerId,
  startSamples: start * S,
  endSamples: end * S,
  text,
})

describe('a session timeline', () => {
  it('puts speech, notes and gaps in the order they happened', () => {
    const timeline = buildSessionTimeline({
      utterances: [say('a', 'jem', 5, 8, 'We open the door.'), say('b', 'peter', 70, 72, 'I draw my sword.')],
      markers: [{ id: 'm', atSamples: 60 * S, text: 'the fight starts here', authorDiscordId: 'peter' }],
      gaps: [{ id: 'g', startSamples: 20 * S, endSamples: 50 * S }],
      speakers,
      throughSamples: null,
    })

    expect(timeline.map((entry) => [entry.kind, formatSessionClock(entry.atSamples)])).toEqual([
      ['speech', '00:05'],
      ['gap', '00:20'],
      ['note', '01:00'],
      ['speech', '01:10'],
    ])
    expect(timeline[1]).toMatchObject({ kind: 'gap', seconds: 30 })
    expect(timeline[2]).toMatchObject({ kind: 'note', author: 'Peter', text: 'the fight starts here' })
  })

  it('joins what one person says across a short pause, and not across a long one or someone else', () => {
    const timeline = buildSessionTimeline({
      utterances: [
        say('a', 'jem', 1, 3, 'We open the door.'),
        say('b', 'jem', 4, 6, 'Carefully.'),
        say('c', 'jem', 9, 10, 'Anything?'),
        say('d', 'peter', 10.5, 11, 'Nothing.'),
        say('e', 'jem', 11.5, 12, 'Good.'),
      ],
      markers: [],
      gaps: [],
      speakers,
      throughSamples: null,
    })

    expect(timeline.map((entry) => (entry.kind === 'speech' ? `${entry.speaker}: ${entry.text}` : entry.kind))).toEqual([
      'Jem: We open the door. Carefully.',
      'Jem: Anything?',
      'Peter: Nothing.',
      'Jem: Good.',
    ])
  })

  it('starts a new line after a note, even mid-speech', () => {
    const timeline = buildSessionTimeline({
      utterances: [say('a', 'jem', 1, 3, 'Before.'), say('b', 'jem', 3.5, 5, 'After.')],
      markers: [{ id: 'm', atSamples: 3.2 * S, text: 'mark', authorDiscordId: 'jem' }],
      gaps: [],
      speakers,
      throughSamples: null,
    })

    expect(timeline.map((entry) => entry.kind)).toEqual(['speech', 'note', 'speech'])
  })

  it('holds back notes and gaps that fall after the speech loaded so far', () => {
    const input = {
      utterances: [say('a', 'jem', 1, 3, 'First page.')],
      markers: [{ id: 'm', atSamples: 500 * S, text: 'later', authorDiscordId: 'jem' }],
      gaps: [{ id: 'g', startSamples: 400 * S, endSamples: 450 * S }],
      speakers,
    }

    expect(buildSessionTimeline({ ...input, throughSamples: 3 * S }).map((entry) => entry.kind)).toEqual(['speech'])
    expect(buildSessionTimeline({ ...input, throughSamples: null }).map((entry) => entry.kind)).toEqual(['speech', 'gap', 'note'])
  })

  it('names a speaker it has no record of plainly', () => {
    const [entry] = buildSessionTimeline({ utterances: [say('a', 'stranger', 1, 2, 'Hello.')], markers: [], gaps: [], speakers, throughSamples: null })

    expect(entry).toMatchObject({ speaker: 'Unknown speaker' })
  })
})

describe('session labels', () => {
  it('shows hours only once a session has run that long', () => {
    expect([formatSessionClock(0), formatSessionClock(75 * S), formatSessionClock(3725 * S)]).toEqual(['00:00', '01:15', '1:02:05'])
  })

  it('gives a gap a length a person would say', () => {
    expect([formatGapLength(0.4), formatGapLength(42), formatGapLength(75), formatGapLength(600)]).toEqual([
      '1 second',
      '42 seconds',
      '1 minute',
      '10 minutes',
    ])
  })

  it('says where a session has got to', () => {
    const label = (state: 'running' | 'finalising' | 'ended', recapStatus: 'pending' | 'delayed' | 'ready' | 'failed' | null, needsAttention: string | null = null) =>
      sessionStatusLabel({ state, recapStatus, needsAttention })

    expect(label('running', null)).toBe('Recording now')
    expect(label('finalising', null)).toBe('Saving')
    expect(label('finalising', 'delayed', 'The transcript is incomplete.')).toBe('Recap delayed')
    expect(label('ended', 'pending')).toBe('Recap being written')
    expect(label('ended', 'ready')).toBe('Recap ready')
    expect(label('ended', 'failed')).toBe('Recap failed')
  })
})
