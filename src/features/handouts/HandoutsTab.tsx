import { useState } from 'react'
import type { Role } from '../../types/app'
import { emptyHandout, visibleFolders, type Handout, type HandoutFolder } from './handoutModel'
import { deleteHandout, deleteHandoutFolder, saveHandout, saveHandoutFolder, useHandouts } from './useHandouts'
import { HandoutEditor } from './HandoutEditor'
import { HandoutFolderEditor } from './HandoutFolderEditor'
import { HandoutSidebar, HandoutDetail, HandoutFolderDetail, HandoutDeleteDialog } from './HandoutPanels'
import './handouts.css'

type Props = { groupId: string; campaignId: string; gmUserId: string; userId: string; role: Role | null }

export function HandoutsTab({ groupId, campaignId, gmUserId, userId, role }: Props) {
  const scope = { groupId, campaignId }
  const isGm = role === 'gm'
  const data = useHandouts(scope, isGm, userId)
  const [flat, setFlat] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [folderId, setFolderId] = useState('')
  const [editing, setEditing] = useState<Handout | null>(null)
  const [editingFolder, setEditingFolder] = useState<HandoutFolder | null>(null)
  const [deleting, setDeleting] = useState<Handout | null>(null)
  const [busy, setBusy] = useState(false)
  const selected = data.handouts.find((handout) => handout.id === selectedId)
  const folders = isGm ? data.folders : visibleFolders(data.folders, data.handouts)
  const currentFolder = folders.find((folder) => folder.id === folderId)
  const folderEmpty = !data.handouts.some((handout) => handout.folderId === folderId) && !data.folders.some((folder) => folder.parentId === folderId)
  const run = async (action: () => Promise<void>) => {
    setBusy(true); data.setError('')
    try { await action() } catch (reason) { data.setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  const chooseFolder = (id: string) => { setFolderId(id); setSelectedId('') }
  const save = async (handout: Handout, file: File | null) => {
    await saveHandout(scope, { ...handout, gmUserId }, file)
    setSelectedId(handout.id); setEditing(null)
  }
  return <div className="maps-layout handouts-layout">
    <HandoutSidebar isGm={isGm} flat={flat} folders={folders} handouts={data.handouts} loading={data.loading} folderId={folderId} selectedId={selectedId}
      onFlat={setFlat} onSelect={setSelectedId} onFolder={chooseFolder}
      onAddFolder={() => setEditingFolder({ id: crypto.randomUUID(), name: '', parentId: currentFolder?.id ?? '' })}
      onAddHandout={() => setEditing(emptyHandout(currentFolder?.id ?? '', gmUserId))} />
    <section className="handout-detail" aria-label="Handout details">
      {data.error ? <p className="error" role="alert">{data.error}</p> : null}
      {selected
        ? <HandoutDetail handout={selected} folders={folders} isGm={isGm} onEdit={() => setEditing(selected)} onDelete={() => setDeleting(selected)} />
        : <HandoutFolderDetail folder={currentFolder} isGm={isGm} empty={folderEmpty} busy={busy} onEdit={() => { if (currentFolder) setEditingFolder(currentFolder) }}
          onDelete={() => void run(async () => { await deleteHandoutFolder(scope, folderId); setFolderId('') })} />}
    </section>
    {editing ? <HandoutEditor handout={editing} folders={data.folders} characters={data.characters} onSave={save} onClose={() => setEditing(null)} /> : null}
    {editingFolder ? <HandoutFolderEditor folder={editingFolder} folders={data.folders} onClose={() => setEditingFolder(null)} onSave={async (folder) => { await saveHandoutFolder(scope, folder); setFolderId(folder.id); setSelectedId(''); setEditingFolder(null) }} /> : null}
    {deleting ? <HandoutDeleteDialog handout={deleting} busy={busy} error={data.error} onClose={() => setDeleting(null)}
      onDelete={() => void run(async () => { await deleteHandout(scope, deleting); setDeleting(null); setSelectedId('') })} /> : null}
  </div>
}
