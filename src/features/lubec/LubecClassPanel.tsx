import { lubecClass } from '../ruleSets/lubec/classes'
import type { LubecSheet } from '../ruleSets/lubec/sheet'

/** The class's Trauma Response and any class rule, as a reminder in play; nothing while the class is a hole. */
export function LubecClassPanel({ sheet }: { sheet: LubecSheet }) {
  const definition = lubecClass(sheet.class.key)
  if (!definition) return null
  return (
    <section className="lubec-panel blue" aria-labelledby="lubec-panel-class">
      <div className="lubec-section-head"><h3 id="lubec-panel-class">Class</h3></div>
      <dl className="lubec-class-rules">
        <dt>Trauma Response</dt>
        <dd><strong>{definition.traumaResponse.name}.</strong> {definition.traumaResponse.text}</dd>
        {definition.classRule ? (
          <>
            <dt>Class rule</dt>
            <dd>{definition.classRule}</dd>
          </>
        ) : null}
      </dl>
    </section>
  )
}
