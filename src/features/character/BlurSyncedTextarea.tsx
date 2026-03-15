import { useEffect, useState } from 'react'

type BlurSyncedTextareaProps = {
  value: string
  disabled?: boolean
  className?: string
  rows?: number
  onCommit: (value: string) => void
}

export function BlurSyncedTextarea({
  value,
  disabled = false,
  className,
  rows,
  onCommit,
}: BlurSyncedTextareaProps) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  return (
    <textarea
      className={className}
      value={draft}
      rows={rows}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft)
      }}
    />
  )
}
