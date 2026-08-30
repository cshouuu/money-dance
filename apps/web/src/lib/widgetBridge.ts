import { parseWidgetActions, type WidgetAction } from './widgetActions'
import type { WidgetSnapshot } from './widgetState'

interface CapacitorBridge {
  getPlatform?: () => string
  nativePromise?: <T>(plugin: string, method: string, options?: Record<string, unknown>) => Promise<T>
}

interface WidgetBridgeWindow extends Window {
  Capacitor?: CapacitorBridge
}

interface PendingActionsResult {
  actions?: unknown
}

interface LaunchTargetResult {
  target?: unknown
}

export interface WidgetBridgeStatus {
  widgetCount: number
  realtimeEnabled: boolean
  serviceRunning: boolean
}

function capacitor(): CapacitorBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as WidgetBridgeWindow).Capacitor
}

function nativePromise() {
  return capacitor()?.nativePromise
}

export function isWidgetBridgeAvailable(): boolean {
  const bridge = capacitor()
  if (typeof bridge?.nativePromise !== 'function') return false
  const platform = bridge.getPlatform?.()
  const androidUserAgent = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
  return platform === 'android' || (!platform && androidUserAgent)
}

async function nativeCall<T>(method: string, options: Record<string, unknown> = {}): Promise<T | undefined> {
  if (!isWidgetBridgeAvailable()) return undefined
  const call = nativePromise()
  if (!call) return undefined
  return call<T>('WidgetBridge', method, options)
}

function uniqueActionIds(actionIds: string[]): string[] {
  return [...new Set(actionIds.filter(id => id.trim().length > 0))]
}

/** Sends one versioned snapshot; web/PWA builds intentionally do nothing. */
export async function syncWidgetSnapshot(snapshot: WidgetSnapshot, appliedActionIds: string[] = []): Promise<boolean> {
  if (!isWidgetBridgeAvailable()) return false
  await nativeCall('syncSnapshot', {
    snapshot: JSON.stringify(snapshot),
    appliedActionIds: uniqueActionIds(appliedActionIds),
  })
  return true
}

export async function getPendingWidgetActions(): Promise<WidgetAction[]> {
  const result = await nativeCall<PendingActionsResult>('getPendingActions')
  return parseWidgetActions(result?.actions)
}

export async function ackWidgetActions(actionIds: string[]): Promise<boolean> {
  const uniqueIds = uniqueActionIds(actionIds)
  if (!isWidgetBridgeAvailable() || uniqueIds.length === 0) return false
  await nativeCall('ackActions', { actionIds: uniqueIds })
  return true
}

export async function consumeWidgetLaunchTarget(): Promise<string | null> {
  const result = await nativeCall<LaunchTargetResult>('consumeLaunchTarget')
  return typeof result?.target === 'string' && result.target.length > 0 ? result.target : null
}

export async function setWidgetRealtimeEnabled(enabled: boolean): Promise<boolean> {
  if (!isWidgetBridgeAvailable()) return false
  await nativeCall('setRealtimeEnabled', { enabled })
  return true
}

export async function getWidgetBridgeStatus(): Promise<WidgetBridgeStatus | null> {
  const result = await nativeCall<Partial<WidgetBridgeStatus>>('getStatus')
  if (!result) return null
  const widgetCount = typeof result.widgetCount === 'number' && Number.isFinite(result.widgetCount)
    ? Math.max(0, Math.floor(result.widgetCount))
    : 0
  return {
    widgetCount,
    realtimeEnabled: result.realtimeEnabled === true,
    serviceRunning: result.serviceRunning === true,
  }
}
