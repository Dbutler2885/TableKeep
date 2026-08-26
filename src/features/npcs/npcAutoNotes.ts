import type { SessionNote } from '../../types/app'

export type NpcAutoNote = {
  sessionTitle: string
  sessionNumber: number | null
  npcName: string
  title: string
  action: 'new' | 'update'
  facts: string[]
}

export function buildAutoNotesForNpc(npcId: string, notes: SessionNote[]): NpcAutoNote[] {
  const result: NpcAutoNote[] = []
  for (const note of notes) {
    for (const mention of note.npcMentions) {
      if (mention.linkedNpcId === npcId && mention.facts.length > 0) {
        result.push({
          sessionTitle: note.title,
          sessionNumber: note.sessionNumber,
          npcName: mention.name,
          title: mention.title,
          action: mention.action,
          facts: mention.facts,
        })
      }
    }
  }
  return result
}
