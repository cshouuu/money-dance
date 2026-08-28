import { useEffect } from 'react'

interface ViewportSnapshot {
  scrollX: number
  scrollY: number
  bodyOverflow: string
  bodyPosition: string
  bodyTop: string
  bodyLeft: string
  bodyRight: string
  bodyWidth: string
  rootOverflow: string
}

let activeLocks = 0
let snapshot: ViewportSnapshot | null = null

export function useModalViewport(open: boolean) {
  useEffect(() => {
    if (!open) return

    if (activeLocks === 0) {
      snapshot = {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        bodyOverflow: document.body.style.overflow,
        bodyPosition: document.body.style.position,
        bodyTop: document.body.style.top,
        bodyLeft: document.body.style.left,
        bodyRight: document.body.style.right,
        bodyWidth: document.body.style.width,
        rootOverflow: document.documentElement.style.overflow,
      }
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.top = `-${snapshot.scrollY}px`
      document.body.style.left = `-${snapshot.scrollX}px`
      document.body.style.right = '0'
      document.body.style.width = '100%'
    }
    activeLocks += 1

    return () => {
      activeLocks = Math.max(0, activeLocks - 1)
      if (activeLocks > 0 || !snapshot) return

      const lockedViewport = snapshot
      snapshot = null
      document.documentElement.style.overflow = lockedViewport.rootOverflow
      document.body.style.overflow = lockedViewport.bodyOverflow
      document.body.style.position = lockedViewport.bodyPosition
      document.body.style.top = lockedViewport.bodyTop
      document.body.style.left = lockedViewport.bodyLeft
      document.body.style.right = lockedViewport.bodyRight
      document.body.style.width = lockedViewport.bodyWidth
      window.scrollTo(lockedViewport.scrollX, lockedViewport.scrollY)
    }
  }, [open])
}
