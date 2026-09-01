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
  releasePageUrl: string
  publishedAt: string
}

interface NativeReleaseResult extends Partial<AndroidRelease> {
  found: boolean
}

interface NativeOpenResult {
  status: 'opened'
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

export function isTrustedPgyerReleasePage(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' &&
      parsed.hostname === 'www.pgyer.com' &&
      parsed.port === '' &&
      /^\/[A-Za-z0-9_-]{4,64}$/.test(parsed.pathname) &&
      parsed.search === '' &&
      parsed.hash === '' &&
      parsed.username === '' &&
      parsed.password === ''
  } catch {
    return false
  }
}

function isTrustedRelease(release: NativeReleaseResult): release is NativeReleaseResult & AndroidRelease {
  return Boolean(
    release.found &&
    release.tag &&
    release.version &&
    release.title !== undefined &&
    release.notes !== undefined &&
    release.releasePageUrl &&
    isTrustedPgyerReleasePage(release.releasePageUrl) &&
    release.publishedAt !== undefined,
  )
}

function errorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '')
  }
  return ''
}

export function formatAndroidUpdateError(error: unknown) {
  const message = errorText(error)
  if (/SocketTimeout|timed out|failed to connect|UnknownHost|NETWORK/i.test(message)) {
    return '当前网络无法连接蒲公英更新服务，请切换网络后重试，或直接打开蒲公英下载页。'
  }
  if (/PGYER_PAGE_FORMAT_CHANGED|PGYER_APP_MISMATCH|PGYER_PAGE_TOO_LARGE/i.test(message)) {
    return '暂时无法读取蒲公英版本信息，请直接打开蒲公英下载页查看。'
  }
  return '检查更新暂时失败，请稍后重试，或直接打开蒲公英下载页。'
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
    releasePageUrl: release.releasePageUrl,
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

export async function openPgyerReleasePage() {
  return nativeCall<NativeOpenResult>('openReleasePage')
}
