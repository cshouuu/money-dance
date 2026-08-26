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

interface NativeReleaseResult extends Partial<AndroidRelease> {
  found: boolean
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

function isTrustedRelease(release: NativeReleaseResult): release is NativeReleaseResult & AndroidRelease {
  return Boolean(
    release.found &&
    release.tag &&
    release.version &&
    release.title !== undefined &&
    release.notes !== undefined &&
    release.apkName?.endsWith('.apk') &&
    release.apkUrl?.startsWith(RELEASE_ASSET_PREFIX) &&
    release.htmlUrl !== undefined &&
    release.publishedAt !== undefined,
  )
}

export async function fetchLatestAndroidRelease(): Promise<AndroidRelease | null> {
  const release = await nativeCall<NativeReleaseResult>('getLatestRelease')
  if (!release.found) return null
  if (!isTrustedRelease(release)) throw new Error('UNTRUSTED_RELEASE_METADATA')
  return {
    tag: release.tag,
    version: release.version,
    title: release.title,
    notes: release.notes,
    apkName: release.apkName,
    apkUrl: release.apkUrl,
    htmlUrl: release.htmlUrl,
    publishedAt: release.publishedAt,
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
