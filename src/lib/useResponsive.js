import { useEffect, useState } from 'react'

const getViewportInfo = () => {
  if (typeof window === 'undefined') {
    return { isMobile: false, isTablet: false }
  }

  const width = window.innerWidth
  return {
    isMobile: width <= 768,
    isTablet: width <= 1024
  }
}

export const useResponsive = () => {
  const [viewport, setViewport] = useState(getViewportInfo)

  useEffect(() => {
    const handleResize = () => setViewport(getViewportInfo())
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return viewport
}
