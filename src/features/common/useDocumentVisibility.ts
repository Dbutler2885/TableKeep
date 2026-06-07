import { useEffect, useState } from 'react'

const getIsVisible = () => {
  if (typeof document === 'undefined') return true
  return document.visibilityState === 'visible'
}

export function useDocumentVisibility() {
  const [isVisible, setIsVisible] = useState(getIsVisible)

  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === 'visible')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return isVisible
}
