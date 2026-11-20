import { useState } from 'react'
import type { Role } from '../../types/app'
import type { CampaignScope } from '../campaign/firestorePaths'
import { emptyHandout, folderAncestors, foldersExpandedByClick, visibleFolders, type Handout, type HandoutFolder } from './handoutModel'
import { deleteHandout, deleteHandoutFolder, saveHandout, saveHandoutFolder, useHandouts } from './useHandouts'
import { HandoutEditor } from './HandoutEditor'
import { HandoutFolderEditor } from './HandoutFolderEditor'
import { HandoutSidebar, HandoutDetail, HandoutFolderDetail, HandoutDeleteDialog } from './HandoutPanels'
import './handouts.css'

type Props = { groupId: string; campaignId: string; gmUserId: string; userId: string; role: Role | null }
type HandoutData = ReturnType<typeof useHandouts>

function useHandoutSelection(data: HandoutData, isGm: boolean) {
  const [flat, setFlat] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [folderId, setFolderId] = useState('')
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([])
  const selected = data.handouts.find((handout) => handout.id === selectedId)
  const folders = isGm ? data.folders : visibleFolders(data.folders, data.handouts)
  const currentFolder = folders.find((folder) => folder.id === folderId)
  const destinationFolderId = currentFolder?.id ?? ''
  const folderEmpty = !data.handouts.some((handout) => handout.folderId === folderId) && !data.folders.some((folder) => folder.parentId === folderId)
  const chooseFolder = (id: string) => { setFolderId(id); setSelectedId('') }
  const clickFolder = (id: string) => {
    if (id) setExpandedFolderIds((current) => foldersExpandedByClick(current, id, folderId))
    chooseFolder(id)
  }
  // Opens every folder on the path to a saved item, so it is visible where it landed.
  const revealFolders = (ids: string[]) => setExpandedFolderIds((current) => [...new Set([...current, ...ids.filter(Boolean)])])
  return { flat, setFlat, selectedId, setSelectedId, folderId, setFolderId, expandedFolderIds, selected, folders, currentFolder, destinationFolderId, folderEmpty, chooseFolder, clickFolder, revealFolders }
}

type Selection = ReturnType<typeof useHandoutSelection>
function useHandoutActions(scope: CampaignScope, gmUserId: string, selection: Selection, setError: HandoutData['setError']) {
  const [editing, setEditing] = useState<Handout | null>(null)
  const [editingFolder, setEditingFolder] = useState<HandoutFolder | null>(null)
  const [deleting, setDeleting] = useState<Handout | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await action() } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  const save = async (handout: Handout, file: File | null) => {
    await saveHandout(scope, { ...handout, gmUserId }, file)
    selection.revealFolders(folderAncestors(handout.folderId, selection.folders))
    selection.setSelectedId(handout.id); setEditing(null)
  }
  const saveFolder = async (folder: HandoutFolder) => {
    await saveHandoutFolder(scope, folder)
    selection.revealFolders([folder.id, ...folderAncestors(folder.parentId, selection.folders)])
    selection.chooseFolder(folder.id); setEditingFolder(null)
  }
  const remove = (handout: Handout) => run(async () => {
    await deleteHandout(scope, handout)
    setDeleting(null); selection.setSelectedId('')
  })
  const removeFolder = () => run(async () => {
    await deleteHandoutFolder(scope, selection.folderId)
    selection.setFolderId('')
  })
  const addFolder = () => setEditingFolder({ id: crypto.randomUUID(), name: '', parentId: selection.destinationFolderId })
  const addHandout = () => setEditing(emptyHandout(selection.destinationFolderId, gmUserId))
  return { editing, setEditing, editingFolder, setEditingFolder, deleting, setDeleting, busy, save, saveFolder, remove, removeFolder, addFolder, addHandout }
}

type Actions = ReturnType<typeof useHandoutActions>
function HandoutDialogs({ data, actions }: { data: HandoutData; actions: Actions }) {
  const { editing, editingFolder, deleting } = actions
  return <>
    {editing ? <HandoutEditor handout={editing} folders={data.folders} characters={data.characters} onSave={actions.save} onClose={() => actions.setEditing(null)} /> : null}
    {editingFolder ? <HandoutFolderEditor folder={editingFolder} folders={data.folders} onClose={() => actions.setEditingFolder(null)} onSave={actions.saveFolder} /> : null}
    {deleting ? <HandoutDeleteDialog handout={deleting} busy={actions.busy} error={data.error} onClose={() => actions.setDeleting(null)} onDelete={() => void actions.remove(deleting)} /> : null}
  </>
}

export function HandoutsTab({ groupId, campaignId, gmUserId, userId, role }: Props) {
  const scope = { groupId, campaignId }
  const isGm = role === 'gm'
  const data = useHandouts(scope, isGm, userId)
  const selection = useHandoutSelection(data, isGm)
  const actions = useHandoutActions(scope, gmUserId, selection, data.setError)
  const { selected, currentFolder } = selection
  return <div className="maps-layout handouts-layout">
    <HandoutSidebar isGm={isGm} flat={selection.flat} folders={selection.folders} handouts={data.handouts} loading={data.loading} folderId={selection.folderId} selectedId={selection.selectedId}
      expandedFolderIds={selection.expandedFolderIds} onFlat={selection.setFlat} onSelect={selection.setSelectedId} onFolder={selection.clickFolder} onAddFolder={actions.addFolder} onAddHandout={actions.addHandout} />
    <section className="handout-detail" aria-label="Handout details">
      {data.error ? <p className="error" role="alert">{data.error}</p> : null}
      {selected
        ? <HandoutDetail handout={selected} folders={selection.folders} isGm={isGm} onEdit={() => actions.setEditing(selected)} onDelete={() => actions.setDeleting(selected)} />
        : <HandoutFolderDetail folder={currentFolder} isGm={isGm} empty={selection.folderEmpty} busy={actions.busy} onEdit={() => { if (currentFolder) actions.setEditingFolder(currentFolder) }} onDelete={() => void actions.removeFolder()} />}
    </section>
    <HandoutDialogs data={data} actions={actions} />
  </div>
}
