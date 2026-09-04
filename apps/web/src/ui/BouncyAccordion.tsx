import { ChevronDown } from 'lucide-react'
import { m, useReducedMotion } from 'motion/react'
import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './BouncyAccordion.css'

export type BouncyAccordionItem = {
  id: string
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  disabled?: boolean
}
export function BouncyAccordion({ items, value, onValueChange, collapsible = true, className = '' }: {
  items: BouncyAccordionItem[]
  value: string | null
  onValueChange: (value: string | null) => void
  collapsible?: boolean
  className?: string
}) {
  const reduce = useReducedMotion()
  const baseId = useId()
  const activeIndex = items.findIndex(item => item.id === value)
  const toggle = useCallback((id: string) => {
    if (value === id) {
      if (collapsible) onValueChange(null)
      return
    }
    onValueChange(id)
  }, [collapsible, onValueChange, value])

  return <div className={`beui-accordion ${className}`.trim()}>
    {items.map((item, index) => {
      const open = value === item.id
      return <AccordionRow
        key={item.id}
        item={item}
        open={open}
        startsGroup={open || index === 0 || activeIndex === index - 1}
        endsGroup={open || index === items.length - 1 || activeIndex === index + 1}
        separated={index > 0 && (open || activeIndex === index - 1)}
        contentId={`${baseId}-${item.id}-content`}
        triggerId={`${baseId}-${item.id}-trigger`}
        reduce={Boolean(reduce)}
        onToggle={() => toggle(item.id)}
      />
    })}
  </div>
}

function AccordionRow({ item, open, startsGroup, endsGroup, separated, contentId, triggerId, reduce, onToggle }: {
  item: BouncyAccordionItem
  open: boolean
  startsGroup: boolean
  endsGroup: boolean
  separated: boolean
  contentId: string
  triggerId: string
  reduce: boolean
  onToggle: () => void
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  useLayoutEffect(() => {
    const node = contentRef.current
    if (!node) return
    const update = () => setHeight(node.offsetHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const transition = reduce ? { duration: 0 } : { type: 'spring' as const, duration: 0.54, bounce: 0.28 }

  return <m.div className="beui-accordion-row" layout="position" initial={false} style={{ marginTop: separated ? 12 : 0 }} transition={transition}>
    <m.section
      className="beui-accordion-item"
      data-state={open ? 'open' : 'closed'}
      initial={false}
      animate={{
        borderTopLeftRadius: startsGroup ? 24 : 0,
        borderTopRightRadius: startsGroup ? 24 : 0,
        borderBottomLeftRadius: endsGroup ? 24 : 0,
        borderBottomRightRadius: endsGroup ? 24 : 0,
      }}
      transition={transition}
    >
      <button id={triggerId} type="button" className="beui-accordion-trigger" disabled={item.disabled} aria-expanded={open} aria-controls={contentId} onClick={onToggle}>
        {item.icon && <span className="beui-accordion-icon" aria-hidden="true">{item.icon}</span>}
        <span className="beui-accordion-title">{item.title}</span>
        <m.span className="beui-accordion-chevron" aria-hidden="true" animate={{ rotate: open ? 180 : 0 }} transition={transition}><ChevronDown size={17}/></m.span>
      </button>
      <m.div
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        aria-hidden={!open}
        inert={!open}
        className="beui-accordion-content"
        initial={false}
        style={{ height: open && item.description ? height : 0 }}
        transition={transition}
      >
        <m.div ref={contentRef} className="beui-accordion-content-inner" animate={{ opacity: open ? 1 : 0 }} transition={reduce ? { duration: 0 } : { duration: 0.18 }}>
          {item.description}
        </m.div>
      </m.div>
    </m.section>
  </m.div>
}
