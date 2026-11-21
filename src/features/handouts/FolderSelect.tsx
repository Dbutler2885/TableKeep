import { folderLabel, type HandoutFolder } from './handoutModel'

type Props = { value: string; onChange: (value: string) => void; folders: HandoutFolder[] }
export function FolderSelect({ value, onChange, folders }: Props) {
  return <label>Folder<select value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">Handouts (top level)</option>
    {folders.map((folder) => <option key={folder.id} value={folder.id}>{folderLabel(folder.id, folders)}</option>)}
  </select></label>
}
