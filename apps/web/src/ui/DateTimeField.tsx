import { CalendarDays, Check, Clock3, X } from 'lucide-react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import './DateTimeField.css'

type PickerType = 'date' | 'time' | 'datetime-local'
type PickerParts = { year: number; month: number; day: number; hour: number; minute: number }
type WheelOption = { label: string; value: string }

const ITEM_HEIGHT = 38

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function toParts(value: string, type: PickerType): PickerParts {
  const now = new Date()
  const fallback: PickerParts = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  }
  if (!value) return fallback

  if (type === 'time') {
    const match = /^(\d{2}):(\d{2})/.exec(value)
    return match ? { ...fallback, hour: Number(match[1]), minute: Number(match[2]) } : fallback
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value)
  if (!match) return fallback
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? fallback.hour),
    minute: Number(match[5] ?? fallback.minute),
  }
}

function serialize(parts: PickerParts, type: PickerType) {
  const date = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
  const time = `${pad(parts.hour)}:${pad(parts.minute)}`
  return type === 'date' ? date : type === 'time' ? time : `${date}T${time}`
}

function clampIso(value: string, min?: string | number, max?: string | number) {
  const lower = typeof min === 'string' ? min.slice(0, value.length) : ''
  const upper = typeof max === 'string' ? max.slice(0, value.length) : ''
  if (lower && value < lower) return lower
  if (upper && value > upper) return upper
  return value
}

function displayValue(value: string, type: PickerType) {
  if (!value) return '请选择'
  const parts = toParts(value, type)
  if (type === 'time') return `${pad(parts.hour)}:${pad(parts.minute)}`
  const date = `${parts.year}年${parts.month}月${parts.day}日`
  return type === 'date' ? date : `${date} ${pad(parts.hour)}:${pad(parts.minute)}`
}

function range(start: number, end: number, suffix: string): WheelOption[] {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => {
    const value = String(start + index)
    return { value, label: `${value}${suffix}` }
  })
}

/** Touch-first wheel adapted from beUI `wheel-picker`. */
function WheelPicker({ label, options, value, onValueChange }: {
  label: string
  options: WheelOption[]
  value: string
  onValueChange: (value: string) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  const index = Math.max(0, options.findIndex(option => option.value === value))

  useEffect(() => {
    const node = listRef.current
    if (!node) return
    node.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'instant' })
  }, [index, options.length])

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current)
  }, [])

  const selectIndex = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(options.length - 1, nextIndex))
    const next = options[clamped]
    if (!next) return
    onValueChange(next.value)
    listRef.current?.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: 'smooth' })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'Home') return selectIndex(0)
    if (event.key === 'End') return selectIndex(options.length - 1)
    selectIndex(index + (event.key === 'ArrowDown' ? 1 : -1))
  }

  return <div className="beui-wheel-column">
    <span className="beui-wheel-label">{label}</span>
    <div className="beui-wheel-window">
      <div
        ref={listRef}
        className="beui-wheel-list"
        role="listbox"
        tabIndex={0}
        aria-label={label}
        aria-activedescendant={`${label}-${value}`}
        onKeyDown={onKeyDown}
        onScroll={event => {
          if (settleTimer.current) clearTimeout(settleTimer.current)
          const scrollTop = event.currentTarget.scrollTop
          settleTimer.current = setTimeout(() => {
            const next = options[Math.max(0, Math.min(options.length - 1, Math.round(scrollTop / ITEM_HEIGHT)))]
            if (next && next.value !== valueRef.current) onValueChange(next.value)
          }, 70)
        }}
      >
        {options.map(option => <button
          id={`${label}-${option.value}`}
          key={option.value}
          type="button"
          role="option"
          aria-selected={option.value === value}
          className="beui-wheel-option"
          onClick={() => selectIndex(options.indexOf(option))}
        >{option.label}</button>)}
      </div>
      <span className="beui-wheel-selection" aria-hidden="true" />
    </div>
  </div>
}

export interface DateTimeFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  type: PickerType
  label: string
  onValueChange: (value: string) => void
  hint?: ReactNode
  error?: string
  rootClassName?: string
}

