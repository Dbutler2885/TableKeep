export const normalizeTokenRotation = (value: number) => ((Math.round(value) % 360) + 360) % 360
