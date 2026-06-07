import tablekeepLogo from '../../../logo/Tablekeep.svg'

type BrandWordmarkProps = {
  className?: string
  logoPosition?: 'between' | 'after'
}

export function BrandWordmark({ className = '', logoPosition = 'between' }: BrandWordmarkProps) {
  const logo = <img className="brand-wordmark-logo" src={tablekeepLogo} alt="" aria-hidden="true" />

  return (
    <span className={`brand-wordmark ${className}`.trim()} aria-label="Table Keep">
      {logoPosition === 'between' ? (
        <>
          <span>Table</span>
          {logo}
          <span>Keep</span>
        </>
      ) : (
        <>
          <span>Table Keep</span>
          {logo}
        </>
      )}
    </span>
  )
}
