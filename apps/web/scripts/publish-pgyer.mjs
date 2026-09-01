import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const API_ORIGIN = 'https://www.pgyer.com'
const EXPECTED_IDENTIFIER = 'com.cshouuu.moneydance'
const PUBLISHING_CODE = 1247
const POLL_ATTEMPTS = 30

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function validateShortcut(value) {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(value)) {
    throw new Error('PGYER_APP_SHORTCUT must use 4-64 letters, numbers, underscores, or hyphens')
  }
  return value
}

async function responseJson(response, operation) {
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error(`${operation} returned non-JSON HTTP ${response.status}`)
  }
  if (!response.ok) throw new Error(`${operation} failed with HTTP ${response.status}`)
  return payload
}

function assertApiSuccess(payload, operation) {
  if (payload?.code !== 0 || !payload.data) {
    const code = Number.isFinite(payload?.code) ? payload.code : 'unknown'
    const message = typeof payload?.message === 'string' ? payload.message : 'no detail'
    throw new Error(`${operation} failed: PGYER_${code}: ${message}`)
  }
  return payload.data
}

async function getUploadTarget(apiKey, updateDescription) {
  const body = new URLSearchParams({
    _api_key: apiKey,
    buildType: 'android',
    oversea: '2',
    buildInstallType: '1',
    buildInstallDate: '2',
    buildUpdateDescription: updateDescription,
  })
  const response = await fetch(`${API_ORIGIN}/apiv2/app/getCOSToken`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(30_000),
  })
  return assertApiSuccess(await responseJson(response, 'getCOSToken'), 'getCOSToken')
}

async function uploadApk(target, apkPath) {
  const endpoint = new URL(String(target.endpoint || ''))
  if (endpoint.protocol !== 'https:') throw new Error('Pgyer returned a non-HTTPS upload endpoint')
  if (!target.key || !target.params || typeof target.params !== 'object') {
    throw new Error('Pgyer upload target is missing required fields')
  }

  const apk = await readFile(apkPath)
  const fileName = basename(apkPath)
  const body = new FormData()
  for (const [name, value] of Object.entries(target.params)) {
    if (value !== undefined && value !== null) body.append(name, String(value))
  }
  if (!Object.hasOwn(target.params, 'key')) body.append('key', String(target.key))
  body.append('x-cos-meta-file-name', fileName)
  body.append('file', new Blob([apk], { type: 'application/vnd.android.package-archive' }), fileName)

  const response = await fetch(endpoint, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`Pgyer APK upload failed with HTTP ${response.status}`)
  return String(target.key)
}

async function waitForBuild(apiKey, buildKey) {
  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    const url = new URL('/apiv2/app/buildInfo', API_ORIGIN)
    url.searchParams.set('_api_key', apiKey)
    url.searchParams.set('buildKey', buildKey)
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    const payload = await responseJson(response, 'buildInfo')
    if (payload?.code === 0 && payload.data) return payload.data
    if (payload?.code !== PUBLISHING_CODE) {
      const code = Number.isFinite(payload?.code) ? payload.code : 'unknown'
      const message = typeof payload?.message === 'string' ? payload.message : 'no detail'
      throw new Error(`buildInfo failed: PGYER_${code}: ${message}`)
    }
    if (attempt < POLL_ATTEMPTS) await delay(4_000)
  }
  throw new Error('Pgyer did not finish publishing within 120 seconds')
}

function validateBuild(build, expectedVersion, expectedShortcut) {
  if (build.buildIdentifier !== EXPECTED_IDENTIFIER) {
    throw new Error(`Unexpected Pgyer package identifier: ${build.buildIdentifier || 'missing'}`)
  }
  if (build.buildVersion !== expectedVersion) {
    throw new Error(`Unexpected Pgyer version: ${build.buildVersion || 'missing'}`)
  }
  if (build.buildShortcutUrl !== expectedShortcut) {
    throw new Error(`Unexpected Pgyer shortcut: ${build.buildShortcutUrl || 'missing'}`)
  }
  if (!/^[A-Za-z0-9]+$/.test(String(build.buildKey || ''))) {
    throw new Error('Pgyer returned an invalid buildKey')
  }
}

const apiKey = requiredEnv('PGYER_API_KEY')
const expectedShortcut = validateShortcut(requiredEnv('PGYER_APP_SHORTCUT'))
const expectedVersion = requiredEnv('PGYER_EXPECTED_VERSION')
const apkPath = resolve(requiredEnv('PGYER_APK_PATH'))
const updateDescription = process.env.PGYER_UPDATE_DESCRIPTION?.trim() || `Money Dance Android release v${expectedVersion}`

const target = await getUploadTarget(apiKey, updateDescription)
const pendingBuildKey = await uploadApk(target, apkPath)
const build = await waitForBuild(apiKey, pendingBuildKey)
validateBuild(build, expectedVersion, expectedShortcut)

const release = {
  version: build.buildVersion,
  versionCode: String(build.buildVersionNo),
  buildKey: build.buildKey,
  shortcut: build.buildShortcutUrl,
  releasePageUrl: `${API_ORIGIN}/${build.buildShortcutUrl}`,
  publishedAt: build.buildUpdated || build.buildCreated || '',
}
await writeFile('release/pgyer-release.json', `${JSON.stringify(release, null, 2)}\n`)

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, [
    `version=${release.version}`,
    `version_code=${release.versionCode}`,
    `build_key=${release.buildKey}`,
    `release_page_url=${release.releasePageUrl}`,
    '',
  ].join('\n'))
}

console.log(`Pgyer release published: version=${release.version}, shortcut=${release.shortcut}`)
