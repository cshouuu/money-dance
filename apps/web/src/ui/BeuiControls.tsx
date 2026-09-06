import { Check, ChevronDown } from 'lucide-react'
import {
  AnimatePresence,
  MotionConfig,
  animate,
  m,
  useReducedMotion,
  type HTMLMotionProps,
} from 'motion/react'
import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { DateTimeField } from './DateTimeField'
import './BeuiControls.css'

const PRESS_SPRING = { type: 'spring', stiffness: 500, damping: 30, mass: 0.6 } as const
const LAYOUT_SPRING = { type: 'spring', stiffness: 360, damping: 32, mass: 0.6 } as const

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function useHoverCapable() {
  const [canHover, setCanHover] = useState(false)

  useEffect(() => {
    if (!window.matchMedia) return
    const query = window.matchMedia('(hover: hover) and (pointer: fine)')
    const update = () => setCanHover(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  return canHover
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant
  size?: ButtonSize
  children?: ReactNode
  ripple?: boolean
}

/** Color-adapted beUI `button-base`; keeps hover motion away from touch screens. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = 'primary',
  size = 'md',
  children,
  className,
  ripple = false,
  onPointerDown,
  ...props
}, ref) {
  const reduce = useReducedMotion()
  const canHover = useHoverCapable()
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number; size: number }>>([])
  const nextId = useRef(0)

  return <m.button
    {...props}
    ref={ref}
    type={props.type ?? 'button'}
    whileTap={reduce ? undefined : { scale: 0.96 }}
    whileHover={reduce || !canHover ? undefined : { y: -1 }}
    transition={PRESS_SPRING}
    className={classes('beui-button', `beui-button-${variant}`, `beui-button-${size}`, className)}
    onPointerDown={event => {
      if (ripple && !reduce) {
        const rect = event.currentTarget.getBoundingClientRect()
        const size = Math.max(rect.width, rect.height) * 2
        setRipples(current => [...current, {
          id: nextId.current++,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          size,
        }])
      }
      onPointerDown?.(event)
    }}
  >
    {ripple && !reduce && <span className="beui-button-ripples" aria-hidden="true">
      <AnimatePresence>{ripples.map(rippleItem => <m.span
        key={rippleItem.id}
        className="beui-button-ripple"
        style={{ left: rippleItem.x, top: rippleItem.y, width: rippleItem.size, height: rippleItem.size }}
        initial={{ scale: 0.05, opacity: 0.24, x: '-50%', y: '-50%' }}
        animate={{ scale: 1, opacity: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        onAnimationComplete={() => setRipples(current => current.filter(item => item.id !== rippleItem.id))}
      />)}</AnimatePresence>
    </span>}
    <span className="beui-button-content">{children}</span>
  </m.button>
})

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string
  onValueChange: (value: string) => void
  hint?: ReactNode
  error?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  rootClassName?: string
}

/** Color-adapted beUI text and number input branch. */
const NativeInput = forwardRef<HTMLInputElement, InputProps>(function NativeInput({
  label,
  onValueChange,
  hint,
  error,
  leftIcon,
  rightIcon,
  rootClassName,
  className,
  id: idProp,
  onFocus,
  onBlur,
  disabled,
  ...props
}, ref) {
  const id = idProp ?? useId()
  const reduce = useReducedMotion()
  const fieldRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!error || !fieldRef.current || reduce) return
    animate(fieldRef.current, { x: [0, -5, 5, -3, 3, 0] }, { duration: 0.36 })
  }, [error, reduce])

  return <label className={classes('beui-field', rootClassName)} htmlFor={id}>
    <span className="beui-field-label">{label}</span>
    <div
      ref={fieldRef}
      className={classes('beui-input-shell', focused && 'focused', error && 'error', disabled && 'disabled')}
    >
      {leftIcon && <span className="beui-input-icon left" aria-hidden="true">{leftIcon}</span>}
      <input
        {...props}
        ref={ref}
        id={id}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error || hint ? `${id}-message` : undefined}
        className={classes(Boolean(leftIcon) && 'has-left-icon', Boolean(rightIcon) && 'has-right-icon', className)}
        onChange={event => onValueChange(event.target.value)}
        onFocus={event => { setFocused(true); onFocus?.(event) }}
        onBlur={event => { setFocused(false); onBlur?.(event) }}
      />
      {rightIcon && <span className="beui-input-icon right" aria-hidden="true">{rightIcon}</span>}
    </div>
    {(hint || error) && <span id={`${id}-message`} className={classes('beui-field-message', error && 'error')} role={error ? 'alert' : undefined}>{error || hint}</span>}
  </label>
})

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(props, ref) {
  if (props.type === 'date' || props.type === 'time' || props.type === 'datetime-local') {
    const { leftIcon: _leftIcon, rightIcon: _rightIcon, className: _className, ...pickerProps } = props
    return <DateTimeField {...pickerProps} ref={ref} type={props.type as 'date' | 'time' | 'datetime-local'}/>
  }
  return <NativeInput {...props} ref={ref}/>
})

