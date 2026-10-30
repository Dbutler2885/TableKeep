import type { KeyboardEvent, ReactNode } from 'react'
import { makeId } from '../../character/characterFactories'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecLoadInto } from '../../ruleSets/lubec/gear/loading'
import { lubecCardSheet, type LubecCardSheet, type LubecItemSheetState } from './itemSheet'
import { lubecLoadIntoAct, lubecReloadAct, lubecReloadAndFireAct, lubecLoadContext, type LubecLoadContext, type LubecLoadResult } from './loadActs'
import { lubecEmptyText, lubecEmptyTitle, lubecPickRow, lubecPickText } from './loadLabels'

/** The id of a prompt's title, which names its dialog over the item sheet. */
const PROMPT_TITLE = 'lubec-gear-prompt-title'

/** One of a prompt's buttons: its label, the line under it, its look, and what it does. */
export type PromptButton = { label: string; sub?: string; cls?: string; disabled?: boolean; onPress: () => void }

type PromptProps = {
  eyebrow: ReactNode
  title: string
  text: string
  error: string | null
  buttons: readonly PromptButton[]
  /** One button a row, for picking one of several things. */
  list?: boolean
  onClose: () => void
}

const actionsClass = (list: boolean, n: number) => {
  if (list) return 'actions list'
  return n === 3 ? 'actions three' : 'actions'
}

/** B's prompt (B 1625-1635), in the sheet's overlay: an eyebrow, a title, a line of text, a refusal, and its buttons. */
export function LubecPrompt({ eyebrow, title, text, error, buttons, list = false, onClose }: PromptProps) {
  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
  return (
    <div className="confirm-overlay lubec-gear-overlay" role="dialog" aria-modal="true" aria-labelledby={PROMPT_TITLE} onKeyDown={closeOnEscape}>
      <div className="prompt-sheet">
        <div className="sheet-form">
          <header>
            <div><div className="eyebrow">{eyebrow}</div><h2 id={PROMPT_TITLE}>{title}</h2></div>
            <button className="close" type="button" aria-label="Close" onClick={onClose}>×</button>
          </header>
          <p className="note prompt-text">{text}</p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className={actionsClass(list, buttons.length)}>
            {buttons.map((b) => (
              <button key={b.label} type="button" className={`btn${b.cls ? ` ${b.cls}` : ''}`} disabled={b.disabled} onClick={b.onPress}>
                {b.label}{b.sub ? <small>{b.sub}</small> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

type CardPromptProps = {
  gear: LubecGear
  sheet: LubecCardSheet
  onGearChange: (gear: LubecGear) => void
  onSheet: (sheet: LubecItemSheetState | null) => void
  toast: (text: string) => void
}

type Answer = CardPromptProps & { item: LubecItem; ctx: LubecLoadContext }

const loadContext = (gear: LubecGear): LubecLoadContext => lubecLoadContext(gear, makeId)

// A refusal stays on the prompt; otherwise one commit, the prompt closes, and the card shows what B's shows.
function answered(p: Answer, r: LubecLoadResult) {
  if (!r.ok) return p.onSheet({ ...p.sheet, prompt: { kind: p.sheet.prompt?.kind ?? 'empty', error: r.msg } })
  p.onGearChange(r.gear)
  p.onSheet(lubecCardSheet(r.show))
  if (r.toast) p.toast(r.toast)
}

const closePrompt = (p: CardPromptProps) => () => p.onSheet({ ...p.sheet, prompt: null })

/**
 * The empty-weapon prompt (B's emptyPrompt, Rule L9): only the player sees it. Cancel, Reload, and the red
 * Reload and fire, which needs special dispensation from the table. There is no popup for the GM to approve, now or ever.
 */
function EmptyPrompt(p: Answer) {
  const { item: w, ctx } = p
  const buttons: PromptButton[] = [
    { label: 'Cancel', cls: 'line', onPress: closePrompt(p) },
    { label: 'Reload', onPress: () => answered(p, lubecReloadAct(ctx, w)) },
    { label: 'Reload & fire', cls: 'dispensation', sub: 'Requires special dispensation', onPress: () => answered(p, lubecReloadAndFireAct(ctx, w)) },
  ]
  return (
    <LubecPrompt
      eyebrow={<span className="prompt-who">Only you see this</span>} title={lubecEmptyTitle(w)} text={lubecEmptyText(ctx.gear, w, ctx.supplyName)}
      error={p.sheet.prompt?.error ?? null} buttons={buttons} onClose={closePrompt(p)}
    />
  )
}

/** Rule L5's picker: which of the things on you that take this supply to load, each with its cost, or greyed out with the reason. */
function LoadPicker(p: Answer) {
  const { item: src, ctx } = p
  const words = { gear: ctx.gear, supplyName: ctx.supplyName }
  const buttons: PromptButton[] = [
    ...lubecLoadInto(ctx.gear, src).map((x) => ({ label: x.name, cls: 'piece', ...lubecPickRow(words, src, x), onPress: () => answered(p, lubecLoadIntoAct(ctx, src, x)) })),
    { label: 'Cancel', cls: 'line', onPress: closePrompt(p) },
  ]
  return (
    <LubecPrompt
      eyebrow={`Load from ${src.name}`} title="Load which?" text={lubecPickText(words, src)} error={p.sheet.prompt?.error ?? null}
      buttons={buttons} list onClose={closePrompt(p)}
    />
  )
}

/** The prompt over the card, while one is open for an item still on the sheet. */
export function LubecCardPrompt(props: CardPromptProps) {
  const item = props.gear.items.find((x) => x.id === props.sheet.itemId)
  if (!props.sheet.prompt || !item) return null
  const p = { ...props, item, ctx: loadContext(props.gear) }
  return props.sheet.prompt.kind === 'empty' ? <EmptyPrompt {...p} /> : <LoadPicker {...p} />
}
