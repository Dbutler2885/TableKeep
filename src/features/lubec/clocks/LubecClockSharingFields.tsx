import type { LubecClockCharacter, LubecClockSharing, LubecClockVisibility } from './lubecClock'

const CHOICES: { value: LubecClockVisibility; label: string }[] = [
  { value: 'hidden', label: 'Hidden' },
  { value: 'all', label: 'Everyone' },
  { value: 'some', label: 'Chosen players' },
]

const characterLabel = (character: LubecClockCharacter) =>
  character.ownerUsername ? `${character.name} (${character.ownerUsername})` : character.name

type Props = { sharing: LubecClockSharing; characters: readonly LubecClockCharacter[]; onChange: (patch: Partial<LubecClockSharing>) => void }

function PlayerPicker({ sharing, characters, onChange }: Props) {
  const toggle = (id: string) => onChange({
    characterIds: sharing.characterIds.includes(id) ? sharing.characterIds.filter((current) => current !== id) : [...sharing.characterIds, id],
  })
  if (characters.length === 0) return <p className="clock-sharing-note">No player has a character in this campaign yet.</p>
  return (
    <div className="clock-players" role="group" aria-label="Show it to">
      {characters.map((character) => (
        <label key={character.id} className="clock-player">
          <input type="checkbox" checked={sharing.characterIds.includes(character.id)} onChange={() => toggle(character.id)} />
          <span>{characterLabel(character)}</span>
        </label>
      ))}
      <p className="clock-sharing-note">The players who own these characters see it. Save again if a character changes hands.</p>
    </div>
  )
}

/** Who sees the clock, which only the GM sets: nobody, everyone, or chosen players' characters, as a handout's visibility. */
export function LubecClockSharingFields({ sharing, characters, onChange }: Props) {
  return (
    <fieldset className="clock-sharing">
      <legend className="clock-label">Who sees it</legend>
      <div className="clock-seg">
        {CHOICES.map((choice) => (
          <label key={choice.value}>
            <input type="radio" name="lubec-clock-visibility" value={choice.value} checked={sharing.visibility === choice.value} onChange={() => onChange({ visibility: choice.value })} />
            <span>{choice.label}</span>
          </label>
        ))}
      </div>
      {sharing.visibility === 'hidden' ? <p className="clock-sharing-note">Only you see it.</p> : null}
      {sharing.visibility === 'all' ? <p className="clock-sharing-note">Everyone in the campaign sees it.</p> : null}
      {sharing.visibility === 'some' ? <PlayerPicker sharing={sharing} characters={characters} onChange={onChange} /> : null}
    </fieldset>
  )
}
