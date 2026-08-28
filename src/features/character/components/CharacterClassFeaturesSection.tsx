import type { ReactNode } from 'react'
import type { ClassFeature } from '../lib/characterTabTypes'

function renderFeatureSummary(feature: ClassFeature): ReactNode {
  const links = feature.summaryLinks ?? []
  if (links.length === 0) return feature.summary

  let parts: ReactNode[] = [feature.summary]
  links.forEach((link, linkIndex) => {
    const targetWord = link.word.trim()
    if (!targetWord) return
    let replaced = false
    parts = parts.flatMap((part, partIndex) => {
      if (typeof part !== 'string' || replaced) return [part]
      const matchIndex = part.toLowerCase().indexOf(targetWord.toLowerCase())
      if (matchIndex < 0) return [part]
      replaced = true
      const before = part.slice(0, matchIndex)
      const match = part.slice(matchIndex, matchIndex + targetWord.length)
      const after = part.slice(matchIndex + targetWord.length)
      const mapped: ReactNode[] = []
      if (before) mapped.push(before)
      mapped.push(
        <a
          key={`feature-link-${feature.id}-${linkIndex}-${partIndex}`}
          className="character-class-feature-link"
          href={link.url}
          target="_blank"
          rel="noreferrer noopener"
        >
          {match}
        </a>,
      )
      if (after) mapped.push(after)
      return mapped
    })
  })
  return <>{parts}</>
}

type Props = { features: ClassFeature[] }

export function CharacterClassFeaturesSection({ features }: Props) {
  return (
    <section className="monster-section-block">
      <div className="character-asw-head-row">
        <h3 className="monster-section-title">Class Features</h3>
        <p>Auto-filled from class and level.</p>
      </div>
      {features.length === 0 ? (
        <p className="character-enc-help">No class features configured for this class yet.</p>
      ) : (
        <div className="character-sheet-rows">
          {features.map((feature) => (
            <div key={feature.id} className="character-sheet-row character-class-feature-row">
              <span className="character-sheet-code">L{feature.unlockedAt}</span>
              <strong className="character-class-feature-name">{feature.name}</strong>
              <small>{renderFeatureSummary(feature)}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