export const DateTimeField = forwardRef<HTMLInputElement, DateTimeFieldProps>(function DateTimeField({
  type,
  label,
  value: rawValue,
  onValueChange,
  hint,
  error,
  rootClassName,
  id: idProp,
  disabled,
  required,
  min,
  max,
  name,
  ...inputProps
}, ref) {
  const id = idProp ?? useId()
  const reduce = useReducedMotion()
  const value = typeof rawValue === 'string' ? rawValue : ''
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<PickerParts>(() => toParts(value, type))

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open])

  const now = new Date()
  const minYear = typeof min === 'string' && /^\d{4}/.test(min) ? Number(min.slice(0, 4)) : 1900
  const maxYear = typeof max === 'string' && /^\d{4}/.test(max) ? Number(max.slice(0, 4)) : now.getFullYear() + 10
  const yearOptions = useMemo(() => range(minYear, Math.max(minYear, maxYear), '年'), [maxYear, minYear])
  const monthOptions = useMemo(() => range(1, 12, '月'), [])
  const dayOptions = useMemo(() => range(1, daysInMonth(draft.year, draft.month), '日'), [draft.month, draft.year])
  const hourOptions = useMemo(() => range(0, 23, '时'), [])
  const minuteOptions = useMemo(() => range(0, 59, '分'), [])

  const updateDraft = (patch: Partial<PickerParts>) => setDraft(current => {
    const next = { ...current, ...patch }
    next.day = Math.min(next.day, daysInMonth(next.year, next.month))
    return next
  })

  const openPicker = () => {
    if (disabled) return
    setDraft(toParts(value, type))
    setOpen(true)
  }

  const confirm = () => {
    const next = clampIso(serialize(draft, type), min, max)
    onValueChange(next)
    setOpen(false)
  }

  const title = type === 'date' ? `选择${label}` : type === 'time' ? `选择${label}` : `选择${label}`
  const icon = type === 'time' ? <Clock3 size={17}/> : <CalendarDays size={17}/>

  return <>
    <div className={classes('beui-field', rootClassName)}>
      <label id={`${id}-label`} className="beui-field-label" htmlFor={`${id}-trigger`}>{label}</label>
      <button
        id={`${id}-trigger`}
        type="button"
        className={classes('beui-input-shell', 'beui-date-time-trigger', error && 'error', disabled && 'disabled')}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-required={required || undefined}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error || hint ? `${id}-message` : undefined}
        onClick={openPicker}
      >
        <span className={classes('beui-date-time-value', !value && 'placeholder')}>{displayValue(value, type)}</span>
        <span className="beui-date-time-icon" aria-hidden="true">{icon}</span>
      </button>
      <input {...inputProps} ref={ref} id={id} name={name} type="hidden" value={value} disabled={disabled}/>
      {(hint || error) && <span id={`${id}-message`} className={classes('beui-field-message', error && 'error')} role={error ? 'alert' : undefined}>{error || hint}</span>}
    </div>
    {typeof document !== 'undefined' && createPortal(<AnimatePresence>{open && <m.div
      className="beui-picker-backdrop"
      role="presentation"
      initial={reduce ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={event => { if (event.currentTarget === event.target) setOpen(false) }}
    >
      <m.section
        className="beui-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-picker-title`}
        initial={reduce ? { opacity: 1 } : { opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.985 }}
        transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.7 }}
      >
        <header className="beui-picker-header">
          <div><span>{type === 'date' ? 'DATE PICKER' : type === 'time' ? 'TIME PICKER' : 'DATE & TIME'}</span><h2 id={`${id}-picker-title`}>{title}</h2></div>
          <button type="button" aria-label="关闭选择器" onClick={() => setOpen(false)}><X size={18}/></button>
        </header>
        <div className={classes('beui-picker-wheels', `type-${type}`)}>
          {type !== 'time' && <>
            <WheelPicker label="年" options={yearOptions} value={String(draft.year)} onValueChange={year => updateDraft({ year: Number(year) })}/>
            <WheelPicker label="月" options={monthOptions} value={String(draft.month)} onValueChange={month => updateDraft({ month: Number(month) })}/>
            <WheelPicker label="日" options={dayOptions} value={String(draft.day)} onValueChange={day => updateDraft({ day: Number(day) })}/>
          </>}
          {type !== 'date' && <>
            <WheelPicker label="时" options={hourOptions} value={String(draft.hour)} onValueChange={hour => updateDraft({ hour: Number(hour) })}/>
            <WheelPicker label="分" options={minuteOptions} value={String(draft.minute)} onValueChange={minute => updateDraft({ minute: Number(minute) })}/>
          </>}
        </div>
        <footer className="beui-picker-actions">
          {!required && <button type="button" className="beui-picker-clear" onClick={() => { onValueChange(''); setOpen(false) }}>清除</button>}
          <button type="button" className="beui-picker-confirm" onClick={confirm}><Check size={16}/>完成</button>
        </footer>
      </m.section>
    </m.div>}</AnimatePresence>, document.body)}
  </>
})
