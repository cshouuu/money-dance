interface ViewportBounds {
  top: number
  left: number
  width: number
  height: number
}

/** Fixed-position menus must fit the space on their chosen side of the trigger. */
export function selectPopoverPosition(
  trigger: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>,
  optionCount: number,
  viewport: ViewportBounds,
) {
  const margin = 8
  const gap = 7
  const bottom = viewport.top + viewport.height - margin
  const top = viewport.top + margin
  const estimatedHeight = Math.min(280, optionCount * 45 + 10)
  const spaceAbove = Math.max(0, trigger.top - top - gap)
  const spaceBelow = Math.max(0, bottom - trigger.bottom - gap)
  const placement = spaceBelow < estimatedHeight && spaceAbove > spaceBelow ? 'top' : 'bottom'
  const maxHeight = Math.min(280, placement === 'top' ? spaceAbove : spaceBelow)
  const height = Math.min(estimatedHeight, maxHeight)
  const width = Math.min(Math.max(180, trigger.width), Math.max(0, viewport.width - margin * 2))
  return {
    top: Math.max(top, Math.min(placement === 'bottom' ? trigger.bottom + gap : trigger.top - height - gap, bottom - height)),
    left: Math.max(viewport.left + margin, Math.min(trigger.left, viewport.left + viewport.width - width - margin)),
    width,
    maxHeight,
    placement,
  }
}
