import { useEffect, useState } from 'react'

const getViewportInfo = () => {
  if (typeof window === 'undefined') {
    return {
      width: 1280,
      height: 720,
      isPhone: false,
      isMobile: false,
      isTablet: false,
      isCompact: false,
      isDesktop: true,
    }
  }

  const width = window.innerWidth
  const height = window.innerHeight

  const isPhone = width <= 640
  const isMobile = width <= 768
  const isTablet = width <= 1024

  return {
    width,
    height,
    isPhone,
    isMobile,
    isTablet,
    isCompact: width <= 900,
    isDesktop: width > 1024,
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
