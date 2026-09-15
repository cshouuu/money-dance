import { useEffect, useState } from 'react'
import { samplePetMotion, type PetMotion } from './motion'

export function usePetMotion(motion: PetMotion, reducedMotion: boolean, replayKey: number | string = 0) {
  const [frame, setFrame] = useState(() => samplePetMotion(motion, 0, reducedMotion))
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let timer: ReturnType<typeof setTimeout> | undefined
    let started = performance.now()
    const tick = () => {
      if (timer !== undefined) clearTimeout(timer)
      const next = samplePetMotion(motion, performance.now() - started, reducedMotion || media.matches)
      setFrame(next)
      if (!document.hidden && Number.isFinite(next.nextIn)) timer = setTimeout(tick, Math.max(16, next.nextIn))
    }
    const restart = () => { started = performance.now(); tick() }
    media.addEventListener('change', restart)
    document.addEventListener('visibilitychange', restart)
    tick()
    return () => { clearTimeout(timer); media.removeEventListener('change', restart); document.removeEventListener('visibilitychange', restart) }
  }, [motion, reducedMotion, replayKey])
  return frame.row === samplePetMotion(motion, 0).row ? frame : samplePetMotion(motion, 0, reducedMotion)
}
