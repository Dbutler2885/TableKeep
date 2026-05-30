import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../../firebase'
import type { Role } from '../../../types/app'
import { campaignDocRef } from '../../campaign/firestorePaths'
import type { GridAdjustDraft, MapRecord } from '../lib/types'
import { DEFAULT_GRID_CELL_SCALE } from '../lib/constants'
import { detectHexGridFromImageWithDebug } from '../lib/hexDetection'

type UseGridToolsOptions = {
  selectedMap: MapRecord | undefined | null
  role: Role | null
  campaignId: string
  groupId: string
  activeMapWidth: number
  activeMapHeight: number
  activeMapDimension: number
  inlineBaseSize: { width: number; height: number }
  setMaps: Dispatch<SetStateAction<MapRecord[]>>
  setMapError: (msg: string | null) => void
  getTokenDropPoint: (clientX: number, clientY: number) => { x: number; y: number } | null
  resetDistanceTracker: () => void
}

export function useGridTools({
  selectedMap,
  role,
  campaignId,
  groupId,
  activeMapWidth,
  activeMapHeight,
  activeMapDimension,
  inlineBaseSize,
  setMaps,
  setMapError,
  getTokenDropPoint,
  resetDistanceTracker,
}: UseGridToolsOptions) {
  const [gridCalibrateMode, setGridCalibrateMode] = useState(false)
  const [gridAdjustMode, setGridAdjustMode] = useState(false)
  const [gridCalibrateStart, setGridCalibrateStart] = useState<{ x: number; y: number } | null>(null)
  const [gridCalibrateEnd, setGridCalibrateEnd] = useState<{ x: number; y: number } | null>(null)
  const [gridCalibratePreview, setGridCalibratePreview] = useState<{ x: number; y: number } | null>(null)
  const [gridCalibrateDraggingHandle, setGridCalibrateDraggingHandle] = useState<'start' | 'end' | null>(null)
  const [gridMeasureMode, setGridMeasureMode] = useState(false)
  const [gridMeasureStart, setGridMeasureStart] = useState<{ x: number; y: number } | null>(null)
  const [gridMeasureEnd, setGridMeasureEnd] = useState<{ x: number; y: number } | null>(null)
  const [gridMeasurePreview, setGridMeasurePreview] = useState<{ x: number; y: number } | null>(null)
  const [gridMeasureDraggingHandle, setGridMeasureDraggingHandle] = useState<'start' | 'end' | null>(null)
  const [gridCalibrateSavedAt, setGridCalibrateSavedAt] = useState(0)
  const [gridAdjustSavedAt, setGridAdjustSavedAt] = useState(0)
  const [gridAdjustDraft, setGridAdjustDraft] = useState<GridAdjustDraft | null>(null)
  const [gridTypeOverrides, setGridTypeOverrides] = useState<Record<string, MapRecord['gridType']>>({})
  const [gridCalibratePulse, setGridCalibratePulse] = useState(false)
  const [hexDetecting, setHexDetecting] = useState(false)
  const [hexDetectConfidence, setHexDetectConfidence] = useState<number | null>(null)
  const [gridAlignDrag, setGridAlignDrag] = useState<{
    startClientX: number
    startClientY: number
    startOffsetX: number
    startOffsetY: number
  } | null>(null)

  // Keep getTokenDropPoint in a ref so effects don't re-run when it changes
  // (it reads from canvas refs internally and is always current).
  const getTokenDropPointRef = useRef(getTokenDropPoint)
  getTokenDropPointRef.current = getTokenDropPoint

  // --- Derived effective grid values ---

  const selectedMapGridType = selectedMap
    ? (gridTypeOverrides[selectedMap.id] ?? selectedMap.gridType ?? 'square')
    : 'square'

  const effectiveGridEnabled = gridAdjustMode
    ? (gridAdjustDraft?.gridEnabled ?? selectedMap?.gridEnabled === true)
    : selectedMap?.gridEnabled === true

  const effectiveGridVisible = gridAdjustMode
    ? (gridAdjustDraft?.gridVisible ?? selectedMap?.gridVisible !== false)
    : (selectedMap?.gridVisible !== false)

  const effectiveGridCellScale = gridAdjustMode
    ? (gridAdjustDraft?.gridCellScale ?? selectedMap?.gridCellScale ?? DEFAULT_GRID_CELL_SCALE)
    : (selectedMap?.gridCellScale ?? DEFAULT_GRID_CELL_SCALE)

  const effectiveGridOffsetX = gridAdjustMode
    ? (gridAdjustDraft?.gridOffsetX ?? selectedMap?.gridOffsetX ?? 0)
    : (selectedMap?.gridOffsetX ?? 0)

  const effectiveGridOffsetY = gridAdjustMode
    ? (gridAdjustDraft?.gridOffsetY ?? selectedMap?.gridOffsetY ?? 0)
    : (selectedMap?.gridOffsetY ?? 0)

  const effectiveGridType = gridAdjustMode
    ? (gridAdjustDraft?.gridType ?? selectedMapGridType)
    : selectedMapGridType

  // --- Handlers ---

  const resetGridCalibrationDraft = () => {
    setGridCalibrateStart(null)
    setGridCalibrateEnd(null)
    setGridCalibratePreview(null)
    setGridCalibrateDraggingHandle(null)
    setGridCalibrateSavedAt(0)
    setGridCalibratePulse(false)
  }

  const resetGridMeasurementDraft = () => {
    setGridMeasureStart(null)
    setGridMeasureEnd(null)
    setGridMeasurePreview(null)
    setGridMeasureDraggingHandle(null)
  }

  const toggleGridAdjustMode = () => {
    if (role !== 'gm' || !selectedMap) return
    if (gridCalibrateMode) {
      setGridCalibrateMode(false)
      resetGridCalibrationDraft()
    }
    if (gridMeasureMode) {
      setGridMeasureMode(false)
      resetGridMeasurementDraft()
    }
    if (gridAdjustMode) {
      setGridAdjustMode(false)
      setGridAdjustDraft(null)
      setGridAdjustSavedAt(0)
      setGridAlignDrag(null)
      setGridTypeOverrides((prev) => ({ ...prev, [selectedMap.id]: 'square' }))
      setMaps((prev) =>
        prev.map((map) =>
          map.id === selectedMap.id
            ? {
              ...map,
              gridEnabled: false,
              gridVisible: true,
              gridCellScale: DEFAULT_GRID_CELL_SCALE,
              gridOffsetX: 0,
              gridOffsetY: 0,
              gridType: 'square',
            }
            : map,
        ),
      )
      void updateDoc(campaignDocRef(db, { campaignId, groupId }, 'maps', selectedMap.id), {
        gridEnabled: false,
        gridVisible: true,
        gridCellScale: DEFAULT_GRID_CELL_SCALE,
        gridOffsetX: 0,
        gridOffsetY: 0,
        gridType: 'square',
        updatedAt: serverTimestamp(),
      }).catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to clear grid state'
        setMapError(message)
      })
      return
    }
    setGridAdjustSavedAt(0)
    setGridAdjustDraft({
      gridEnabled: true,
      gridVisible: true,
      gridCellScale: DEFAULT_GRID_CELL_SCALE,
      gridOffsetX: 0,
      gridOffsetY: 0,
      gridType: selectedMap.gridType ?? 'square',
    })
    setGridAdjustMode(true)
  }

  const setGridType = (gridType: 'square' | 'hex-pointy' | 'hex-flat') => {
    if (!selectedMap || role !== 'gm') return
    // Each grid type button acts as its own toggle/cancel while adjusting.
    if (gridAdjustMode && effectiveGridType === gridType) {
      toggleGridAdjustMode()
      return
    }

    if (gridType === 'square') {
      setGridTypeOverrides((prev) => ({ ...prev, [selectedMap.id]: gridType }))
      if (gridAdjustMode) {
        setGridAdjustDraft((current) =>
          current
            ? { ...current, gridType }
            : {
              gridEnabled: true,
              gridVisible: true,
              gridCellScale: selectedMap.gridCellScale,
              gridOffsetX: selectedMap.gridOffsetX,
              gridOffsetY: selectedMap.gridOffsetY,
              gridType,
            },
        )
        return
      }
      setGridAdjustSavedAt(0)
      setGridAdjustDraft({
        gridEnabled: true,
        gridVisible: true,
        gridCellScale: DEFAULT_GRID_CELL_SCALE,
        gridOffsetX: 0,
        gridOffsetY: 0,
        gridType,
      })
      setGridAdjustMode(true)
      return
    }
    void autoDetectHex(gridType)
  }

  const applyGridAdjust = async () => {
    if (!selectedMap || !gridAdjustDraft) return
    setGridTypeOverrides((prev) => ({ ...prev, [selectedMap.id]: gridAdjustDraft.gridType }))
    const next = {
      gridEnabled: gridAdjustDraft.gridEnabled,
      gridVisible: gridAdjustDraft.gridVisible,
      gridCellScale: gridAdjustDraft.gridCellScale,
      gridOffsetX: gridAdjustDraft.gridOffsetX,
      gridOffsetY: gridAdjustDraft.gridOffsetY,
      gridType: gridAdjustDraft.gridType,
    }
    setMaps((prev) => prev.map((map) => (map.id === selectedMap.id ? { ...map, ...next } : map)))
    try {
      await updateDoc(campaignDocRef(db, { campaignId, groupId }, 'maps', selectedMap.id), {
        ...next,
        updatedAt: serverTimestamp(),
      })
      setGridAdjustSavedAt(Date.now())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply grid settings'
      setMapError(message)
    }
  }

  const applyGridCalibration = async () => {
    if (!selectedMap || !gridCalibrateStart || !gridCalibrateEnd) return
    const mapWidth = Math.max(1, activeMapWidth)
    const mapHeight = Math.max(1, activeMapHeight)
    const mapDimension = Math.max(1, activeMapDimension)
    const dxPx = (gridCalibrateEnd.x - gridCalibrateStart.x) * mapWidth
    const dyPx = (gridCalibrateEnd.y - gridCalibrateStart.y) * mapHeight
    const distancePx = Math.hypot(dxPx, dyPx)
    if (distancePx < 6) {
      setMapError('Calibration points are too close together')
      return
    }

    const nextCellPx = Math.max(8, Math.min(520, distancePx))
    const nextCellScale = nextCellPx / mapDimension
    const startPxX = gridCalibrateStart.x * mapWidth
    const startPxY = gridCalibrateStart.y * mapHeight
    const nextOffsetX = ((startPxX % nextCellPx) + nextCellPx) % nextCellPx
    const nextOffsetY = ((startPxY % nextCellPx) + nextCellPx) % nextCellPx

    setMaps((prev) =>
      prev.map((map) =>
        map.id === selectedMap.id
          ? {
            ...map,
            gridCellScale: nextCellScale,
            gridOffsetX: nextOffsetX / mapWidth,
            gridOffsetY: nextOffsetY / mapHeight,
            gridUnitsPerCell: 10,
            gridCalibrated: true,
          }
          : map,
      ),
    )
    await updateDoc(campaignDocRef(db, { campaignId, groupId }, 'maps', selectedMap.id), {
      gridCellScale: nextCellScale,
      gridOffsetX: nextOffsetX / mapWidth,
      gridOffsetY: nextOffsetY / mapHeight,
      gridUnitsPerCell: 10,
      gridCalibrated: true,
      updatedAt: serverTimestamp(),
    })
    setGridCalibratePreview(null)
    setGridCalibrateSavedAt(Date.now())
    setGridCalibratePulse(true)
  }

  const autoDetectHex = async (preferredType: 'hex-pointy' | 'hex-flat' = 'hex-pointy') => {
    if (!selectedMap || role !== 'gm' || !selectedMap.imageUrl) return
    setHexDetecting(true)
    setHexDetectConfidence(null)
    try {
      const { result: detected, debug } = await detectHexGridFromImageWithDebug(selectedMap.imageUrl)
      console.groupCollapsed('[hex-detect]', selectedMap.name || selectedMap.id)
      console.info('debug', debug)
      console.groupEnd()
      if (!detected) {
        setMapError('Could not detect a hex grid. Entering manual hex adjust mode.')
        setGridTypeOverrides((prev) => ({ ...prev, [selectedMap.id]: preferredType }))
        setGridAdjustMode(true)
        setGridAdjustSavedAt(0)
        setGridAdjustDraft({
          gridEnabled: true,
          gridVisible: true,
          gridCellScale: selectedMap.gridCellScale || DEFAULT_GRID_CELL_SCALE,
          gridOffsetX: selectedMap.gridOffsetX || 0,
          gridOffsetY: selectedMap.gridOffsetY || 0,
          gridType: preferredType,
        })
        return
      }

      setHexDetectConfidence(detected.confidence)
      setGridTypeOverrides((prev) => ({ ...prev, [selectedMap.id]: detected.gridType }))
      setGridAdjustMode(true)
      setGridAdjustDraft({
        gridEnabled: true,
        gridVisible: true,
        gridCellScale: detected.gridCellScale,
        gridOffsetX: detected.gridOffsetX,
        gridOffsetY: detected.gridOffsetY,
        gridType: detected.gridType,
      })
      setMapError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Hex detection failed'
      setMapError(message)
      setGridAdjustMode(true)
    } finally {
      setHexDetecting(false)
    }
  }

  const toggleGridCalibrateMode = () => {
    if (gridCalibrateMode) {
      resetGridCalibrationDraft()
      setGridCalibrateMode(false)
      resetDistanceTracker()
      if (selectedMap?.gridCalibrated) {
        setMaps((prev) => prev.map((map) => (map.id === selectedMap.id ? { ...map, gridCalibrated: false } : map)))
        void updateDoc(campaignDocRef(db, { campaignId, groupId }, 'maps', selectedMap.id), {
          gridCalibrated: false,
          updatedAt: serverTimestamp(),
        }).catch((error) => {
          const message = error instanceof Error ? error.message : 'Failed to clear grid calibration'
          setMapError(message)
        })
      }
      return
    }
    setGridAdjustMode(false)
    if (gridMeasureMode) {
      setGridMeasureMode(false)
      resetGridMeasurementDraft()
    }
    resetGridCalibrationDraft()
    setGridCalibrateMode(true)
  }

  const toggleGridMeasureMode = () => {
    if (gridMeasureMode) {
      resetGridMeasurementDraft()
      setGridMeasureMode(false)
      return
    }
    if (gridCalibrateMode) {
      setGridCalibrateMode(false)
      resetGridCalibrationDraft()
    }
    setGridAdjustMode(false)
    resetGridMeasurementDraft()
    setGridMeasureMode(true)
  }

  const toggleGridVisibility = async () => {
    if (!selectedMap || role !== 'gm') return
    if (gridAdjustMode) {
      setGridAdjustDraft((current) =>
        current
          ? { ...current, gridVisible: !current.gridVisible }
          : {
            gridEnabled: true,
            gridVisible: !(selectedMap.gridVisible !== false),
            gridCellScale: selectedMap.gridCellScale,
            gridOffsetX: selectedMap.gridOffsetX,
            gridOffsetY: selectedMap.gridOffsetY,
            gridType: selectedMap.gridType ?? 'square',
          },
      )
      return
    }
    const nextVisible = selectedMap.gridVisible === false
    setMaps((prev) => prev.map((map) => (map.id === selectedMap.id ? { ...map, gridVisible: nextVisible } : map)))
    try {
      await updateDoc(campaignDocRef(db, { campaignId, groupId }, 'maps', selectedMap.id), {
        gridVisible: nextVisible,
        updatedAt: serverTimestamp(),
      })
    } catch (error) {
      setMaps((prev) => prev.map((map) => (map.id === selectedMap.id ? { ...map, gridVisible: !nextVisible } : map)))
      const message = error instanceof Error ? error.message : 'Failed to update grid visibility'
      setMapError(message)
    }
  }

  const handleGridLayerWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (role !== 'gm' || !selectedMap || !gridAdjustMode || !effectiveGridEnabled) return
    const mapWidth = Math.max(1, inlineBaseSize.width)
    const mapHeight = Math.max(1, inlineBaseSize.height)
    const mapDimension = Math.max(1, Math.min(mapWidth, mapHeight))
    if (mapDimension <= 0) return

    const currentCellPx = Math.max(8, Math.round(effectiveGridCellScale * mapDimension))
    const scaleFactor = Math.exp(-event.deltaY * 0.0025)
    const nextCellPx = Math.max(8, Math.min(520, currentCellPx * scaleFactor))
    if (!Number.isFinite(nextCellPx) || nextCellPx === currentCellPx) return

    const layerRect = event.currentTarget.getBoundingClientRect()
    const cursorX = event.clientX - layerRect.left
    const cursorY = event.clientY - layerRect.top
    const currentOffsetX = effectiveGridOffsetX * mapWidth
    const currentOffsetY = effectiveGridOffsetY * mapHeight
    const nextOffsetX = cursorX - ((cursorX - currentOffsetX) / currentCellPx) * nextCellPx
    const nextOffsetY = cursorY - ((cursorY - currentOffsetY) / currentCellPx) * nextCellPx

    event.preventDefault()
    event.stopPropagation()

    setGridAdjustDraft((current) =>
      current
        ? {
          ...current,
          gridCellScale: nextCellPx / mapDimension,
          gridOffsetX: nextOffsetX / mapWidth,
          gridOffsetY: nextOffsetY / mapHeight,
        }
        : current,
    )
  }

  const handleGridLayerMouseDown = (event: React.MouseEvent<HTMLDivElement>): boolean => {
    if (role !== 'gm' || !selectedMap || !gridAdjustMode || !effectiveGridEnabled) return false
    if (gridCalibrateMode) return false
    if (event.button !== 0) return false
    event.preventDefault()
    event.stopPropagation()
    setGridAlignDrag({
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: effectiveGridOffsetX,
      startOffsetY: effectiveGridOffsetY,
    })
    return true
  }

  const handleGridCalibrateMouseMove = (clientX: number, clientY: number) => {
    if (!gridCalibrateMode || !gridCalibrateStart || gridCalibrateEnd) return
    const point = getTokenDropPointRef.current(clientX, clientY)
    if (!point) return
    setGridCalibratePreview(point)
  }

  const handleGridMeasureMouseMove = (clientX: number, clientY: number) => {
    if (!gridMeasureMode || !gridMeasureStart || gridMeasureEnd) return
    const point = getTokenDropPointRef.current(clientX, clientY)
    if (!point) return
    setGridMeasurePreview(point)
  }

  const handleGridCalibrateHandleMouseDown = (
    event: React.MouseEvent<HTMLButtonElement>,
    handle: 'start' | 'end',
  ) => {
    if (!gridCalibrateMode) return
    event.preventDefault()
    event.stopPropagation()
    setGridCalibrateDraggingHandle(handle)
  }

  const handleGridMeasureHandleMouseDown = (
    event: React.MouseEvent<HTMLButtonElement>,
    handle: 'start' | 'end',
  ) => {
    if (!gridMeasureMode) return
    event.preventDefault()
    event.stopPropagation()
    setGridMeasureDraggingHandle(handle)
  }

  const handleGridCalibrateClick = (clientX: number, clientY: number): boolean => {
    if (role !== 'gm' || !selectedMap) return false
    const point = getTokenDropPointRef.current(clientX, clientY)
    if (!point) return true

    if (!gridCalibrateStart) {
      setGridCalibrateStart(point)
      setGridCalibrateEnd(null)
      setGridCalibratePreview(null)
      setGridCalibrateSavedAt(0)
      return true
    }

    if (!gridCalibrateEnd) {
      setGridCalibrateEnd(point)
      setGridCalibratePreview(null)
      setGridCalibrateSavedAt(0)
      return true
    }
    return true
  }

  const handleGridMeasureClick = (clientX: number, clientY: number): boolean => {
    if (role !== 'gm' || !selectedMap) return false
    const point = getTokenDropPointRef.current(clientX, clientY)
    if (!point) return true

    if (!gridMeasureStart || (gridMeasureStart && gridMeasureEnd)) {
      setGridMeasureStart(point)
      setGridMeasureEnd(null)
      setGridMeasurePreview(null)
      return true
    }

    setGridMeasureEnd(point)
    setGridMeasurePreview(null)
    return true
  }

  // --- Effects ---

  // Grid offset drag via mouse move/up
  useEffect(() => {
    if (!gridAlignDrag || !selectedMap || role !== 'gm' || !gridAdjustMode) return

    const handleMove = (event: MouseEvent) => {
      const mapWidth = Math.max(1, inlineBaseSize.width)
      const mapHeight = Math.max(1, inlineBaseSize.height)
      const nextOffsetX = gridAlignDrag.startOffsetX + (event.clientX - gridAlignDrag.startClientX) / mapWidth
      const nextOffsetY = gridAlignDrag.startOffsetY + (event.clientY - gridAlignDrag.startClientY) / mapHeight
      setGridAdjustDraft((current) =>
        current
          ? { ...current, gridOffsetX: nextOffsetX, gridOffsetY: nextOffsetY }
          : current,
      )
    }

    const handleUp = () => setGridAlignDrag(null)

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [gridAdjustMode, gridAlignDrag, inlineBaseSize.height, inlineBaseSize.width, role, selectedMap])

  // Calibration handle drag
  useEffect(() => {
    if (!gridCalibrateDraggingHandle || !gridCalibrateMode) return
    const handleMove = (event: MouseEvent) => {
      const point = getTokenDropPointRef.current(event.clientX, event.clientY)
      if (!point) return
      if (gridCalibrateDraggingHandle === 'start') {
        setGridCalibrateStart(point)
      } else {
        setGridCalibrateEnd(point)
      }
      setGridCalibrateSavedAt(0)
    }
    const handleUp = () => setGridCalibrateDraggingHandle(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [gridCalibrateDraggingHandle, gridCalibrateMode])

  useEffect(() => {
    if (!gridMeasureDraggingHandle || !gridMeasureMode) return
    const handleMove = (event: MouseEvent) => {
      const point = getTokenDropPointRef.current(event.clientX, event.clientY)
      if (!point) return
      if (gridMeasureDraggingHandle === 'start') {
        setGridMeasureStart(point)
        if (!gridMeasureEnd) setGridMeasurePreview(point)
      } else {
        setGridMeasureEnd(point)
      }
    }
    const handleUp = () => setGridMeasureDraggingHandle(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [gridMeasureDraggingHandle, gridMeasureEnd, gridMeasureMode])

  // Initialize adjust draft when entering adjust mode without a draft
  useEffect(() => {
    if (!gridAdjustMode || gridAdjustDraft || !selectedMap) return
    setGridAdjustDraft({
      gridEnabled: true,
      gridVisible: true,
      gridCellScale: DEFAULT_GRID_CELL_SCALE,
      gridOffsetX: 0,
      gridOffsetY: 0,
      gridType: selectedMap.gridType ?? 'square',
    })
  }, [gridAdjustDraft, gridAdjustMode, selectedMap])

  // Escape key exits calibrate or measure mode
  useEffect(() => {
    if (!gridCalibrateMode && !gridMeasureMode) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (gridCalibrateMode) {
        setGridCalibrateMode(false)
        resetGridCalibrationDraft()
      }
      if (gridMeasureMode) {
        setGridMeasureMode(false)
        resetGridMeasurementDraft()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gridCalibrateMode, gridMeasureMode])

  // Auto-dismiss calibrate mode after save
  useEffect(() => {
    if (!gridCalibrateSavedAt) return
    const timer = window.setTimeout(() => {
      setGridCalibrateSavedAt(0)
      setGridCalibrateMode(false)
      setGridCalibrateStart(null)
      setGridCalibrateEnd(null)
      setGridCalibratePreview(null)
      setGridCalibrateDraggingHandle(null)
    }, 1600)
    return () => window.clearTimeout(timer)
  }, [gridCalibrateSavedAt])

  // Auto-dismiss adjust mode after save
  useEffect(() => {
    if (!gridAdjustSavedAt) return
    const timer = window.setTimeout(() => {
      setGridAdjustSavedAt(0)
      setGridAdjustMode(false)
      setGridAdjustDraft(null)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [gridAdjustSavedAt])

  // Calibration success pulse animation
  useEffect(() => {
    if (!gridCalibratePulse) return
    const timer = window.setTimeout(() => setGridCalibratePulse(false), 650)
    return () => window.clearTimeout(timer)
  }, [gridCalibratePulse])

  // Reset all grid tool state — call when the selected map changes.
  const resetGrid = () => {
    setGridAdjustMode(false)
    setGridAdjustDraft(null)
    setGridAdjustSavedAt(0)
    setGridAlignDrag(null)
    setGridCalibrateMode(false)
    resetGridCalibrationDraft()
    setGridMeasureMode(false)
    resetGridMeasurementDraft()
    setHexDetecting(false)
    setHexDetectConfidence(null)
  }

  return {
    // State
    gridCalibrateMode,
    gridMeasureMode,
    gridAdjustMode,
    gridAdjustDraft,
    gridCalibrateStart,
    gridCalibrateEnd,
    gridCalibratePreview,
    gridMeasureStart,
    gridMeasureEnd,
    gridMeasurePreview,
    gridCalibrateDraggingHandle,
    gridMeasureDraggingHandle,
    gridCalibrateSavedAt,
    gridAdjustSavedAt,
    gridCalibratePulse,
    hexDetecting,
    hexDetectConfidence,
    gridAlignDrag,
    // Derived effective values
    effectiveGridEnabled,
    effectiveGridVisible,
    effectiveGridCellScale,
    effectiveGridOffsetX,
    effectiveGridOffsetY,
    effectiveGridType,
    selectedMapGridType,
    // Handlers
    toggleGridAdjustMode,
    toggleGridCalibrateMode,
    toggleGridMeasureMode,
    toggleGridVisibility,
    setGridType,
    applyGridAdjust,
    applyGridCalibration,
    autoDetectHex,
    resetGrid,
    resetGridCalibrationDraft,
    handleGridLayerWheel,
    handleGridLayerMouseDown,
    handleGridCalibrateClick,
    handleGridMeasureClick,
    handleGridCalibrateMouseMove,
    handleGridMeasureMouseMove,
    handleGridCalibrateHandleMouseDown,
    handleGridMeasureHandleMouseDown,
  }
}
