import { FileText, Folder, FolderOpen } from 'lucide-react'
import { folderLabel, type Handout, type HandoutFolder } from './handoutModel'

type Props = {
  folders: HandoutFolder[]; handouts: Handout[]; flat: boolean; folderId: string; selectedId: string
  onSelect: (id: string) => void; onFolder: (id: string) => void
}

export function HandoutLibrary(props: Props) {
  const rows = [...props.handouts].sort((a, b) => a.title.localeCompare(b.title))
  return <div className="handout-library">
    {props.flat ? rows.map((handout) => <HandoutRow key={handout.id} {...props} handout={handout} showFolder />)
      : <FolderBranch {...props} parentId="" visited={[]} />}
  </div>
}

function FolderBranch(props: Props & { parentId: string; visited: string[] }) {
  const children = props.folders.filter((folder) => folder.parentId === props.parentId).sort((a, b) => a.name.localeCompare(b.name))
  const handouts = props.handouts.filter((handout) => handout.folderId === props.parentId).sort((a, b) => a.title.localeCompare(b.title))
  return <>
    {children.filter((folder) => !props.visited.includes(folder.id)).map((folder) => <details key={folder.id} open className="handout-folder">
      <summary><button type="button" className={props.folderId === folder.id ? 'handout-folder-button active' : 'handout-folder-button'} onClick={() => props.onFolder(folder.id)}>
        {props.folderId === folder.id ? <FolderOpen size={16} /> : <Folder size={16} />} {folder.name}
      </button></summary>
      <div className="handout-folder-children"><FolderBranch {...props} parentId={folder.id} visited={[...props.visited, folder.id]} /></div>
    </details>)}
    {handouts.map((handout) => <HandoutRow key={handout.id} {...props} handout={handout} />)}
  </>
}

function HandoutRow({ handout, selectedId, onSelect, folders, showFolder }: Props & { handout: Handout; showFolder?: boolean }) {
  return <button type="button" className={selectedId === handout.id ? 'handout-row active' : 'handout-row'} onClick={() => onSelect(handout.id)}>
    <FileText size={16} /><span><strong>{handout.title}</strong>{handout.description ? <span className="handout-row-description">{handout.description}</span> : null}{showFolder ? <small>{folderLabel(handout.folderId, folders)}</small> : null}</span>
  </button>
}
