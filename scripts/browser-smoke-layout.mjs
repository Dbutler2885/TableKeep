/** The desktop sheet must fit vertically and keep its existing action row on one line. */
export function assertDesktopSheetFits(name, height, visible, row) {
  if (row.children.some((child) => Math.abs(child.top - row.children[0].top) > 1 || child.right > row.right + 1)) throw new Error('The name-band actions wrap or overflow at the desktop smoke width.')
  if (height > visible) throw new Error(`The ${name} page is ${height}px tall in a ${visible}px pane.`)
}
