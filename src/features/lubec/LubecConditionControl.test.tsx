// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LubecConditionControl } from './LubecConditionControl'

afterEach(cleanup)

// The GM's condition picker in the name band: it floats open from its button,
// sets or clears Comatose and Dead, and closes on a pick, on Escape, or when focus
// leaves it, handing focus back to the button where the GM left it.

const opener = () => screen.getByRole('button', { name: 'Set condition' })
const picker = () => screen.queryByRole('dialog', { name: 'Set condition' })
const select = () => screen.getByRole('combobox', { name: 'Condition' }) as HTMLSelectElement
const mount = (onChange = vi.fn(), condition?: 'comatose' | 'dead') => {
  render(<div><LubecConditionControl condition={condition} onChange={onChange} /><button type="button">Elsewhere</button></div>)
  return onChange
}

describe('the GM\'s condition picker', () => {
  it('is not offered to a viewer who may not change the sheet', () => {
    render(<LubecConditionControl condition="dead" onChange={null} />)
    expect(screen.queryByRole('button', { name: 'Set condition' })).toBeNull()
  })

  it('opens from its button showing the current condition, and the button closes it again', () => {
    mount(vi.fn(), 'comatose')
    fireEvent.click(opener())
    expect(opener().getAttribute('aria-expanded')).toBe('true')
    expect(opener().getAttribute('aria-controls')).toBe(picker()!.id)
    expect(select().value).toBe('comatose')
    fireEvent.click(opener())
    expect(picker()).toBeNull()
  })

  it('sets the condition picked, closes and hands focus back to its button', () => {
    const onChange = mount()
    fireEvent.click(opener())
    fireEvent.change(select(), { target: { value: 'dead' } })
    expect(onChange).toHaveBeenCalledWith('dead')
    expect(picker()).toBeNull()
    expect(document.activeElement).toBe(opener())
  })

  it('clears the condition when None is picked', () => {
    const onChange = mount(vi.fn(), 'dead')
    fireEvent.click(opener())
    fireEvent.change(select(), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('closes on Escape and hands focus back, but not on any other key', () => {
    mount()
    fireEvent.click(opener())
    fireEvent.keyDown(select(), { key: 'ArrowDown' })
    expect(picker()).not.toBeNull()
    fireEvent.keyDown(select(), { key: 'Escape' })
    expect(picker()).toBeNull()
    expect(document.activeElement).toBe(opener())
  })

  it('stays open while focus moves inside it, and closes once focus leaves it', () => {
    mount()
    fireEvent.click(opener())
    fireEvent.blur(opener(), { relatedTarget: select() })
    expect(picker()).not.toBeNull()
    fireEvent.blur(select(), { relatedTarget: screen.getByRole('button', { name: 'Elsewhere' }) })
    expect(picker()).toBeNull()
  })
})
