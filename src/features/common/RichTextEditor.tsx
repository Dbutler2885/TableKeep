import { useEffect, useRef } from 'react'
import { Bold, Italic, List } from 'lucide-react'
import { sanitizeRichText } from './richText'

type RichTextEditorProps = {
  value: string
  onChange: (value: string) => void
  onBlur?: (value: string) => void
  placeholder?: string
  editable?: boolean
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  editable = true,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = editorRef.current
    if (!element) return
    if (document.activeElement === element) return
    const sanitized = sanitizeRichText(value)
    if (element.innerHTML !== sanitized) {
      element.innerHTML = sanitized
    }
  }, [value])

  const syncValue = () => {
    const element = editorRef.current
    if (!element) return ''
    const sanitized = sanitizeRichText(element.innerHTML)
    onChange(sanitized)
    return sanitized
  }

  const applyCommand = (command: 'bold' | 'italic' | 'insertUnorderedList') => {
    if (!editable) return
    editorRef.current?.focus()
    document.execCommand(command)
    syncValue()
  }

  if (!editable) {
    return (
      <div
        className="npc-richtext-preview"
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(value) }}
      />
    )
  }

  return (
    <div className="npc-richtext-shell">
      <div className="npc-notes-toolbar">
        <button type="button" className="map-edit-btn" onClick={() => applyCommand('bold')} aria-label="Bold">
          <Bold size={14} />
        </button>
        <button type="button" className="map-edit-btn" onClick={() => applyCommand('italic')} aria-label="Italic">
          <Italic size={14} />
        </button>
        <button type="button" className="map-edit-btn" onClick={() => applyCommand('insertUnorderedList')} aria-label="Bullet list">
          <List size={14} />
        </button>
      </div>
      <div
        ref={editorRef}
        className="npc-richtext-editor"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder ?? ''}
        onInput={syncValue}
        onBlur={() => {
          const sanitized = syncValue()
          onBlur?.(sanitized)
        }}
      />
    </div>
  )
}
