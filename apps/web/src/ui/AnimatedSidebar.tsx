import { m, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { forwardRef } from 'react'

/**
 * Adapted from starc007/ui-components `animated-sidebar`.
 * The MoneyDance variant keeps only the desktop width morph so navigation
 * behavior stays owned by React Router and no application state is persisted.
 */
export interface AnimatedSidebarProps extends Omit<HTMLMotionProps<'aside'>, 'animate' | 'initial' | 'transition'> {
  collapsed: boolean
  expandedWidth?: number
  collapsedWidth?: number
}

export const AnimatedSidebar = forwardRef<HTMLElement, AnimatedSidebarProps>(function AnimatedSidebar(
  {
    collapsed,
    expandedWidth = 232,
    collapsedWidth = 76,
    children,
    ...props
  },
  ref,
) {
  const reduceMotion = useReducedMotion()

  return <m.aside
    {...props}
    ref={ref}
    initial={false}
    data-state={collapsed ? 'collapsed' : 'expanded'}
    animate={{ width: collapsed ? collapsedWidth : expandedWidth }}
    transition={reduceMotion
      ? { duration: 0 }
      : { type: 'spring', stiffness: 380, damping: 35, mass: 0.75 }}
  >
    {children}
  </m.aside>
})
