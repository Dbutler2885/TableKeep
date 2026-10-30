// @vitest-environment jsdom
/**
 * Pictures from uploads (spec 3.3 and 4.6): the form's picture box and shapes,
 * the card's "Add a picture", the frames that show an upload from its stored
 * path, a hidden thing's lack of an upload, and the GM's campaign item. Storage
 * is stubbed; `lubecItemArt.emulator.test.ts` has the rules.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { resolveStoragePathUrl, uploadEntityImage } from '../../common/mediaStorage'
import { emptyLubecGear, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import { LUBEC_NO_HIDDEN_PICTURE } from '../../ruleSets/lubec/gear/containers'
import type { LubecStockItem } from '../../ruleSets/lubec/gear/stock'
import { saveLubecLibraryItem } from '../items/gmItemWrites'
import { lubecLibraryAddSheet } from '../items/gmItemForm'
import { LubecGmItemCard, type LubecGmItemActions } from '../items/LubecGmItemCard'
import { LubecLibraryForm } from '../items/LubecLibraryForm'
import { lubecAddSheet, lubecCardSheet, type LubecFormSheet, type LubecItemSheetState } from './itemSheet'
import { LubecPicture } from './LubecGearArt'
import { lubecSheetPictureUpload } from './lubecItemArt'
import type { LubecPictureUpload } from './lubecPicked'
import { LubecItemSheet } from './LubecItemSheet'
import { LUBEC_PIC_FILE } from './useLubecPictureUpload'

vi.setConfig({ testTimeout: 30_000 })

vi.mock('../../common/mediaStorage', () => ({
  characterUploadAuthority: () => 'owner',
  uploadEntityImage: vi.fn(),
  resolveStoragePathUrl: vi.fn(),
}))
vi.mock('../items/gmItemWrites', () => ({ saveLubecLibraryItem: vi.fn(async () => undefined) }))

const uploaded = vi.mocked(uploadEntityImage)
const resolved = vi.mocked(resolveStoragePathUrl)
const PATH = 'groups/g/campaigns/c/characters/char/item-art/1-mug.webp'
const URL_OF = (path: string) => `https://example.test/${path}?token=secret`

const T = (id: string, extra: Partial<LubecItem> = {}): LubecItem =>
  ({ id, kind: 'thing', name: id, note: '', size: 1, weight: 'normal', qty: 1, carrier: 'backpack', pocket: 0, ...extra })

const upload: LubecPictureUpload = lubecSheetPictureUpload({ scope: { campaignId: 'c', groupId: 'g' }, characterId: 'char', ownerUserId: 'me', userId: 'me' })

let latest: LubecGear

type SheetOptions = { upload?: LubecPictureUpload | null; inHidden?: boolean; campaignStock?: LubecStockItem[] }

function Sheet({ initial, start, options }: { initial: LubecGear; start: LubecItemSheetState; options: SheetOptions }) {
  const [gear, setGear] = useState(initial)
  const [sheet, setSheet] = useState<LubecItemSheetState | null>(start)
  const change = (next: LubecGear) => {
    latest = next
    setGear(next)
  }
  if (!sheet) return <p>Closed</p>
  return (
    <LubecItemSheet
      sheet={sheet} gear={gear} onGearChange={change} onSheet={setSheet} toast={vi.fn()} campaignStock={options.campaignStock ?? []} onDrop={vi.fn()} onAsk={null} busy={false}
      wielder={{ strength: 45, handle: 55 }} give={null} upload={options.upload === undefined ? upload : options.upload} inHidden={options.inHidden}
    />
  )
}

function mount(start: LubecItemSheetState, options: SheetOptions = {}, ...items: LubecItem[]) {
  latest = { ...emptyLubecGear(), items }
  return render(<Sheet initial={latest} start={start} options={options} />)
}

const addForm = () => lubecAddSheet('backpack#0')
const fileInput = () => document.getElementById(LUBEC_PIC_FILE) as HTMLInputElement
const form = () => within(screen.getByRole('dialog', { name: 'Add an item' }))
const pick = (file = new File(['x'], 'mug.jpg', { type: 'image/jpeg' })) => fireEvent.change(fileInput(), { target: { files: [file] } })
const named = (name: string) => fireEvent.change(form().getByRole('combobox', { name: 'Name' }), { target: { value: name } })

const stored = (width: number, height: number, path = PATH) => ({ path, url: URL_OF(path), width, height, name: 'mug' })

beforeEach(() => {
  uploaded.mockReset()
  uploaded.mockImplementation(async () => stored(300, 600))
  resolved.mockReset()
  resolved.mockImplementation(async (path) => URL_OF(path))
})

afterEach(() => cleanup())

describe('the picture box', () => {
  it('offers a picture, and shows the upload in the shape its proportions pick', async () => {
    mount(addForm())
    expect(form().getByRole('button', { name: 'Add a picture' }).textContent).toBe('+Picture')
    expect(form().getByText('No picture')).toBeTruthy()

    pick()
    await waitFor(() => expect(form().getByText('Tall')).toBeTruthy())

    expect((form().getByRole('radio', { name: 'Tall' }) as HTMLInputElement).checked).toBe(true)
    const box = form().getByRole('button', { name: 'Change the picture' })
    await waitFor(() => expect(box.querySelector('img')?.getAttribute('src')).toBe(URL_OF(PATH)))
    expect(box.querySelector('.pic-in.tall')).toBeTruthy()
  })

  it('stores the path and the picked shape, and no URL', async () => {
    mount(addForm())
    named('Lucky mug')
    pick()
    await waitFor(() => expect(form().getByText('Tall')).toBeTruthy())

    fireEvent.click(form().getByRole('radio', { name: 'Wide' }))
    expect(form().getByRole('button', { name: 'Change the picture' }).querySelector('.pic-in.wide')).toBeTruthy()
    fireEvent.click(form().getByRole('button', { name: 'Add it' }))

    expect(latest.items[0]).toMatchObject({ name: 'Lucky mug', picturePath: PATH, shape: 'wide' })
    expect(latest.items[0].art).toBeUndefined()
    expect(JSON.stringify(latest.items[0])).not.toContain('https://')
  })

  it('waits for the upload to save, and keeps what was typed meanwhile', async () => {
    let finish = (value: ReturnType<typeof stored>) => void value
    uploaded.mockImplementation(() => new Promise((done) => { finish = done }))
    mount(addForm())
    pick()

    await waitFor(() => expect(form().getByText('Uploading...')).toBeTruthy())
    expect((form().getByRole('button', { name: 'Add it' }) as HTMLButtonElement).disabled).toBe(true)
    expect((form().getByRole('button', { name: 'Add a picture' }) as HTMLButtonElement).disabled).toBe(true)
    named('Lucky mug')

    await act(async () => finish(stored(100, 100)))
    expect((form().getByRole('combobox', { name: 'Name' }) as HTMLInputElement).value).toBe('Lucky mug')
    expect(form().getByText('Square')).toBeTruthy()
    expect((form().getByRole('button', { name: 'Add it' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('does not reopen a form closed during the upload', async () => {
    let finish = (value: ReturnType<typeof stored>) => void value
    uploaded.mockImplementation(() => new Promise((done) => { finish = done }))
    mount(addForm())
    pick()
    fireEvent.click(form().getByRole('button', { name: 'Close' }))

    await act(async () => finish(stored(100, 100)))
    expect(screen.getByText('Closed')).toBeTruthy()
  })

  it('refuses a file that is not a picture', async () => {
    mount(addForm())
    pick(new File(['x'], 'notes.txt', { type: 'text/plain' }))
    await waitFor(() => expect(form().getByRole('alert').textContent).toBe("That file isn't a picture."))
    expect(uploaded).not.toHaveBeenCalled()
  })

  it('replaces a drawing, and × takes the upload off', async () => {
    mount(lubecCardSheet('rope'), {}, T('rope', { art: 'rope', shape: 'square' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    pick()
    await waitFor(() => expect(screen.getByText('Tall')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(latest.items[0]).toMatchObject({ picturePath: PATH, shape: 'tall' })
    expect(latest.items[0].art).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Take the picture off' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(latest.items[0].picturePath).toBeUndefined()
    expect(latest.items[0].shape).toBeUndefined()
  })
})

describe('the card', () => {
  it('shows an upload from its stored path, with the name to read', async () => {
    mount(lubecCardSheet('mug'), {}, T('mug', { name: 'Lucky mug', picturePath: PATH, shape: 'wide' }))
    const figure = screen.getByRole('img', { name: 'Lucky mug' })
    expect(figure.classList.contains('wide')).toBe(true)
    await waitFor(() => expect(figure.querySelector('img')?.getAttribute('src')).toBe(URL_OF(PATH)))
    expect(resolved).toHaveBeenCalledWith(PATH)
  })

  it('keeps an empty frame, not the "no picture" one, while the URL is unknown or fails', async () => {
    resolved.mockRejectedValue(new Error('offline'))
    mount(lubecCardSheet('mug'), {}, T('mug', { picturePath: PATH, shape: 'tall' }))
    await waitFor(() => expect(resolved).toHaveBeenCalled())
    expect(document.querySelector('.card-pic.tall .art')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add a picture' })).toBeNull()
  })

  it('opens the edit form with its file picker from "Add a picture"', () => {
    const clicked = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    mount(lubecCardSheet('mug'), {}, T('mug', { name: 'Lucky mug' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a picture' }))

    expect(screen.getByRole('dialog', { name: 'Lucky mug' }).querySelector('form')).toBeTruthy()
    expect(clicked.mock.contexts[0]).toBe(fileInput())
    clicked.mockRestore()
  })

  it('says only "No picture" on a sheet with no upload', () => {
    mount(lubecCardSheet('mug'), { upload: null }, T('mug'))
    expect(document.querySelector('.card-pic.none')?.textContent).toBe('No picture')
    expect(screen.queryByRole('button', { name: 'Add a picture' })).toBeNull()
  })
})

describe('a small frame', () => {
  it('shows the upload, and swaps when the path does', async () => {
    const other = `${PATH}-2`
    const view = render(<LubecPicture item={{ kind: 'thing', picturePath: PATH, shape: 'square' }} frame="thumb" />)
    await waitFor(() => expect(view.container.querySelector('.thumb.square img')?.getAttribute('src')).toBe(URL_OF(PATH)))
    view.rerender(<LubecPicture item={{ kind: 'thing', picturePath: other, shape: 'square' }} frame="thumb" />)
    expect(view.container.querySelector('img')).toBeNull()
    await waitFor(() => expect(view.container.querySelector('img')?.getAttribute('src')).toBe(URL_OF(other)))
  })
})

describe('a hidden thing', () => {
  it('is offered no upload, on the card or the form', () => {
    mount(lubecCardSheet('mug'), { inHidden: true }, T('mug', { name: 'Lucky mug' }))
    expect(screen.queryByRole('button', { name: 'Add a picture' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.queryByRole('button', { name: 'Add a picture' })).toBeNull()
    expect(fileInput()).toBeNull()
  })

  it('may not be saved with a campaign item\'s uploaded picture, and may once it is off', () => {
    const entry = { sid: 'mug', kind: 'thing', name: 'Lucky mug', size: 1, weight: 'normal', qty: 1, note: '', picturePath: PATH, shape: 'wide' } as LubecStockItem
    mount({ ...addForm(), dest: 'stash#0', fields: { ...addForm().fields, dest: 'stash#0' } }, { inHidden: true, campaignStock: [entry] })
    fireEvent.click(form().getByRole('button', { name: 'Browse stock' }))
    fireEvent.click(screen.getByRole('button', { name: /Lucky mug/ }))

    fireEvent.click(form().getByRole('button', { name: 'Add it' }))
    expect(form().getByRole('alert').textContent).toBe(LUBEC_NO_HIDDEN_PICTURE)
    expect(latest.items).toEqual([])

    fireEvent.click(form().getByRole('button', { name: 'Take the picture off' }))
    fireEvent.click(form().getByRole('button', { name: 'Add it' }))
    expect(form().queryByRole('alert')?.textContent).not.toBe(LUBEC_NO_HIDDEN_PICTURE)
  })
})

describe("the GM's campaign item", () => {
  const records = { db: {} as never, scope: { campaignId: 'c', groupId: 'g' } }

  function Library() {
    const [sheet, setSheet] = useState<LubecFormSheet | null>(lubecLibraryAddSheet())
    return sheet ? <LubecLibraryForm form={sheet} was={null} library={[]} records={records} onForm={setSheet} onSaved={vi.fn()} toast={vi.fn()} /> : <p>Closed</p>
  }

  it('files a new item\'s picture under the id it is saved with', async () => {
    uploaded.mockImplementation(async () => stored(600, 400, 'groups/g/campaigns/c/gmItems/x/item-art/1-mug.webp'))
    render(<Library />)
    named('Lucky mug')
    pick()
    await waitFor(() => expect(form().getByText('Wide')).toBeTruthy())
    fireEvent.click(form().getByRole('button', { name: 'Add it' }))
    await waitFor(() => expect(screen.getByText('Closed')).toBeTruthy())

    const [{ collectionName, entityId }] = uploaded.mock.calls[0]
    const saved = vi.mocked(saveLubecLibraryItem).mock.calls[0][1]
    expect(collectionName).toBe('gmItems')
    expect(entityId).toBe(saved.id)
    expect(saved.picturePath).toContain('/gmItems/')
    expect(JSON.stringify(saved)).not.toContain('https://')
  })

  it('offers "Add a picture" on a campaign item\'s card, and not on a dropped one', () => {
    const actions = (onAddPicture: (() => void) | null): LubecGmItemActions => ({ onEdit: null, onAddPicture, onGive: vi.fn(), onKeep: null, onDelete: vi.fn() })
    const item = { ...T('mug'), status: 'library' } as LubecGmItem
    const add = vi.fn()
    const view = render(<LubecGmItemCard item={item} targets={[]} busy={false} error={null} actions={actions(add)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a picture' }))
    expect(add).toHaveBeenCalled()

    view.rerender(<LubecGmItemCard item={item} targets={[]} busy={false} error={null} actions={actions(null)} />)
    expect(screen.queryByRole('button', { name: 'Add a picture' })).toBeNull()
  })
})
