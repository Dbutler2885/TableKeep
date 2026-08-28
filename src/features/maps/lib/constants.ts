export const TOKEN_REFERENCE_DIMENSION = 900
export const DEFAULT_TOKEN_VIEW_DISTANCE = 120
export const TOKEN_SIZE_MIN = 8
export const TOKEN_SIZE_MAX = 2000
export const TOKEN_RENDER_SIZE_MAX = 8000
export const FOG_BRUSH_SIZE_MIN = 1
export const TOKEN_VIEW_DISTANCE_MIN = 8
export const TOKEN_VIEW_DISTANCE_MAX = 600
export const LOS_SURFACE_REVEAL_MULTIPLIER = 2.4
export const LOS_BLOCKER_SAMPLE_RADIUS = 2
export const STREAMING_LOCAL_REVEAL_INTERVAL_MS = 40
export const STREAMING_LOCAL_REVEAL_MAX_INTERVAL_MS = 110
export const DRAG_PATH_SAMPLE_DISTANCE = 0.015  // normalized units between sampled waypoints
export const ANIM_REVEAL_INTERVAL_MS = 66       // ~15Hz fog reveal during path animation
export const FOG_CANVAS_MAX_DIM = 384           // cap fog canvas to this dimension regardless of device screen size
export const DEFAULT_GRID_CELL_SCALE = 0.05
export const ENCOUNTER_CHECK_DISTANCE_FEET = 120
export const ENCOUNTER_CHECK_TURNS = 2
export const ENCOUNTER_TRIGGER_ROLL_MAX = 1
export const DISTANCE_POST_ROLL_MIN_FEET_TO_SHOW = 10
export const MIN_MAP_ZOOM = 0.5
export const MAX_MAP_ZOOM = 30
export const BRUSH_SIZE_MIN = 1
export const BRUSH_SIZE_MAX = 260
export const BRUSH_PREVIEW_BOX_SIZE = 96
export const BRUSH_PREVIEW_DOT_MIN = 4
export const BRUSH_PREVIEW_DOT_MAX = 84

// Default canvas dimensions and background for a blank (quick-draw) map. The GM
// sketches on a surface of these dimensions in the drawing editor; the exported
// image inherits the drawing's own bounds, but these give the editor and the
// unsaved placeholder a stable, neutral starting size.
export const BLANK_MAP_WIDTH = 1600
export const BLANK_MAP_HEIGHT = 1000
export const BLANK_MAP_BACKGROUND = '#f3efe3'
