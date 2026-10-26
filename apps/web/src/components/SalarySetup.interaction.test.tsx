// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { workProfileForDate } from '@salary-flow/core'
import App from '../App'
import { loadProfile } from '../lib/profile'
import { loadChinaHolidaySettings } from '../lib/attendance'
import { toLocalDateValue } from '../lib/form'

// happy-dom's partial Web Animations implementation cannot complete Motion's
// accelerated exit promises. Exercise Motion's real JavaScript animation path.
vi.hoisted(() => Reflect.deleteProperty(Element.prototype, 'animate'))

let root: Root

function control(label: string): HTMLElement {
  const text = [...document.querySelectorAll<HTMLElement>('.beui-field-label')]
    .find(node => node.textContent === label)
  const labelElement = text?.tagName === 'LABEL' ? text : text?.closest('label')
  const element = document.getElementById(labelElement?.getAttribute('for') ?? '')
  if (!element) throw new Error(`Missing control: ${label}`)
  return element
}

function button(text: string): HTMLButtonElement {
  const element = [...document.querySelectorAll('button')].find(node => node.textContent?.trim() === text)
  if (!element) throw new Error(`Missing button: ${text}`)
  return element
}

async function click(element: HTMLElement) {
  await act(async () => element.click())
}

async function fill(label: string, value: string) {
  const element = control(label)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function visibleOverlay(selector: string) {
  await act(async () => {
    await vi.waitFor(() => {
      const element = document.querySelector(selector)
      expect(element).not.toBeNull()
      // A mounted, transparent beUI overlay still intercepts clicks. Checking
      // its opacity catches the missing Motion runtime rather than just the DOM.
      expect(Number(getComputedStyle(element!).opacity)).toBeGreaterThanOrEqual(0.99)
    }, { timeout: 2000, interval: 20 })
  })
}

async function closedOverlay(selector: string) {
  await vi.waitFor(async () => {
    await act(async () => {})
    expect(document.querySelectorAll(selector).length).toBe(0)
  }, { timeout: 2000 })
}

async function choosePicker(label: string, parts: Record<string, string>) {
  await click(control(label))
  await visibleOverlay('.beui-picker-backdrop')
  await visibleOverlay('.beui-picker-dialog')
  const dialog = document.querySelector('[role="dialog"]')!
  for (const [wheel, value] of Object.entries(parts)) {
    const list = dialog.querySelector(`[role="listbox"][aria-label="${wheel}"]`)!
    const option = [...list.querySelectorAll<HTMLButtonElement>('[role="option"]')]
      .find(node => node.textContent === value)!
    await click(option)
    expect(option.getAttribute('aria-selected')).toBe('true')
  }
  await click(button('完成'))
  await closedOverlay('[role="dialog"]')
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<App/>))
  await click(button('继续设置'))
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('first-launch beUI settings interactions', () => {
  it('opens visible date/time pickers before the main shell mounts and applies each chosen value', async () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    await choosePicker('开始记薪日期', {
      年: `${yesterday.getFullYear()}年`, 月: `${yesterday.getMonth() + 1}月`, 日: `${yesterday.getDate()}日`,
    })
    expect(control('开始记薪日期').textContent).toContain(`${yesterday.getFullYear()}年${yesterday.getMonth() + 1}月${yesterday.getDate()}日`)
    for (const [label, hour, minute] of [
      ['上班时间', '10', '30'], ['下班时间', '19', '15'],
      ['午休开始', '12', '15'], ['午休结束', '13', '15'],
    ]) {
      await choosePicker(label, { 时: `${hour}时`, 分: `${minute}分` })
      expect(control(label).textContent).toContain(`${hour}:${minute}`)
    }
  }, 20_000)

  it('shows the workweek menu and lets switches hide and restore lunch settings', async () => {
    await click(control('每周工作安排'))
    await visibleOverlay('.beui-select-popover')
    await click(button('周一至周六（单休）'))
    await closedOverlay('.beui-select-popover')
    expect(control('每周工作安排').textContent).toContain('周一至周六（单休）')
    const lunch = document.querySelector<HTMLButtonElement>('[role="switch"][aria-label="设置不计薪午休"]')!
    await click(lunch)
    expect(lunch.getAttribute('aria-checked')).toBe('false')
    expect(document.body.textContent).not.toContain('午休开始')
    await click(lunch)
    expect(lunch.getAttribute('aria-checked')).toBe('true')
    expect(control('午休开始')).not.toBeNull()
    const holidays = document.querySelector<HTMLButtonElement>('[role="switch"][aria-label="同步中国法定节假日"]')!
    await click(holidays)
    expect(holidays.getAttribute('aria-checked')).toBe('false')
  }, 10_000)

  it('saves the selected rules and completes first launch without losing the form values', async () => {
    await fill('工作空间名称', '设置验收主业')
    await fill('月薪金额', '10485.76')
    await fill('每月发薪日（可选）', '10')
    await choosePicker('上班时间', { 时: '10时', 分: '30分' })
    await click(control('每周工作安排'))
    await visibleOverlay('.beui-select-popover')
    await click(button('周一至周六（单休）'))
    await closedOverlay('.beui-select-popover')
    await click(document.querySelector<HTMLButtonElement>('[aria-label="设置不计薪午休"]')!)
    await click(document.querySelector<HTMLButtonElement>('[aria-label="同步中国法定节假日"]')!)
    await click(button('保存并开始使用'))
    expect(document.body.textContent).not.toContain('从你的真实工资开始')
    expect(document.querySelector('a[href="/spaces"]')).not.toBeNull()
    const profile = workProfileForDate(loadProfile(), toLocalDateValue())
    expect(profile.salary).toBe(10485.76)
    expect(profile.payday).toBe(10)
    expect(profile.workStartTime).toBe('10:30')
    expect(profile.workDaysPerWeek).toBe(6)
    expect(profile.breakPeriods).toEqual([])
    expect(loadChinaHolidaySettings().enabled).toBe(false)
  }, 10_000)
})
