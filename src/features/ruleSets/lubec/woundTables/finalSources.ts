// The final wound tables and their shared terms, agreed by the captain and the
// content writer on 2026-11-15/16. Each file sits byte for byte in `final/`, as
// the conformance test's input; the SHA-256 recorded here is the content
// version every wound transcribed from it carries, so a saved wound always
// names the exact words it was read from.

export const LUBEC_FINAL_SOURCES = {
  'blunt-force.md': '1119f06019776514d8ed05c20b2c6642ac9fa1402729b313fffe0c47bded916a',
  'cutting.md': '96452e6c863f2a3ee238a5f96aee6ce328ef1ad8dcd216ce0aee01b0c68466ed',
  'fisticuffs.md': '5a338bc45b6b8fec3f54d32e69b7a0ea943bb9c2911bf56fb2d0f10f396e4324',
  'gunshot.md': '7e5ecfb1d42ff351976bc5988c26e534f96f107b98c6836e3e63608d002f5578',
  'piercing.md': '15f915b10962e32c230777731a671300c548f0729d380b765fc658200701cdc2',
  'terms.md': 'f1390d25154482bfe60abe597e5240aec9ae725c453a15a6d02b8fa5d70316d9',
  'thrown.md': '26b86847f3d41e311602d2f4deefa482913d976eff3855277fae99e4ef664a0c',
} as const

export type LubecFinalSource = keyof typeof LUBEC_FINAL_SOURCES

/** "blunt-force.md@1119f060": the file and the start of its hash, as a saved wound records it. */
export const lubecContentVersion = (file: LubecFinalSource): string => `${file}@${LUBEC_FINAL_SOURCES[file].slice(0, 8)}`
