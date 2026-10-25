// The one dice source every Lubec roll draws from: a function returning a
// random number in [0, 1). It defaults to the browser's crypto random, and a
// test seeds it by passing its own.

export type LubecDice = () => number

const UINT32_RANGE = 2 ** 32

/** A random number in [0, 1) from the browser's crypto random. */
export const cryptoLubecDice: LubecDice = () => crypto.getRandomValues(new Uint32Array(1))[0] / UINT32_RANGE

/** One die of the given number of sides, 1 to `sides`. */
export const rollLubecDie = (sides: number, dice: LubecDice): number => Math.floor(dice() * sides) + 1
