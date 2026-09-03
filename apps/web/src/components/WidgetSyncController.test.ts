import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  getPendingWidgetActions: vi.fn(),
  applyWidgetActions: vi.fn(),
  syncWidgetSnapshot: vi.fn(),
  ackWidgetActions: vi.fn(),
  consumeWidgetLaunchTarget: vi.fn(),
  loadProfile: vi.fn(),
  loadWorkRecords: vi.fn(),
  loadAttendanceRecords: vi.fn(),
  loadJSON: vi.fn(),
  buildWidgetSnapshot: vi.fn(),
}))

vi.mock('../lib/widgetBridge', () => ({
  isWidgetBridgeAvailable: () => true,
  getPendingWidgetActions: mocks.getPendingWidgetActions,
  syncWidgetSnapshot: mocks.syncWidgetSnapshot,
  ackWidgetActions: mocks.ackWidgetActions,
  consumeWidgetLaunchTarget: mocks.consumeWidgetLaunchTarget,
}))

vi.mock('../lib/widgetActions', () => ({ applyWidgetActions: mocks.applyWidgetActions }))
vi.mock('../lib/profile', () => ({ loadProfile: mocks.loadProfile }))
vi.mock('../lib/work', () => ({ loadWorkRecords: mocks.loadWorkRecords }))
vi.mock('../lib/attendance', () => ({ loadAttendanceRecords: mocks.loadAttendanceRecords }))
vi.mock('../lib/overtime', () => ({ loadActiveOvertime: mocks.loadJSON }))
vi.mock('../lib/widgetState', () => ({ buildWidgetSnapshot: mocks.buildWidgetSnapshot }))
vi.mock('../lib/storage', () => ({
  STORAGE_CHANGED_EVENT: 'money-dance:storage-changed',
  keys: {
    profile: 'profile',
    workRecords: 'work-records',
    attendanceRecords: 'attendance-records',
    activeSlacking: 'active-slacking',
    activeOvertime: 'active-overtime',
  },
  loadJSON: mocks.loadJSON,
}))

import { performWidgetSync } from './WidgetSyncController'

describe('widget sync transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.order.length = 0
    mocks.getPendingWidgetActions.mockImplementation(async () => {
      mocks.order.push('read-actions')
      return [{ actionId: 'action-1' }]
    })
    mocks.applyWidgetActions.mockImplementation(() => {
      mocks.order.push('apply-actions')
      return { success: true, changed: true, actionIds: ['action-1'] }
    })
    mocks.loadProfile.mockImplementation(() => {
      mocks.order.push('read-web-state')
      return { profile: true }
    })
    mocks.loadWorkRecords.mockReturnValue([])
    mocks.loadAttendanceRecords.mockReturnValue([])
    mocks.loadJSON.mockReturnValue(null)
    mocks.buildWidgetSnapshot.mockImplementation(() => {
      mocks.order.push('build-snapshot')
      return { version: 1 }
    })
    mocks.syncWidgetSnapshot.mockImplementation(async () => {
      mocks.order.push('sync-snapshot')
      return true
    })
    mocks.ackWidgetActions.mockImplementation(async () => {
      mocks.order.push('ack-actions')
      return true
    })
    mocks.consumeWidgetLaunchTarget.mockImplementation(async () => {
      mocks.order.push('consume-target')
      return '/overtime?start=1'
    })
  })

  it('applies, mirrors, and only then acknowledges an action batch', async () => {
    await expect(performWidgetSync()).resolves.toEqual({
      acknowledgedActions: true,
      launchTarget: '/overtime?start=1',
    })
    expect(mocks.order).toEqual([
      'read-actions',
      'apply-actions',
      'read-web-state',
      'build-snapshot',
      'sync-snapshot',
      'ack-actions',
      'consume-target',
    ])
    expect(mocks.syncWidgetSnapshot).toHaveBeenCalledWith({ version: 1 }, ['action-1'])
  })

  it('does not mirror or acknowledge when applying local storage fails', async () => {
    mocks.applyWidgetActions.mockImplementation(() => {
      mocks.order.push('apply-actions')
      return { success: false, changed: false, actionIds: [] }
    })

    await expect(performWidgetSync()).resolves.toEqual({
      acknowledgedActions: false,
      launchTarget: null,
    })
    expect(mocks.order).toEqual(['read-actions', 'apply-actions'])
    expect(mocks.syncWidgetSnapshot).not.toHaveBeenCalled()
    expect(mocks.ackWidgetActions).not.toHaveBeenCalled()
  })

  it.each([
    ['rejects', () => mocks.ackWidgetActions.mockRejectedValue(new Error('bridge closed'))],
    ['returns false', () => mocks.ackWidgetActions.mockResolvedValue(false)],
  ])('still reloads durable actions when the redundant acknowledgement %s', async (_label, arrange) => {
    arrange()

    await expect(performWidgetSync()).resolves.toEqual({
      acknowledgedActions: true,
      launchTarget: '/overtime?start=1',
    })
    expect(mocks.syncWidgetSnapshot).toHaveBeenCalledWith({ version: 1 }, ['action-1'])
    expect(mocks.ackWidgetActions).toHaveBeenCalledWith(['action-1'])
  })

  it('does not request a reload when native snapshot commit returns false', async () => {
    mocks.syncWidgetSnapshot.mockResolvedValue(false)

    await expect(performWidgetSync()).resolves.toEqual({
      acknowledgedActions: false,
      launchTarget: null,
    })
    expect(mocks.ackWidgetActions).not.toHaveBeenCalled()
    expect(mocks.consumeWidgetLaunchTarget).not.toHaveBeenCalled()
  })

  it('drops an unsafe native launch target', async () => {
    mocks.consumeWidgetLaunchTarget.mockResolvedValue('https://example.com')

    await expect(performWidgetSync()).resolves.toMatchObject({ launchTarget: null })
  })

  it('accepts the native root target used to refresh an expired snapshot', async () => {
    mocks.consumeWidgetLaunchTarget.mockResolvedValue('/')

    await expect(performWidgetSync()).resolves.toMatchObject({ launchTarget: '/' })
  })
})
