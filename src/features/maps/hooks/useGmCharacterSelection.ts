import { useMemo, useState, type ComponentProps, type Dispatch, type SetStateAction } from 'react'
import { CharacterTab } from '../../character/CharacterTab'
import { isPlayerOwnedLivingPartyCharacter } from '../lib/partyCharacterEligibility'

export function useGmCharacterSelection({ characterTabProps, gmUserId, gmCharacterOrderIds, desktopGmPane, setDesktopGmPane, mobileGmPane, setMobileGmPane }: {
  characterTabProps?: ComponentProps<typeof CharacterTab>
  gmUserId: string | null
  gmCharacterOrderIds: string[]
  desktopGmPane: 'map' | 'character'
  setDesktopGmPane: Dispatch<SetStateAction<'map' | 'character'>>
  mobileGmPane: 'map' | 'tokens' | 'characters'
  setMobileGmPane: Dispatch<SetStateAction<'map' | 'tokens' | 'characters'>>
}) {
  const [selectedGmCharacterId, setSelectedGmCharacterId] = useState('')
  const gmWorkspaceCharacters = useMemo(() => {
    if (!characterTabProps) return []
    const eligible = characterTabProps.characters.filter((character) => isPlayerOwnedLivingPartyCharacter(character, gmUserId))
    const byId = new Map(eligible.map((character) => [character.id, character]))
    const ordered = gmCharacterOrderIds.map((id) => byId.get(id)).filter((character): character is NonNullable<typeof character> => Boolean(character))
    const orderedIds = new Set(ordered.map((character) => character.id))
    const extras = eligible.filter((character) => !orderedIds.has(character.id)).sort((a, b) => a.name.localeCompare(b.name))
    return [...ordered, ...extras]
  }, [characterTabProps, gmCharacterOrderIds, gmUserId])
  const selectedGmCharacter = useMemo(() => gmWorkspaceCharacters.find((character) => character.id === selectedGmCharacterId) ?? gmWorkspaceCharacters[0] ?? null, [gmWorkspaceCharacters, selectedGmCharacterId])
  const selectedGmCharacterIndex = selectedGmCharacter ? Math.max(0, gmWorkspaceCharacters.findIndex((character) => character.id === selectedGmCharacter.id)) : -1
  const selectedGmCharacterTabProps = selectedGmCharacter && characterTabProps ? { ...characterTabProps, characters: [selectedGmCharacter], selectedCharacterId: selectedGmCharacter.id, selectedCharacter: selectedGmCharacter } : null
  const [previousCharacters, setPreviousCharacters] = useState(gmWorkspaceCharacters)
  if (previousCharacters !== gmWorkspaceCharacters) {
    setPreviousCharacters(gmWorkspaceCharacters)
    if (gmWorkspaceCharacters.length === 0) {
      setSelectedGmCharacterId('')
      if (desktopGmPane === 'character') setDesktopGmPane('map')
      if (mobileGmPane === 'characters') setMobileGmPane('map')
    } else if (!gmWorkspaceCharacters.some((character) => character.id === selectedGmCharacterId)) {
      setSelectedGmCharacterId(gmWorkspaceCharacters[0].id)
    }
  }

  return { selectedGmCharacterId, setSelectedGmCharacterId, gmWorkspaceCharacters, selectedGmCharacter, selectedGmCharacterIndex, selectedGmCharacterTabProps }
}
