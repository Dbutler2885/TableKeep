/** The worn edge of the big lettering, as printed on old paper: the filter the sheet's headings and panel bars use. */
export function LubecRoughFilter() {
  return (
    <svg width="0" height="0" className="lubec-filters" aria-hidden="true" focusable="false">
      <filter id="lubec-rough" x="-2%" y="-10%" width="104%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves={2} seed={7} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={1.8} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}
