import { useEffect, useState, type CSSProperties } from 'react'
import type { PackState, PetPack } from '../lib/desktop'
import { packStateLabels, resolvePackClip, samplePackClip } from './pack-motion'

export function PackCharacter({ pack, motion, size, reducedMotion, replayKey, showCue }: {
  pack: PetPack; motion: PackState; size: number; reducedMotion: boolean; replayKey: number | string; showCue: boolean
}) {
  const { key, clip } = resolvePackClip(pack, motion)
  const loop = motion !== 'love' && motion !== 'celebrate'
  const identity = `${clip.src}:${motion}:${replayKey}:${clip.durations.join(',')}:${clip.stillFrame}`
  const [current, setCurrent] = useState({ identity, frame: 0 })
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let timer: ReturnType<typeof setTimeout> | undefined
    let started = performance.now()
    const tick = () => {
      clearTimeout(timer)
      const next = samplePackClip(clip, performance.now() - started, loop, reducedMotion || media.matches)
      setCurrent({ identity, frame: next.frame })
      if (!document.hidden && Number.isFinite(next.nextIn)) timer = setTimeout(tick, Math.max(16, next.nextIn))
    }
    const restart = () => { started = performance.now(); tick() }
    media.addEventListener('change', restart)
    document.addEventListener('visibilitychange', restart)
    tick()
    return () => { clearTimeout(timer); media.removeEventListener('change', restart); document.removeEventListener('visibilitychange', restart) }
    // identity encodes all clip values affecting the schedule; state broadcasts must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, reducedMotion])
  const frame = current.identity === identity ? current.frame : samplePackClip(clip, 0, loop, reducedMotion).frame
  return <div className="pet-character pet-imported" style={{ '--pet-size': `${size}px` } as CSSProperties} data-motion={motion} data-clip={key} data-pose={frame}>
    <svg className="pet-sprite" viewBox={`0 0 ${clip.frameWidth} ${clip.frameHeight}`} role="img" aria-label={`${pack.name} · ${packStateLabels[motion]}`}>
      <svg width={clip.frameWidth} height={clip.frameHeight} viewBox={`${frame % clip.columns * clip.frameWidth} ${Math.floor(frame / clip.columns) * clip.frameHeight} ${clip.frameWidth} ${clip.frameHeight}`} overflow="hidden">
        <image href={clip.src} width={clip.width} height={clip.height}/>
      </svg>
    </svg>
    {showCue && <span className="pet-motion-cue">{packStateLabels[motion]} · {key === 'idle' && motion !== 'idle' ? '使用待机动作' : key}</span>}
  </div>
}
