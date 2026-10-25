import { describe, expect, it } from 'vitest'
import { lubecHoles } from './holes'
import { lubecSheet, tommyEves } from './sheetFixtures'

const tommyBase = tommyEves().base

describe('Lubec holes', () => {
  it('find none in Tommy Eves', () => {
    expect(lubecHoles(tommyEves())).toEqual([])
  })

  it('name a missing class, and a class the rules do not know, as the class', () => {
    expect(lubecHoles(lubecSheet({ class: { key: null, choices: {} } }))).toEqual(['Class'])
    expect(lubecHoles(lubecSheet({ class: { key: 'jock', choices: {} } }))).toEqual(['Class'])
  })

  it('name a missing or off-list class choice by the choice\'s label', () => {
    expect(lubecHoles(lubecSheet({ class: { key: 'nerd', choices: {} } }))).toEqual(['Stat taking -10'])
    expect(lubecHoles(lubecSheet({ class: { key: 'scout', choices: { statBonus: 'Intellect' } } }))).toEqual(['Stat gaining +5'])
    expect(lubecHoles(lubecSheet({ class: { key: 'nerd', choices: { statPenalty: 'Handle' } } }))).toEqual([])
  })

  it('name each missing base value, after the class, in sheet order', () => {
    const sheet = lubecSheet({ class: { key: null, choices: {} }, base: { ...tommyBase, Body: null, Speed: null } })
    expect(lubecHoles(sheet)).toEqual(['Class', 'Speed', 'Body'])
  })
})
