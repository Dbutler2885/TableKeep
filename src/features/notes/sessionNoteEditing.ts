import type { SessionNote, SessionScene } from '../../types/app'

export type SummaryKey = 'overallSummary' | 'summaryMarkdown'

export type EditingSection =
  | { key: 'title' }
  | { key: 'overallSummary' }
  | { key: 'summaryMarkdown' }
  | { key: 'scene'; sceneIndex: number }
  | { key: 'cliffhangers' }

export type SceneDraft = { summary: string; details: string[] }

export function isEditingSection(section: EditingSection | null, key: EditingSection['key']): boolean {
  return section?.key === key
}

export function editingSceneIndex(section: EditingSection | null): number | null {
  return section?.key === 'scene' ? section.sceneIndex : null
}

export function replaceAt<T>(items: T[], index: number, value: T): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item))
}

export function withSceneDraft(scenes: SessionScene[], index: number, draft: SceneDraft): SessionScene[] {
  return replaceAt(scenes, index, { ...scenes[index], summary: draft.summary, details: draft.details })
}

export function toggleIndex(indexes: Set<number>, index: number): Set<number> {
  const next = new Set(indexes)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  return next
}

/** The markdown summary is shown only for a note that has no overall summary. */
export function fallbackSummaryMarkdown(note: SessionNote): string {
  return note.overallSummary ? '' : note.summaryMarkdown
}

export function textareaRows(text: string, minimum: number): number {
  return Math.max(minimum, text.split('\n').length)
}
