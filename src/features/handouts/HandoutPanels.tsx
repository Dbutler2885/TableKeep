import { FolderPlus, Plus } from 'lucide-react'
import { folderLabel, type Handout, type HandoutFolder } from './handoutModel'
import { HandoutLibrary } from './HandoutLibrary'
import { HandoutViewer } from './HandoutViewer'

type SidebarProps = {
  isGm: boolean; flat: boolean; folders: HandoutFolder[]; handouts: Handout[]; loading: boolean
  folderId: string; selectedId: string; expandedFolderIds: string[]; onFlat: (value: boolean) => void; onSelect: (id: string) => void
  onFolder: (id: string) => void; onAddFolder: () => void; onAddHandout: () => void
}
export function HandoutSidebar(props: SidebarProps) {
  return <aside className="maps-sidebar monsters-sidebar handouts-sidebar">
    <div className="maps-sidebar-header"><h2>Handouts</h2>{props.isGm ? <div className="handout-actions">
      <button type="button" aria-label="Add folder" title="Add folder" onClick={props.onAddFolder}><FolderPlus size={17} /></button>
      <button type="button" aria-label="Add handout" title="Add handout" onClick={props.onAddHandout}><Plus size={17} /></button>
    </div> : null}</div>
    <HandoutViewToggle flat={props.flat} onFlat={props.onFlat} />
    {!props.flat ? <button type="button" className="handout-root" onClick={() => props.onFolder('')}>Handouts /</button> : null}
    <HandoutLibrary {...props} />
    <HandoutLibraryStatus loading={props.loading} empty={!props.handouts.length} isGm={props.isGm} />
  </aside>
}

function HandoutViewToggle({ flat, onFlat }: Pick<SidebarProps, 'flat' | 'onFlat'>) {
  return <div className="table-mode-toggle" role="group" aria-label="Handout view">
    <button className={flat ? 'table-mode-btn' : 'table-mode-btn active'} type="button" aria-pressed={!flat} onClick={() => onFlat(false)}>Folders</button>
    <button className={flat ? 'table-mode-btn active' : 'table-mode-btn'} type="button" aria-pressed={flat} onClick={() => onFlat(true)}>All handouts</button>
  </div>
}

function HandoutLibraryStatus({ loading, empty, isGm }: { loading: boolean; empty: boolean; isGm: boolean }) {
  if (loading) return <p role="status" className="handout-empty">Loading handouts...</p>
  if (!empty) return null
  return <p className="handout-empty">{isGm ? 'Add a handout to share a clue, document, or image.' : 'No handouts have been revealed to you yet.'}</p>
}

export function HandoutDetail({ handout, folders, isGm, onEdit, onDelete }: {
  handout: Handout; folders: HandoutFolder[]; isGm: boolean; onEdit: () => void; onDelete: () => void
}) {
  return <>
    <header className="handout-detail-header"><div><p className="handout-breadcrumb">{folderLabel(handout.folderId, folders)}</p><h2>{handout.title}</h2>
      {handout.description ? <p className="handout-description">{handout.description}</p> : null}
      {isGm ? <p className="handout-visibility">{visibilityLabel(handout)}</p> : null}</div>
      {isGm ? <div className="handout-actions"><button type="button" onClick={onEdit}>Edit handout</button><button type="button" onClick={onDelete}>Delete</button></div> : null}
    </header><HandoutViewer key={handout.id} handout={handout} />
  </>
}

export function HandoutFolderDetail({ folder, isGm, empty, busy, onEdit, onDelete }: {
  folder: HandoutFolder | undefined; isGm: boolean; empty: boolean; busy: boolean; onEdit: () => void; onDelete: () => void
}) {
  return <div className="handout-welcome"><h2>{folder?.name ?? 'Handouts'}</h2><p>Choose a handout to read it.</p>
    {isGm && folder ? <div className="handout-actions"><button type="button" onClick={onEdit}>Rename or move folder</button>
      <button type="button" disabled={!empty || busy} title={empty ? 'Delete folder' : 'Move or delete its contents first'} onClick={onDelete}>Delete empty folder</button></div> : null}
  </div>
}

export function HandoutDeleteDialog({ handout, busy, error, onClose, onDelete }: { handout: Handout; busy: boolean; error: string; onClose: () => void; onDelete: () => void }) {
  return <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="handout-delete-title"><div className="confirm-modal"><h3 id="handout-delete-title">Delete {handout.title}?</h3><p>This removes the handout and its uploaded file.</p>{error ? <p role="alert" className="error">{error}</p> : null}
    <div className="confirm-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" disabled={busy} onClick={onDelete}>{busy ? 'Deleting...' : 'Delete handout'}</button></div>
  </div></div>
}

function visibilityLabel(handout: Handout) {
  if (handout.visibility === 'all') return 'Revealed to all players'
  if (handout.visibility === 'some') return `Revealed to ${handout.characterIds.length} chosen character(s)`
  return 'Hidden from players'
}