type SelectOption = { value: string; label: ReactNode; disabled: boolean }

export interface SelectFieldProps {
  label: string
  onValueChange: (value: string) => void
  hint?: ReactNode
  rootClassName?: string
  className?: string
  id?: string
  name?: string
  value?: string | number | readonly string[]
  defaultValue?: string | number | readonly string[]
  children?: ReactNode
  disabled?: boolean
  required?: boolean
}

/** Position-aware animated adaptation of beUI `select`. */
export const SelectField = forwardRef<HTMLButtonElement, SelectFieldProps>(function SelectField({
  label,
  onValueChange,
  hint,
  rootClassName,
  className,
  id: idProp,
  children,
  value: rawValue,
  defaultValue,
  name,
  disabled,
  required,
}, ref) {
  const id = idProp ?? useId()
  const reduce = useReducedMotion()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [internalValue, setInternalValue] = useState(() => String(Array.isArray(defaultValue) ? defaultValue[0] ?? '' : defaultValue ?? ''))
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, placement: 'bottom' as 'bottom' | 'top' })
  const controlled = rawValue !== undefined
  const value = String(Array.isArray(rawValue) ? rawValue[0] ?? '' : rawValue ?? internalValue)

  const options = useMemo<SelectOption[]>(() => Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>(child) || child.type !== 'option') return []
    const optionValue = String(child.props.value ?? child.props.children ?? '')
    return [{ value: optionValue, label: child.props.children, disabled: Boolean(child.props.disabled) }]
  }), [children])
  const selected = options.find(option => option.value === value) ?? options[0]

  const setRefs = (node: HTMLButtonElement | null) => {
    triggerRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const estimatedHeight = Math.min(280, options.length * 45 + 10)
    const spaceBelow = window.innerHeight - rect.bottom
    const placement = spaceBelow < estimatedHeight + 12 && rect.top > spaceBelow ? 'top' : 'bottom'
    const width = Math.max(180, rect.width)
    setPosition({
      top: placement === 'bottom' ? rect.bottom + 7 : Math.max(8, rect.top - estimatedHeight - 7),
      left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8),
      width,
      placement,
    })
  }, [options.length])

  useEffect(() => {
    if (!open) return
    updatePosition()
    const selectedIndex = Math.max(0, options.findIndex(option => option.value === value))
    setActiveIndex(selectedIndex)
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    const reposition = () => updatePosition()
    document.addEventListener('pointerdown', closeOnOutside)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, options, updatePosition, value])

  const choose = (option: SelectOption) => {
    if (option.disabled) return
    if (!controlled) setInternalValue(option.value)
    onValueChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const moveActive = (direction: 1 | -1) => {
    if (!options.length) return
    let next = activeIndex
    for (let attempts = 0; attempts < options.length; attempts += 1) {
      next = (next + direction + options.length) % options.length
      if (!options[next]?.disabled) break
    }
    setActiveIndex(next)
  }

  return <div className={classes('beui-field', rootClassName)}>
    <label id={`${id}-label`} className="beui-field-label" htmlFor={id}>{label}</label>
    <button
      ref={setRefs}
      id={id}
      type="button"
      className={classes('beui-select-shell', 'beui-select-trigger', open && 'focused', className)}
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-labelledby={`${id}-label ${id}-value`}
      aria-required={required || undefined}
      onClick={() => setOpen(current => !current)}
      onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(false); return }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          if (!open) setOpen(true)
          else moveActive(event.key === 'ArrowDown' ? 1 : -1)
          return
        }
        if (open && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          const option = options[activeIndex]
          if (option) choose(option)
        }
      }}
    >
      <span id={`${id}-value`} className="beui-select-value">{selected?.label ?? '请选择'}</span>
      <m.span className="beui-select-chevron" aria-hidden="true" animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : PRESS_SPRING}><ChevronDown size={16}/></m.span>
    </button>
    {name && <input type="hidden" name={name} value={selected?.value ?? ''}/>}
    {hint && <span className="beui-field-message">{hint}</span>}
    {typeof document !== 'undefined' && createPortal(<AnimatePresence>{open && <m.div
      ref={menuRef}
      className={classes('beui-select-popover', `placement-${position.placement}`)}
      style={{ top: position.top, left: position.left, width: position.width }}
      role="listbox"
      aria-labelledby={`${id}-label`}
      initial={reduce ? { opacity: 1 } : { opacity: 0, y: position.placement === 'bottom' ? -7 : 7, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: position.placement === 'bottom' ? -5 : 5, scale: 0.985 }}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32, mass: 0.65 }}
    >{options.map((option, index) => <button
      key={`${option.value}-${index}`}
      type="button"
      role="option"
      aria-selected={option.value === selected?.value}
      disabled={option.disabled}
      data-active={activeIndex === index || undefined}
      onPointerMove={() => setActiveIndex(index)}
      onClick={() => choose(option)}
    ><span>{option.label}</span>{option.value === selected?.value && <Check size={15}/>}</button>)}</m.div>}</AnimatePresence>, document.body)}
  </div>
})

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  ariaLabel: string
  className?: string
}

