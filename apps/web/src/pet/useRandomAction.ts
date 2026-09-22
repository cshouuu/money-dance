import { useEffect, useState } from 'react'
import type { PetPack } from '../lib/desktop'
import { nextRandomAction, randomActions, type RandomAction } from './random-actions'

export function useRandomAction(pack: PetPack | null | undefined, enabled: boolean, paused: boolean) {
  const pool = JSON.stringify(randomActions(pack))
  const [current, setCurrent] = useState<{ pool: string; action: RandomAction; id: number } | null>(null)
  useEffect(() => {
    if (!enabled || paused) return
    const actions: RandomAction[] = JSON.parse(pool)
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let timer: ReturnType<typeof setTimeout> | undefined
    let previous: string | undefined
    const tick = () => {
      clearTimeout(timer)
      if (document.hidden || media.matches) return
      const action = nextRandomAction(actions, previous)
      if (!action) return
      previous = action.key
      setCurrent({ pool, action, id: performance.now() })
      // Finish a complete sequence before choosing the next action.
      timer = setTimeout(tick, Math.max(1000, action.duration))
    }
    tick()
    document.addEventListener('visibilitychange', tick)
    media.addEventListener('change', tick)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', tick); media.removeEventListener('change', tick) }
  }, [pool, enabled, paused])
  return enabled && current?.pool === pool ? current : null
}
