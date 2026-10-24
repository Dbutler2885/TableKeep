// A hole: a value nobody has given yet. It is shown as marked missing, never as 0.
export function LubecMissing() {
  return <span className="lubec-missing">missing</span>
}

/** A number from the sheet, or the missing mark for a hole. */
export function LubecNumber({ value }: { value: number | null }) {
  return value === null ? <LubecMissing /> : <>{value}</>
}
