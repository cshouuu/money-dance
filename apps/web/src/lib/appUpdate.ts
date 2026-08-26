const RELEASES_PROXY_API = 'https://salary-flow-api.vercel.app/api/app-release/latest'
const RELEASE_ASSET_PREFIX = 'https://github.com/cshouuu/money-dance/releases/download/'

interface CapacitorBridge {
  getPlatform?: () => string
  nativePromise?: <T>(plugin: string, method: string, options?: Record<string, unknown>) => Promise<T>
}

declare global {
  interface Window {
    Capacitor?: CapacitorBridge
  }
}

export interface InstalledAppVersion {
  versionName: string
  versionCode: number
}

export interface AndroidRelease {
  tag: string
  version: string
  title: string
  notes: string
  apkName: string
  apkUrl: string
  htmlUrl: string
  publishedAt: string
}

interface ReleaseProxyResponse {
  ok?: boolean
  data?: AndroidRelease | null
  error?: string
}

interface NativeUpdateResult {
  status: 'downloading' | 'permission_required'
}

function bridge() {
  return window.Capacitor
}

export function isAndroidNative() {
  const capacitor = bridge()
  if (!capacitor?.nativePromise) return false
  const platform = capacitor.getPlatform?.()
  return platform === 'android' || (!platform && /Android/i.test(navigator.userAgent))
}

async function nativeCall<T>(method: string, options: Record<string, unknown> = {}) {
  const nativePromise = bridge()?.nativePromise
  if (!nativePromise) throw new Error('ANDROID_NATIVE_BRIDGE_UNAVAILABLE')
  return nativePromise<T>('AppUpdater', method, options)
}

export async function getInstalledAppVersion(): Promise<InstalledAppVersion> {
  return nativeCall<InstalledAppVersion>('getVersion')
}

function normalizeVersion(value: string) {
  return value.trim().replace(/^v/i, '').split('-')[0]
}

function versionParts(value: string) {
  return normalizeVersion(value).split('.').map(part => {
    const parsed = Number.parseInt(part, 10)
    return Number.isFinite(parsed) ? parsed : 0
  })
}

export function compareVersions(left: string, right: string) {
  const a = versionParts(left)
  const b = versionParts(right)
  const length = Math.max(a.length, b.length, 3)
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0)
    if (delta !== 0) return delta > 0 ? 1 : -1
  }
  return 0
}

function isTrustedRelease(release: AndroidRelease) {
  return Boolean(
    release.tag &&
    release.version &&
    release.apkName?.endsWith('.apk') &&
    release.apkUrl?.startsWith(RELEASE_ASSET_PREFIX),
  )
}

export async function fetchLatestAndroidRelease(): Promise<AndroidRelease | null> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(`${RELEASES_PROXY_API}?t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`RELEASE_PROXY_FAILED_${response.status}`)

    const payload = await response.json() as ReleaseProxyResponse
    if (!payload.ok) throw new Error(payload.error || 'RELEASE_PROXY_FAILED')
    if (!payload.data) return null
    if (!isTrustedRelease(payload.data)) throw new Error('UNTRUSTED_RELEASE_METADATA')
    return payload.data
  } finally {
    window.clearTimeout(timer)
  }
}

export async function checkForAndroidUpdate() {
  if (!isAndroidNative()) return null
  const [current, latest] = await Promise.all([
    getInstalledAppVersion(),
    fetchLatestAndroidRelease(),
  ])
  return {
    current,
    latest,
    hasUpdate: Boolean(latest && compareVersions(latest.version, current.versionName) > 0),
  }
}

export async function installAndroidRelease(release: AndroidRelease) {
  if (!release.apkUrl.startsWith(RELEASE_ASSET_PREFIX)) throw new Error('UNTRUSTED_UPDATE_URL')
  return nativeCall<NativeUpdateResult>('downloadAndInstall', {
    url: release.apkUrl,
    fileName: release.apkName,
  })
}
