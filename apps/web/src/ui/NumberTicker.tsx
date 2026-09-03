import { animate, motion, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import './ui-components.css'

const EASE_OUT = [0.16, 1, 0.3, 1] as const
const DIGIT_HEIGHT_EM = 1.1
const DIGITS = Array.from({ length: 10 }, (_, digit) => digit)

/** MoneyDance color-neutral adaptation of starc007/ui-components `number-ticker`. */
export interface NumberTickerProps {
  value: number
  duration?: number
  stagger?: number
  startOnView?: boolean
  prefix?: string
  suffix?: string
  blur?: boolean
  className?: string
  format?: (value: number) => string
}

export function NumberTicker({
  value,
  duration = 0.65,
  stagger = 0.025,
  startOnView = true,
  prefix,
  suffix,
  blur = false,
  className = '',
  format,
}: NumberTickerProps) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const inView = useInView(containerRef, { once: true, amount: 0.6 })
  const [armed, setArmed] = useState(!startOnView)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (startOnView && inView) setArmed(true)
  }, [inView, startOnView])

  const text = useMemo(() => {
    const rounded = Math.round(value)
    return format ? format(rounded) : rounded.toString()
  }, [format, value])

  const glyphs = useMemo(() => {
    const characters = text.split('')
    return characters.map((character, index) => ({
      character,
      id: `glyph-${characters.length - 1 - index}`,
    }))
  }, [text])

  useEffect(() => {
    if (!armed || entered) return
    const timeout = window.setTimeout(() => setEntered(true), (duration + glyphs.length * stagger) * 1000)
    return () => window.clearTimeout(timeout)
  }, [armed, duration, entered, glyphs.length, stagger])

  const readableText = `${prefix ?? ''}${text}${suffix ?? ''}`

  return <span ref={containerRef} className={`beui-number-ticker ${className}`.trim()}>
    <span className="beui-number-ticker-readable">{readableText}</span>
    <span aria-hidden="true" className="beui-number-ticker-glyphs">
      {prefix && <span>{prefix}</span>}
      {glyphs.map(({ character, id }, index) => /\d/.test(character)
        ? <Digit
            key={id}
            digit={armed ? Number(character) : 0}
            delay={entered ? 0 : index * stagger}
            duration={duration}
            blur={blur}
          />
        : <span key={id} className="beui-number-ticker-symbol">{character}</span>)}
      {suffix && <span>{suffix}</span>}
    </span>
  </span>
}

function Digit({
  digit,
  delay,
  duration,
  blur,
}: {
  digit: number
  delay: number
  duration: number
  blur: boolean
}) {
  const reduceMotion = useReducedMotion()
  const columnRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (reduceMotion || !blur || !columnRef.current || !Number.isFinite(digit)) return
    const node = columnRef.current
    const controls = animate(node, { filter: ['blur(7px)', 'blur(0px)'] }, {
      duration: Math.min(duration * 0.7, 0.28),
      delay,
      ease: EASE_OUT,
    })
    return () => {
      controls.stop()
      node.style.filter = 'blur(0px)'
    }
  }, [blur, delay, digit, duration, reduceMotion])

  return <span className="beui-number-ticker-digit" style={{ height: `${DIGIT_HEIGHT_EM}em`, width: '1ch' }}>
    <motion.span
      ref={columnRef}
      initial={{ y: 0 }}
      animate={{ y: `-${digit * DIGIT_HEIGHT_EM}em` }}
      transition={reduceMotion ? { duration: 0 } : { duration, delay, ease: EASE_OUT }}
      className="beui-number-ticker-column"
    >
      {DIGITS.map(item => <span key={item} style={{ height: `${DIGIT_HEIGHT_EM}em` }}>{item}</span>)}
    </motion.span>
  </span>
}
