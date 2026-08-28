import type { CharacterSpell } from '../../../types/app'

type Props = { spell: CharacterSpell }

export function SpellDescriptionBody({ spell }: Props) {
  const lines = spell.description
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const blocks: React.ReactNode[] = []
  let bulletBuffer: string[] = []
  let key = 0

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return
    const bullets = bulletBuffer
    bulletBuffer = []
    blocks.push(
      <ul key={`spell-detail-bullets-${key++}`} className="character-spell-detail-list">
        {bullets.map((bullet, index) => (
          <li key={`spell-detail-bullet-${index}`}>{bullet}</li>
        ))}
      </ul>,
    )
  }

  for (const line of lines) {
    if (line.startsWith('- ')) {
      bulletBuffer.push(line.slice(2).trim())
      continue
    }
    flushBullets()
    blocks.push(
      <p key={`spell-detail-paragraph-${key++}`} className="character-spell-detail-paragraph">
        {line}
      </p>,
    )
  }
  flushBullets()
  return <>{blocks}</>
}
