// @vitest-environment jsdom
/**
 * The item sheet over the Gear page: the card, small stuff, the add and edit
 * form for every kind with its stock suggestions and picker, and the form's
 * pages on a phone. The page holds its gear in plain state here; saving
 * through the shared store is `LubecGearTab.test.tsx`'s.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { emptyLubecGear, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecStockItem } from '../../ruleSets/lubec/gear/stock'
import { LubecGearPage } from './LubecGearPage'

const T = (id: string, extra: Partial<LubecItem> = {}): LubecItem =>
  ({ id, kind: 'thing', name: id, note: '', size: 1, weight: 'normal', qty: 1, carrier: 'backpack', pocket: 0, ...extra })

let latest: LubecGear = emptyLubecGear()

function Page({ initial, campaignStock }: { initial: LubecGear; campaignStock?: LubecStockItem[] }) {
  const [gear, setGear] = useState(initial)
  const change = (next: LubecGear) => {
    latest = next
    setGear(next)
  }
  return <LubecGearPage gear={gear} onGearChange={change} campaignStock={campaignStock} />
}

function mount(...items: LubecItem[]) {
  latest = { ...emptyLubecGear(), items }
  return render(<Page initial={latest} />)
}

const dialog = (name: string) => within(screen.getByRole('dialog', { name }))
const status = () => screen.getByRole('status').textContent
const field = (form: ReturnType<typeof dialog>, role: string, name: string) => form.getByRole(role, { name }) as HTMLInputElement

function setPhone(phone: boolean) {
  window.matchMedia = ((query: string) => ({ matches: phone && query.includes('59.99rem'), addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia
}

beforeEach(() => setPhone(false))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the item card', () => {
  it('shows the picture beside the description, the facts, where it came from, and Edit', () => {
    mount(T('rope', { name: 'Coil of rope', note: 'Fifty feet of manila.', art: 'rope', shape: 'square', stock: 'Coil of rope' }))
    fireEvent.click(screen.getByRole('button', { name: /^Coil of rope/ }))
    const card = dialog('Coil of rope')
    expect(card.getByText('Thing / Backpack, main pocket')).toBeTruthy()
    expect(card.getByRole('img', { name: 'Coil of rope' }).querySelector('svg.lubec-art')).not.toBeNull()
    expect(card.getByText('Fifty feet of manila.')).toBeTruthy()
    expect([...document.querySelectorAll('.item-facts dt')].map((dt) => dt.textContent)).toEqual(['Size', 'Weight', 'Where'])
    expect(document.querySelector('.stock-row')?.textContent).toBe('From stock: Coil of rope.')
    fireEvent.click(card.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says when there is no description or picture, and that a thing was made by hand', () => {
    mount(T('rag', { kind: 'armor', locs: ['head'] }))
    fireEvent.click(screen.getByRole('button', { name: /^rag/ }))
    expect(screen.getByText('No description yet. Tap Edit to add one.').className).toBe('item-note empty')
    expect(document.querySelector('.card-pic.none')?.textContent).toBe('No picture')
    expect(document.querySelector('.stock-row')?.textContent).toBe('Made by hand.')
  })

  it('refuses + on a full stack, and closes when the item is no longer there', () => {
    mount(T('cells', { kind: 'consumable', name: 'D batteries', qty: 4, per: 4, fits: 'dcell' }))
    fireEvent.click(screen.getByRole('button', { name: /^D batteries/ }))
    const card = dialog('D batteries')
    expect(card.queryByRole('button', { name: 'Use one' })).toBeNull()
    fireEvent.click(card.getByRole('button', { name: 'One more' }))
    expect(card.getByRole('alert').textContent).toBe('This stack is full: 4 fit in one slot. Add another stack for more.')
    fireEvent.click(card.getByRole('button', { name: 'One fewer' }))
    expect(card.queryByRole('alert')).toBeNull()
    expect(card.getByText('3')).toBeTruthy()
    for (let n = 0; n < 3; n++) fireEvent.click(card.getByRole('button', { name: 'One fewer' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(status()).toBe('D batteries: used up.')
    expect(latest.items).toEqual([])
  })

  it('steps a holder up to full and keeps it there', () => {
    mount(T('jug', { kind: 'holder', hold: 'fill', takes: 'water', capacity: 2, loaded: 1 }))
    fireEvent.click(screen.getByRole('button', { name: /^jug/ }))
    const card = dialog('jug')
    fireEvent.click(card.getByRole('button', { name: 'One more' }))
    fireEvent.click(card.getByRole('button', { name: 'One more' }))
    expect(card.getByText('2 of 2')).toBeTruthy()
    expect(latest.items[0].loaded).toBe(2)
  })

  it('edits an item, returning to its card with B\'s toast; Back returns without saving', () => {
    mount(T('rope', { carrier: 'hands', slot: 1, pocket: undefined }))
    fireEvent.click(screen.getByRole('button', { name: /^Right handrope/ }))
    fireEvent.click(dialog('rope').getByRole('button', { name: 'Edit' }))
    let form = dialog('rope')
    expect(form.getByText('Edit item')).toBeTruthy()
    expect(form.queryByRole('button', { name: 'Browse stock' })).toBeNull()
    expect(field(form, 'combobox', 'Name').getAttribute('aria-expanded')).toBe('false')
    fireEvent.change(field(form, 'combobox', 'Name'), { target: { value: 'flash' } })
    expect(form.queryByRole('listbox')).toBeNull()
    fireEvent.click(form.getByRole('button', { name: 'Back' }))
    expect(dialog('rope').getByRole('button', { name: 'Edit' })).toBeTruthy()

    fireEvent.click(dialog('rope').getByRole('button', { name: 'Edit' }))
    form = dialog('rope')
    fireEvent.change(field(form, 'combobox', 'Name'), { target: { value: 'Long rope' } })
    fireEvent.change(form.getByRole('combobox', { name: 'Put it' }), { target: { value: 'body' } })
    expect(document.querySelector('.cost')?.textContent).toBe('From a hand to the body: 1 action.')
    fireEvent.click(form.getByRole('button', { name: 'Save' }))
    expect(status()).toBe('Saved Long rope.')
    expect(dialog('Long rope').getByText('Thing / Body slot')).toBeTruthy()
    expect(latest.items[0]).toMatchObject({ id: 'rope', name: 'Long rope', carrier: 'body', slot: 0 })
  })
})

describe('small stuff', () => {
  it('lists the small things, each opening its card, and says when there are none', () => {
    mount(T('key', { name: 'House key', size: 0, pocket: null }), T('marbles', { name: 'Marbles', size: 0, pocket: null, qty: 12, weight: 'heavy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Small stuff: House key, Marbles ×12' }))
    const list = dialog('Small stuff')
    expect(list.getByText('Things too small to count. In a bag they take no slot, however many there are. Held or on the body, a small thing takes that slot.')).toBeTruthy()
    expect(list.getAllByRole('button').map((b) => b.textContent)).toEqual(['×', 'House key', 'Marbles ×12Heavy', '+ Add a small thing'])
    fireEvent.click(list.getByRole('button', { name: 'Marbles ×12Heavy' }))
    expect(dialog('Marbles ×12').getByText('Thing / Backpack, small stuff')).toBeTruthy()
    cleanup()

    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Small stuff: empty' }))
    expect(dialog('Small stuff').getByText('Nothing yet.')).toBeTruthy()
    fireEvent.click(dialog('Small stuff').getByRole('button', { name: '+ Add a small thing' }))
    fireEvent.click(dialog('Add an item').getByRole('button', { name: 'Back' }))
    expect(dialog('Small stuff')).toBeTruthy()
  })
})

const openAdd = () => {
  fireEvent.click(screen.getByRole('button', { name: '+ Add an item' }))
  return dialog('Add an item')
}

describe('the add form\'s kinds', () => {
  it('offers the five kinds as tiles, a Thing with no page of its own', () => {
    mount()
    const form = openAdd()
    expect(form.getAllByRole('radio').slice(0, 5).map((r) => (r.closest('label') as HTMLElement).textContent)).toEqual([
      'ThingClothes, keys, a map. Bookkeeping.', 'WeaponMelee or firearm, with Impact and a table.', 'ArmorWorn. Covers parts and stops wounds.',
      'ConsumableCounts down, like food. Loose rounds too.', 'HolderLoaded or filled, and stays when empty.',
    ])
    expect(document.querySelector('.kind-block')).toBeNull()
    expect(form.getByText('1 slot: normal.')).toBeTruthy()
    expect(form.getByText('One stack: 1 slot.')).toBeTruthy()
    expect(form.getByText('Normal: no effect.')).toBeTruthy()
    fireEvent.click(field(form, 'radio', 'Extra heavy'))
    expect(form.getByText("Extra heavy: takes both hands to hold. Roll Strength. Pass: Speed −20, always. Fail: you can't carry it.")).toBeTruthy()
    fireEvent.change(form.getByRole('combobox', { name: 'Put it' }), { target: { value: 'backpack#small' } })
    expect(field(form, 'radio', 'Small').checked).toBe(true)
    expect(form.queryByRole('spinbutton', { name: 'Fit in one slot' })).toBeNull()
    fireEvent.click(form.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('adds a melee weapon, then a firearm that needs its ammo picked', () => {
    mount()
    let form = openAdd()
    fireEvent.click(field(form, 'radio', /^Weapon/ as never))
    fireEvent.change(field(form, 'combobox', 'Name'), { target: { value: 'Hockey stick' } })
    fireEvent.click(field(form, 'radio', 'Shortlike a knife; works in a grapple'))
    fireEvent.click(field(form, 'checkbox', 'Blunt'))
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))
    expect(form.getByRole('alert').textContent).toBe('Pick at least one way it wounds: cut, pierce, blunt or gun.')
    fireEvent.click(field(form, 'checkbox', 'Cut'))
    fireEvent.change(field(form, 'spinbutton', 'Base Impact'), { target: { value: '2' } })
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))
    expect(latest.items[0]).toMatchObject({ kind: 'weapon', name: 'Hockey stick', mode: 'melee', impact: 2, reach: 'short', wounds: ['cut'], table: 'blunt' })

    form = openAdd()
    fireEvent.click(field(form, 'radio', /^Weapon/ as never))
    fireEvent.click(field(form, 'radio', 'Firearmno Strength, takes rounds'))
    fireEvent.change(field(form, 'combobox', 'Name'), { target: { value: 'Pistol' } })
    fireEvent.change(field(form, 'spinbutton', 'Holds'), { target: { value: '8' } })
    fireEvent.change(field(form, 'spinbutton', 'Loaded'), { target: { value: '3' } })
    fireEvent.change(form.getByRole('combobox', { name: 'Results table' }), { target: { value: 'none' } })
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))
    expect(form.getByRole('alert').textContent).toBe("Pick the ammo it takes. If it isn't on the list, make a supply.")
    fireEvent.change(form.getByRole('combobox', { name: 'Takes' }), { target: { value: 'a22' } })
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))
    expect(latest.items[1]).toMatchObject({ mode: 'firearm', capacity: 8, loaded: 3, takes: 'a22', wounds: ['gun'], table: 'none' })
    expect(screen.getByRole('button', { name: /Pistol3 of 8 loaded/ })).toBeTruthy()
  })

  it('makes armor on the body drawing, with both sides at once, clear and exclusive', () => {
    mount()
    const form = openAdd()
    fireEvent.click(field(form, 'radio', /^Armor/ as never))
    expect(form.queryByRole('spinbutton', { name: 'How many in all' })).toBeNull()
    fireEvent.change(field(form, 'combobox', 'Name'), { target: { value: 'Mittens' } })
    fireEvent.change(field(form, 'spinbutton', 'Cutting'), { target: { value: '1' } })
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))
    expect(form.getByRole('alert').textContent).toBe('Pick at least one place it covers.')
    expect(form.getByText('Nothing picked yet. Tap the body.')).toBeTruthy()

    fireEvent.click(field(form, 'checkbox', 'Both sides at onceA tap on an arm, hand, leg or foot picks the pair.'))
    fireEvent.click(form.getByRole('checkbox', { name: /^Right hand: 0 of 2 layers/ }))
    expect(document.querySelector('p.picked')?.textContent).toBe('Covers Hands.')
    expect(form.getByRole('checkbox', { name: /^Left hand: 0 of 2 layers, picked/ })).toBeTruthy()
    fireEvent.click(form.getByRole('button', { name: 'Clear' }))
    expect(form.queryByRole('button', { name: 'Clear' })).toBeNull()

    const head = form.getByRole('checkbox', { name: /^Head/ })
    fireEvent.mouseOver(head)
    expect(document.querySelectorAll('.body-map .hl.on')).toHaveLength(1)
    fireEvent.mouseLeave(document.querySelector('.body-map') as Element)
    expect(document.querySelectorAll('.body-map .hl.on')).toHaveLength(0)
    fireEvent.keyDown(head, { key: 'Tab' })
    expect(document.querySelector('p.picked')?.textContent).toBe('Nothing picked yet. Tap the body.')
    fireEvent.keyDown(head, { key: 'Enter' })
    fireEvent.keyDown(form.getByRole('checkbox', { name: /^Neck/ }), { key: ' ' })
    fireEvent.click(field(form, 'checkbox', 'ExclusiveTakes every layer where it covers, like a snowmobile suit. Ordinary armor takes one layer.'))
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))
    expect(latest.items[0]).toMatchObject({ kind: 'armor', qty: 1, locs: ['head', 'neck'], exclusive: true, armor: { cut: 1, pierce: 0, blunt: 0, gun: 0 } })
  })

  it('shades the parts worn armor already fills, and says a picked part is full', () => {
    mount(T('helmet', { kind: 'armor', name: 'Helmet', carrier: 'worn', pocket: undefined, locs: ['head'], exclusive: true, armor: { cut: 1, pierce: 0, blunt: 2, gun: 0 } }), T('cap', { kind: 'armor', name: 'Cap', carrier: 'worn', pocket: undefined, locs: ['neck'] }))
    const form = openAdd()
    fireEvent.click(field(form, 'radio', /^Armor/ as never))
    expect(form.getByRole('checkbox', { name: 'Head: 2 of 2 layers, armor Cut −1, Blunt −2 (Helmet)' })).toBeTruthy()
    expect(document.querySelectorAll('.body-map .worn')).toHaveLength(2)
    fireEvent.click(form.getByRole('checkbox', { name: /^Head/ }))
    expect(document.querySelector('p.picked')?.textContent).toBe("Covers Head. Already full: Head, so it can't be worn until something comes off there.")
  })

  it('adds a consumable that goes into a gun, and a holder of what it holds', () => {
    mount()
    let form = openAdd()
    fireEvent.click(field(form, 'radio', /^Consumable/ as never))
    fireEvent.change(field(form, 'combobox', 'Name'), { target: { value: 'C batteries' } })
    fireEvent.change(form.getByRole('combobox', { name: 'Goes into a gun or holder?' }), { target: { value: 'dcell' } })
    fireEvent.change(field(form, 'spinbutton', 'How many in all'), { target: { value: '6' } })
    fireEvent.change(field(form, 'spinbutton', 'Fit in one slot'), { target: { value: '4' } })
    expect(form.getByText('6 in all makes 2 stacks, each taking 1 slot: 2 slots in all. The last stack holds 2.')).toBeTruthy()
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))
    expect(status()).toBe('C batteries: 2 stacks, backpack, main pocket.')
    expect(latest.items.map((i) => [i.qty, i.fits])).toEqual([[4, 'dcell'], [2, 'dcell']])

    form = openAdd()
    fireEvent.click(field(form, 'radio', /^Holder/ as never))
    fireEvent.change(field(form, 'combobox', 'Name'), { target: { value: 'Oil lamp' } })
    fireEvent.click(field(form, 'radio', 'Filledlike a canteen'))
    fireEvent.change(field(form, 'spinbutton', 'Holds'), { target: { value: '3' } })
    fireEvent.change(field(form, 'spinbutton', 'In it now'), { target: { value: '1' } })
    expect(form.getByText("It stays when it's empty. Load, fill or empty it from its card.")).toBeTruthy()
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))
    expect(form.getByRole('alert').textContent).toBe("Pick what it holds. If it isn't on the list, make a supply.")
    fireEvent.change(form.getByRole('combobox', { name: 'Holds what' }), { target: { value: 'oil' } })
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))
    expect(latest.items[2]).toMatchObject({ kind: 'holder', hold: 'fill', capacity: 3, loaded: 1, takes: 'oil', qty: 1 })
  })
})

describe('the stock picker and suggestions', () => {
  it('suggests stock under the name, picked with the arrow keys, and Escape closes the list first', () => {
    mount()
    const form = openAdd()
    const name = field(form, 'combobox', 'Name')
    fireEvent.change(name, { target: { value: 'flash' } })
    const list = form.getByRole('listbox', { name: 'Stock items' })
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'FlashlightHolder / 1 slot / Loaded: D batteries, holds 2', 'D batteriesConsumable / 1 slot / ×2, 4 fit in a slot, D batteries', 'Browse all stock',
    ])
    expect(name.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(name, { key: 'ArrowDown' })
    expect(name.getAttribute('aria-activedescendant')).toBe('lubec-sug-0')
    fireEvent.keyDown(name, { key: 'Escape' })
    expect(form.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(name, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('copies a suggestion in with Enter, and a tap on "Browse all stock" opens the picker with the name searched', () => {
    mount()
    const form = openAdd()
    const name = field(form, 'combobox', 'Name')
    fireEvent.change(name, { target: { value: 'helmet' } })
    fireEvent.keyDown(name, { key: 'ArrowUp' })
    fireEvent.keyDown(name, { key: 'ArrowUp' })
    fireEvent.keyDown(name, { key: 'a' })
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(status()).toBe('Hockey helmet: copied in from stock.')
    expect(name.value).toBe('Hockey helmet')
    expect(field(form, 'radio', /^Armor/ as never).checked).toBe(true)
    expect(form.getByText('From stock:', { exact: false }).textContent).toBe('From stock: Hockey helmet. A copy, so change anything.')
    expect(form.getByText('Square')).toBeTruthy()

    fireEvent.click(field(form, 'radio', 'Tall'))
    expect(form.getByText('Tall')).toBeTruthy()
    fireEvent.click(form.getByRole('button', { name: 'Take the picture off' }))
    expect(form.getByText('No picture')).toBeTruthy()
    expect(field(form, 'radio', 'Wide').disabled).toBe(true)

    fireEvent.change(name, { target: { value: 'shell' } })
    fireEvent.blur(name)
    expect(form.queryByRole('listbox')).toBeNull()
    fireEvent.change(name, { target: { value: 'shells' } })
    fireEvent.click(within(form.getByRole('listbox')).getByRole('option', { name: 'Browse all stock' }))
    const picker = dialog('Pick from stock')
    expect(field(picker, 'textbox', 'Search').value).toBe('shells')
    expect(field(picker, 'radio', 'All').checked).toBe(true)
    expect(picker.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Holder'])
  })

  it('searches stock by kind and words, says when nothing matches, and goes back to the form unchanged', () => {
    mount()
    let form = openAdd()
    fireEvent.change(field(form, 'combobox', 'Name'), { target: { value: 'My thing' } })
    fireEvent.click(form.getByRole('button', { name: 'Browse stock' }))
    let picker = dialog('Pick from stock')
    expect(picker.getByText("Lubec 1977 is the game's stock, made ahead of time. Picking one copies its picture and numbers into the form; change anything after.")).toBeTruthy()
    expect(picker.queryByRole('radiogroup', { name: 'From' })).toBeNull()
    expect(picker.queryByText('This campaign')).toBeNull()
    fireEvent.change(field(picker, 'textbox', 'Search'), { target: { value: 'zebra' } })
    expect(picker.getByText('Nothing in stock matches. Go back and make it by hand.')).toBeTruthy()
    fireEvent.click(field(picker, 'radio', 'Weapon'))
    expect(picker.getByText('Nothing here matches.')).toBeTruthy()
    fireEvent.click(picker.getByRole('button', { name: 'Back to the form' }))
    form = dialog('Add an item')
    expect(field(form, 'combobox', 'Name').value).toBe('My thing')

    fireEvent.click(form.getByRole('button', { name: 'Browse stock' }))
    picker = dialog('Pick from stock')
    fireEvent.click(picker.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('offers this campaign\'s list when it has one, marked as the campaign\'s', () => {
    const sled = { sid: 'm-1', kind: 'thing' as const, name: 'Sled', note: '', size: 4 as const, weight: 'normal' as const, qty: 1 }
    render(<Page initial={emptyLubecGear()} campaignStock={[sled]} />)
    const form = openAdd()
    fireEvent.change(field(form, 'combobox', 'Name'), { target: { value: 'sled' } })
    expect(within(form.getByRole('listbox')).getAllByRole('option')[0].textContent).toBe('SledThing / 4 slotsCampaign')
    fireEvent.click(form.getByRole('button', { name: 'Browse stock' }))
    const picker = dialog('Pick from stock')
    expect(picker.getByText("Lubec 1977 is the game's stock, made ahead of time. This campaign is the campaign items in the GM's Items tab. Picking one copies its picture and numbers into the form; change anything after.")).toBeTruthy()
    fireEvent.click(field(picker, 'radio', 'This campaign'))
    expect(picker.getAllByRole('button').map((b) => b.textContent)).toEqual(['×', 'This campaignSled4 slots', 'Back to the form'])
  })
})

describe('the form on a phone', () => {
  it('is pages, the item, its kind and where, turned with Next and Back and the steps', () => {
    setPhone(true)
    mount()
    const form = openAdd()
    const steps = () => form.getAllByRole('tab').map((t) => `${t.textContent}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}`)
    expect(steps()).toEqual(['1Item*', '2Where'])
    expect(document.querySelector('.item-form')?.getAttribute('data-page')).toBe('top')
    fireEvent.click(field(form, 'radio', /^Weapon/ as never))
    expect(steps()).toEqual(['1Item*', '2Weapon', '3Where'])
    expect(form.queryByRole('button', { name: 'Add it' })).toBeNull()
    fireEvent.click(form.getByRole('button', { name: 'Next' }))
    expect(document.querySelector('.item-form')?.getAttribute('data-page')).toBe('kind')
    fireEvent.click(form.getAllByRole('tab')[2])
    expect(form.getByRole('button', { name: 'Add it' })).toBeTruthy()
    fireEvent.click(field(form, 'radio', /^Thing/ as never))
    expect(steps()).toEqual(['1Item', '2Where*'])
    fireEvent.click(form.getByRole('button', { name: 'Back' }))
    expect(steps()).toEqual(['1Item*', '2Where'])
    fireEvent.click(form.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('turns to the page a refusal points at', () => {
    setPhone(true)
    mount()
    const form = openAdd()
    fireEvent.click(field(form, 'radio', /^Holder/ as never))
    fireEvent.change(field(form, 'combobox', 'Name'), { target: { value: 'Jar' } })
    fireEvent.click(form.getAllByRole('tab')[2])
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))
    expect(form.getByRole('alert').textContent).toBe("Pick what it holds. If it isn't on the list, make a supply.")
    expect(document.querySelector('.item-form')?.getAttribute('data-page')).toBe('kind')
  })
})

describe('the toast', () => {
  it('goes after a moment', () => {
    vi.useFakeTimers()
    mount()
    const form = openAdd()
    fireEvent.change(field(form, 'combobox', 'Name'), { target: { value: 'Rope' } })
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))
    expect(screen.getByRole('status').className).toBe('toast show')
    act(() => vi.advanceTimersByTime(3000))
    expect(screen.getByRole('status').className).toBe('toast')
  })
})