/** Color-adapted beUI `switch` with its weighted spring thumb. */
export function Switch({ checked, onCheckedChange, disabled, ariaLabel, className }: SwitchProps) {
  const reduce = useReducedMotion()
  const thumbRef = useRef<HTMLSpanElement>(null)
  const [pressed, setPressed] = useState(false)

  useEffect(() => {
    if (!disabled || !pressed || !thumbRef.current || reduce) return
    animate(thumbRef.current, { x: [0, -2, 2, -1, 0] }, { duration: 0.5 })
  }, [disabled, pressed, reduce])

  return <MotionConfig transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 800, damping: 80, mass: 4 }}>
    <m.button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      data-state={checked ? 'checked' : 'unchecked'}
      className={classes('beui-switch', className)}
      onClick={() => !disabled && onCheckedChange(!checked)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      <m.span ref={thumbRef} layout animate={{ scale: pressed && !disabled && !reduce ? 0.9 : 1 }} />
    </m.button>
  </MotionConfig>
}

type TabsContextValue = { value: string; setValue: (value: string) => void; layoutId: string }
const TabsContext = createContext<TabsContextValue | null>(null)

export function Tabs({ value, onValueChange, children, className }: { value: string; onValueChange: (value: string) => void; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  const layoutId = useId()
  const contextValue = useMemo(() => ({ value, setValue: onValueChange, layoutId }), [layoutId, onValueChange, value])
  return <MotionConfig transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 24, mass: 1.2 }}>
    <TabsContext.Provider value={contextValue}><m.div layoutRoot className={classes('beui-tabs', className)} role="tablist">{children}</m.div></TabsContext.Provider>
  </MotionConfig>
}

export function TabsTrigger({ value, children, tone, buttonRef }: { value: string; children: ReactNode; tone?: 'income' | 'expense'; buttonRef?: Ref<HTMLButtonElement> }) {
  const context = useContext(TabsContext)
  if (!context) throw new Error('TabsTrigger must be used inside Tabs')
  const active = context.value === value
  return <div className="beui-tab-slot">
    {active && <m.span layoutId={context.layoutId} className={classes('beui-tab-indicator', tone && `tone-${tone}`)} />}
    <button ref={buttonRef} type="button" role="tab" aria-selected={active} onClick={() => context.setValue(value)}>{children}</button>
  </div>
}

type ChoiceContextValue = { value: string; setValue: (value: string) => void; layoutId: string }
const ChoiceContext = createContext<ChoiceContextValue | null>(null)

export function ChoiceGroup({ value, onValueChange, legend, children, className }: { value: string; onValueChange: (value: string) => void; legend: string; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  const layoutId = useId()
  const contextValue = useMemo(() => ({ value, setValue: onValueChange, layoutId }), [layoutId, onValueChange, value])
  return <MotionConfig transition={reduce ? { duration: 0 } : LAYOUT_SPRING}>
    <fieldset className={classes('beui-choice-group', className)}><legend>{legend}</legend><ChoiceContext.Provider value={contextValue}><div className="beui-choice-grid" role="radiogroup">{children}</div></ChoiceContext.Provider></fieldset>
  </MotionConfig>
}

export function ChoiceCard({ value, title, description, badge }: { value: string; title: string; description: string; badge?: string }) {
  const context = useContext(ChoiceContext)
  if (!context) throw new Error('ChoiceCard must be used inside ChoiceGroup')
  const selected = context.value === value
  const reduce = useReducedMotion()
  return <m.button
    type="button"
    role="radio"
    aria-checked={selected}
    data-state={selected ? 'checked' : 'unchecked'}
    className="beui-choice-card"
    whileTap={reduce ? undefined : { scale: 0.985 }}
    transition={PRESS_SPRING}
    onClick={() => context.setValue(value)}
  >
    <span className="beui-choice-radio">{selected && <m.i layoutId={context.layoutId} />}</span>
    <span className="beui-choice-copy"><b>{title}{badge && <em>{badge}</em>}</b><small>{description}</small></span>
  </m.button>
}

export function Checkbox({ checked, onCheckedChange, ariaLabel, disabled, className }: { checked: boolean; onCheckedChange: (checked: boolean) => void; ariaLabel: string; disabled?: boolean; className?: string }) {
  const reduce = useReducedMotion()
  return <m.button
    type="button"
    role="checkbox"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    data-state={checked ? 'checked' : 'unchecked'}
    className={classes('beui-checkbox', className)}
    whileTap={reduce || disabled ? undefined : { scale: 0.9 }}
    transition={PRESS_SPRING}
    onClick={() => !disabled && onCheckedChange(!checked)}
  >
    <AnimatePresence initial={false}>{checked && <m.span initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}><Check size={14} strokeWidth={3}/></m.span>}</AnimatePresence>
  </m.button>
}
