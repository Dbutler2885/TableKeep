import { useEffect, useRef, useState } from 'react'

type BlurSyncedTextareaProps = {
  value: string
  disabled?: boolean
  className?: string
  rows?: number
  placeholder?: string
  onCommit: (value: string) => void
}

export function BlurSyncedTextarea({
  value,
  disabled = false,
  className,
  rows,
  placeholder,
  onCommit,
}: BlurSyncedTextareaProps) {
  const [draft, setDraft] = useState(value)
  const focusedRef = useRef(false)
  const draftRef = useRef(draft)
  const valueRef = useRef(value)
  const onCommitRef = useRef(onCommit)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  draftRef.current = draft
  valueRef.current = value
  onCommitRef.current = onCommit

  useEffect(() => {
    if (focusedRef.current) return
    setDraft(value)
  }, [value])

  // Debounced commit while typing — flush after 800ms of inactivity
  const scheduleDebouncedCommit = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (draftRef.current !== valueRef.current) {
        onCommitRef.current(draftRef.current)
      }
    }, 800)
  }

  // Flush pending debounce on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        if (draftRef.current !== valueRef.current) {
          onCommitRef.current(draftRef.current)
        }
      }
    }
  }, [])

  return (
    <textarea
      className={className}
      value={draft}
      rows={rows}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => {
        setDraft(event.target.value)
        scheduleDebouncedCommit()
      }}
      onFocus={() => {
        focusedRef.current = true
      }}
      onBlur={() => {
        focusedRef.current = false
        if (timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }
        if (draft !== value) onCommit(draft)
      }}
    />
  )
}
