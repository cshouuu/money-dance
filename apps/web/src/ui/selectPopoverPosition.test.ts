import { describe, expect, it } from 'vitest'
import { selectPopoverPosition } from './selectPopoverPosition'

describe('select popover viewport bounds', () => {
  it('keeps the attendance leave list above the lower screen edge', () => {
    const menu = selectPopoverPosition({ top: 245, bottom: 305, left: 37, width: 271 }, 11, { top: 0, left: 0, width: 360, height: 560 })
    expect(menu.placement).toBe('bottom')
    expect(menu.top).toBe(312)
    expect(menu.maxHeight).toBe(240)
    expect(menu.top + menu.maxHeight).toBeLessThanOrEqual(552)
  })

  it('uses available space above a trigger near the bottom', () => {
    const menu = selectPopoverPosition({ top: 240, bottom: 288, left: 20, width: 320 }, 30, { top: 0, left: 0, width: 360, height: 320 })
    expect(menu.placement).toBe('top')
    expect(menu.top).toBe(8)
    expect(menu.maxHeight).toBe(225)
    expect(menu.top + menu.maxHeight).toBeLessThan(240)
  })

  it('fits the visible viewport when a keyboard reduces and offsets it', () => {
    const menu = selectPopoverPosition({ top: 160, bottom: 208, left: 15, width: 340 }, 30, { top: 100, left: 10, width: 300, height: 240 })
    expect(menu.top).toBeGreaterThanOrEqual(108)
    expect(menu.top + menu.maxHeight).toBeLessThanOrEqual(332)
    expect(menu.left).toBeGreaterThanOrEqual(18)
    expect(menu.left + menu.width).toBeLessThanOrEqual(302)
  })

  it('keeps a short menu close to its trigger instead of reserving the full height', () => {
    const menu = selectPopoverPosition({ top: 400, bottom: 448, left: 20, width: 200 }, 2, { top: 0, left: 0, width: 360, height: 480 })
    expect(menu.placement).toBe('top')
    expect(menu.top).toBe(293)
  })
})
