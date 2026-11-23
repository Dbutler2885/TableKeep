import { lubecClass } from '../ruleSets/lubec/classes'
import type { LubecSheet } from '../ruleSets/lubec/sheet'

/**
 * The prototype's class record: the class's name over its description, its
 * Trauma Response and its Class Rule when it has one;
 * nothing while the class is a hole.
 */
export function LubecClassRecord({ sheet }: { sheet: LubecSheet }) {
  const definition = lubecClass(sheet.class.key)
  if (!definition) return null
  return (
    <section className="class-section" aria-labelledby="lubec-class-title">
      <div className="section-bar"><h3 id="lubec-class-title">{definition.name}</h3></div>
      <article className="class-record">
        <p className="selected-class-description">{definition.description}</p>
        <div className="class-effects">
          <div className="trauma-response">
            <span>Trauma Response</span>
            <strong>{definition.traumaResponse.name}</strong>
            <p>{definition.traumaResponse.text}</p>
          </div>
          {definition.classRule ? (
            <div className="selected-class-rule"><span>Class Rule</span><p>{definition.classRule}</p></div>
          ) : null}
        </div>
      </article>
    </section>
  )
}
