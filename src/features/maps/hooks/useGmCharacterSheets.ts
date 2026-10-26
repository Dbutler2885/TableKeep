import { useCallback, type ComponentProps, type Dispatch, type SetStateAction } from 'react'
import type { CharacterTab } from '../../character/CharacterTab'
import { pagedIndex } from '../lib/gmMapUpdates'
import type { useGmCharacterSelection } from './useGmCharacterSelection'

type GmCharacterSheetsOptions = {
  selection: ReturnType<typeof useGmCharacterSelection>
  characterTabProps: ComponentProps<typeof CharacterTab> | undefined
  isMobile: boolean
  setMobileGmPane: Dispatch<SetStateAction<'map' | 'tokens' | 'characters'>>
  setDesktopGmPane: Dispatch<SetStateAction<'map' | 'character'>>
}

// Opening the party's character sheets from the GM's map workspace: in the
// character pane on a phone, and in the character view on the desktop.
export function useGmCharacterSheets({ selection, characterTabProps, isMobile, setMobileGmPane, setDesktopGmPane }: GmCharacterSheetsOptions) {
  const { setSelectedGmCharacterId, gmWorkspaceCharacters, selectedGmCharacter, selectedGmCharacterIndex } = selection

  const openGmCharacterSheet = useCallback((characterId: string) => {
    setSelectedGmCharacterId(characterId)
    characterTabProps?.setSelectedCharacterId(characterId)
    if (isMobile) setMobileGmPane('characters')
    else setDesktopGmPane('character')
  }, [characterTabProps, isMobile, setDesktopGmPane, setMobileGmPane, setSelectedGmCharacterId])

  const pageGmCharacter = useCallback((direction: -1 | 1) => {
    if (gmWorkspaceCharacters.length === 0) return
    openGmCharacterSheet(gmWorkspaceCharacters[pagedIndex(selectedGmCharacterIndex, direction, gmWorkspaceCharacters.length)].id)
  }, [gmWorkspaceCharacters, openGmCharacterSheet, selectedGmCharacterIndex])

  // The phone's character button opens the first sheet when none is chosen yet.
  const openGmCharacters = () => {
    const first = selectedGmCharacter ? null : gmWorkspaceCharacters[0]
    if (first) openGmCharacterSheet(first.id)
    else setMobileGmPane('characters')
  }

  return { openGmCharacterSheet, pageGmCharacter, openGmCharacters }
}

export type GmCharacterSheets = ReturnType<typeof useGmCharacterSheets>
