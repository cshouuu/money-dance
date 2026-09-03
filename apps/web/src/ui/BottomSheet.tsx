import {
  AnimatePresence,
  m,
  type PanInfo,
  useDragControls,
  useReducedMotion,
} from 'motion/react'
import { X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './ui-components.css'

const DRAWER_EASE = [0.32, 0.72, 0, 1] as const
const DRAWER_TRANSITION = { duration: 0.46, ease: DRAWER_EASE } as const

/**
 * Adapted from starc007/ui-components `bottom-sheet`.
 * Preserves its iOS-safe scroll lock, portal mounting and drag-to-dismiss
 * interaction while using MoneyDance color tokens instead of Tailwind theme
 * classes.
 */
export interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children?: ReactNode
  className?: string
  dismissThreshold?: number
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = '',
  dismissThreshold = 96,
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const dragControls = useDragControls()
  const reduceMotion = useReducedMotion()
  const uid = useId()
  const titleId = `${uid}-title`
  const descriptionId = `${uid}-description`

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return

    const body = document.body
    const scrollY = window.scrollY
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousBodyStyle = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    }

    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'

    const focusFrame = window.requestAnimationFrame(() => sheetRef.current?.focus({ preventScroll: true }))
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onOpenChange(false)
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      body.style.position = previousBodyStyle.position
      body.style.top = previousBodyStyle.top
      body.style.left = previousBodyStyle.left
      body.style.right = previousBodyStyle.right
      body.style.width = previousBodyStyle.width
      body.style.overflow = previousBodyStyle.overflow
      window.scrollTo(0, scrollY)
      previousFocusRef.current?.focus({ preventScroll: true })
    }
  }, [open, onOpenChange])

  const onDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.velocity.y > 600 || info.offset.y > dismissThreshold) onOpenChange(false)
  }

  if (!mounted) return null

  return createPortal(
    <AnimatePresence initial={false}>
      {open && <m.button
        key="bottom-sheet-backdrop"
        type="button"
        className="beui-bottom-sheet-backdrop"
        aria-label={`关闭${title}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={reduceMotion ? { duration: 0.14 } : DRAWER_TRANSITION}
        onClick={() => onOpenChange(false)}
      />}
      {open && <m.div
        key="bottom-sheet-panel"
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`beui-bottom-sheet ${className}`.trim()}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.02, bottom: 0.38 }}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
        animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
        transition={reduceMotion ? { duration: 0.14 } : DRAWER_TRANSITION}
      >
        <div className="beui-bottom-sheet-header">
          <button
            type="button"
            className="beui-bottom-sheet-handle"
            aria-label="向下拖动可关闭"
            onPointerDown={event => dragControls.start(event)}
          >
            <span />
          </button>
          <div className="beui-bottom-sheet-heading">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description && <p id={descriptionId}>{description}</p>}
            </div>
            <button type="button" className="beui-bottom-sheet-close" aria-label="关闭" onClick={() => onOpenChange(false)}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="beui-bottom-sheet-content">{children}</div>
      </m.div>}
    </AnimatePresence>,
    document.body,
  )
}
