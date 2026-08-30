import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadAttendanceRecords } from '../lib/attendance'
import { loadProfile } from '../lib/profile'
import { STORAGE_CHANGED_EVENT, keys, loadJSON } from '../lib/storage'
import {
  ackWidgetActions,
  consumeWidgetLaunchTarget,
  getPendingWidgetActions,
  isWidgetBridgeAvailable,
  syncWidgetSnapshot,
} from '../lib/widgetBridge'
import { applyWidgetActions } from '../lib/widgetActions'
import { buildWidgetSnapshot } from '../lib/widgetState'
import { loadWorkRecords } from '../lib/work'
import type { ActiveOvertime } from '../types'

const SYNC_DEBOUNCE_MS = 180
const SAFE_LAUNCH_TARGET = /^\/(?:$|(?:slacking|overtime)(?:[/?#]|$))/
const WIDGET_STORAGE_KEYS = new Set([
  keys.profile,
  keys.workRecords,
  keys.attendanceRecords,
  keys.activeSlacking,
  keys.activeOvertime,
])
const IMMEDIATE_WIDGET_STORAGE_KEYS = new Set([keys.activeSlacking, keys.activeOvertime])

interface WidgetSyncOutcome {
  acknowledgedActions: boolean
  launchTarget: string | null
}

let currentSync: Promise<WidgetSyncOutcome> | null = null
let rerunRequested = false

function createSnapshot() {
  return buildWidgetSnapshot({
    profile: loadProfile(),
    workRecords: loadWorkRecords(),
    attendanceRecords: loadAttendanceRecords(),
    activeSlacking: loadJSON<string | null>(keys.activeSlacking, null),
    activeOvertime: loadJSON<ActiveOvertime | null>(keys.activeOvertime, null),
  })
}

export async function performWidgetSync(): Promise<WidgetSyncOutcome> {
  let acknowledgedActions = false
  let launchTarget: string | null = null

  const actions = await getPendingWidgetActions()
  const applied = applyWidgetActions(actions)
  if (!applied.success) return { acknowledgedActions, launchTarget }

  // Passing the applied IDs lets native storage atomically commit this snapshot
  // and remove exactly that batch. The explicit ack remains an idempotent
  // protocol confirmation; actions queued during this sync stay pending.
  await syncWidgetSnapshot(createSnapshot(), applied.actionIds)
  if (applied.actionIds.length > 0) {
    acknowledgedActions = await ackWidgetActions(applied.actionIds)
  }

  const requestedTarget = await consumeWidgetLaunchTarget()
  if (requestedTarget && SAFE_LAUNCH_TARGET.test(requestedTarget)) launchTarget = requestedTarget
  return { acknowledgedActions, launchTarget }
}

function queueWidgetSync(): Promise<WidgetSyncOutcome> {
  if (currentSync) {
    rerunRequested = true
    return currentSync
  }

  currentSync = (async () => {
    let outcome: WidgetSyncOutcome = { acknowledgedActions: false, launchTarget: null }
    do {
      rerunRequested = false
      const next = await performWidgetSync()
      outcome = {
        acknowledgedActions: outcome.acknowledgedActions || next.acknowledgedActions,
        launchTarget: next.launchTarget ?? outcome.launchTarget,
      }
    } while (rerunRequested)
    return outcome
  })().finally(() => {
    currentSync = null
  })
  return currentSync
}

export function WidgetSyncController() {
  const navigate = useNavigate()
  const debounceRef = useRef<number | null>(null)
  const reloadStartedRef = useRef(false)
  const lifecycleRef = useRef(0)

  const sync = useCallback(() => {
    if (!isWidgetBridgeAvailable() || reloadStartedRef.current) return
    const lifecycle = lifecycleRef.current
    void queueWidgetSync().then(outcome => {
      // A StrictMode cleanup or a real unmount can leave an in-flight native
      // call behind. Only the currently mounted effect may navigate or reload.
      if (lifecycle !== lifecycleRef.current || reloadStartedRef.current) return
      if (outcome.acknowledgedActions) {
        reloadStartedRef.current = true
        if (outcome.launchTarget) window.history.replaceState(null, '', outcome.launchTarget)
        window.location.reload()
        return
      }
      if (outcome.launchTarget) navigate(outcome.launchTarget, { replace: true })
    }).catch(() => undefined)
  }, [navigate])

  const scheduleSync = useCallback(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null
      sync()
    }, SYNC_DEBOUNCE_MS)
  }, [sync])

  const flushSync = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    sync()
  }, [sync])

  useEffect(() => {
    if (!isWidgetBridgeAvailable()) return
    const lifecycle = lifecycleRef.current + 1
    lifecycleRef.current = lifecycle
    // Android may freeze WebView timers as soon as the app is backgrounded.
    // Flush both visible and hidden transitions so a just-started timer reaches
    // native storage and can start its foreground ticker immediately.
    const onVisibilityChange = () => flushSync()
    const onStorage = (event: Event) => {
      const key = typeof StorageEvent !== 'undefined' && event instanceof StorageEvent
        ? event.key
        : (event as CustomEvent<{ key?: unknown }>).detail?.key
      if (key === null) {
        scheduleSync()
        return
      }
      if (typeof key !== 'string' || !WIDGET_STORAGE_KEYS.has(key)) return
      if (IMMEDIATE_WIDGET_STORAGE_KEYS.has(key)) flushSync()
      else scheduleSync()
    }

    flushSync()
    window.addEventListener('focus', sync)
    window.addEventListener('pageshow', sync)
    window.addEventListener('pagehide', flushSync)
    window.addEventListener('storage', onStorage)
    window.addEventListener(STORAGE_CHANGED_EVENT, onStorage)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      if (lifecycleRef.current === lifecycle) lifecycleRef.current += 1
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      window.removeEventListener('focus', sync)
      window.removeEventListener('pageshow', sync)
      window.removeEventListener('pagehide', flushSync)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(STORAGE_CHANGED_EVENT, onStorage)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [flushSync, scheduleSync, sync])

  return null
}
