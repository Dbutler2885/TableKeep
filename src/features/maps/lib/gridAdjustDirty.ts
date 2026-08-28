import type { GridAdjustDraft, MapRecord } from './types'

type SavedGridSettings = Pick<
  MapRecord,
  'gridEnabled' | 'gridVisible' | 'gridCellScale' | 'gridOffsetX' | 'gridOffsetY' | 'gridType'
>

const GRID_FLOAT_TOLERANCE = 0.000001

export const isGridAdjustDirty = (
  saved: SavedGridSettings | null,
  draft: GridAdjustDraft | null,
) => Boolean(
  saved &&
  draft &&
  (
    saved.gridEnabled !== draft.gridEnabled ||
    saved.gridVisible !== draft.gridVisible ||
    Math.abs(saved.gridCellScale - draft.gridCellScale) > GRID_FLOAT_TOLERANCE ||
    Math.abs(saved.gridOffsetX - draft.gridOffsetX) > GRID_FLOAT_TOLERANCE ||
    Math.abs(saved.gridOffsetY - draft.gridOffsetY) > GRID_FLOAT_TOLERANCE ||
    saved.gridType !== draft.gridType
  )
)
