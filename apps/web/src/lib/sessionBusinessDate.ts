export interface SessionStartBusinessDate {
  /** Local calendar date on the device where this session was created. */
  startLocalDate: string
  /** JavaScript Date#getTimezoneOffset at the session start instant. */
  startTimezoneOffsetMinutes?: number
}

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MIN_TIMEZONE_OFFSET_MINUTES = -14 * 60
const MAX_TIMEZONE_OFFSET_MINUTES = 12 * 60
const MINUTE_MS = 60_000

export function isSessionLocalDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = LOCAL_DATE_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

export function isSessionTimezoneOffsetMinutes(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= MIN_TIMEZONE_OFFSET_MINUTES
    && value <= MAX_TIMEZONE_OFFSET_MINUTES
}

function localDateOnCurrentDevice(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Resolves a calendar date using the original fixed offset, independent of
 * the device's current timezone. The offset uses JavaScript's sign convention
 * (UTC - local), so UTC+14 is -840. */
export function localDateAtTimezoneOffset(
  timestamp: string | number,
  timezoneOffsetMinutes: number,
): string | null {
  const instant = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime()
  if (!Number.isFinite(instant) || !isSessionTimezoneOffsetMinutes(timezoneOffsetMinutes)) return null
  return new Date(instant - timezoneOffsetMinutes * MINUTE_MS).toISOString().slice(0, 10)
}

/** Captures immutable business-date metadata without altering the timestamp. */
export function captureSessionStartBusinessDate(startTime: string): SessionStartBusinessDate | null {
  const start = new Date(startTime)
  if (Number.isNaN(start.getTime())) return null
  return {
    startLocalDate: localDateOnCurrentDevice(start),
    startTimezoneOffsetMinutes: start.getTimezoneOffset(),
  }
}

/** Preserves valid persisted metadata, fills missing pieces when they can be
 * inferred safely, and otherwise falls back to the device's current zone. */
export function resolveSessionStartBusinessDate(
  startTime: string,
  startLocalDate?: string,
  startTimezoneOffsetMinutes?: number,
): SessionStartBusinessDate | null {
  const captured = captureSessionStartBusinessDate(startTime)
  if (!captured) return null
  const validDate = isSessionLocalDate(startLocalDate) ? startLocalDate : undefined
  const validOffset = isSessionTimezoneOffsetMinutes(startTimezoneOffsetMinutes)
    ? startTimezoneOffsetMinutes
    : undefined

  if (validOffset !== undefined) {
    const offsetDate = localDateAtTimezoneOffset(startTime, validOffset)
    if (offsetDate && (!validDate || offsetDate === validDate)) {
      return { startLocalDate: validDate ?? offsetDate, startTimezoneOffsetMinutes: validOffset }
    }
  }
  if (validDate) {
    // Only attach the current device offset when it reproduces the persisted
    // date. A linked ledger can recover the date after travel, but not the old
    // timezone boundary; inventing an inconsistent offset would be worse.
    const capturedOffset = captured.startTimezoneOffsetMinutes
    return capturedOffset !== undefined && localDateAtTimezoneOffset(startTime, capturedOffset) === validDate
      ? { startLocalDate: validDate, startTimezoneOffsetMinutes: capturedOffset }
      : { startLocalDate: validDate }
  }
  return captured
}

export function sessionStartLocalDate(session: {
  startTime: string
  startLocalDate?: string
  startTimezoneOffsetMinutes?: number
}): string {
  return resolveSessionStartBusinessDate(
    session.startTime,
    session.startLocalDate,
    session.startTimezoneOffsetMinutes,
  )?.startLocalDate ?? ''
}

export function shiftSessionLocalDate(value: string, days: number): string {
  if (!isSessionLocalDate(value) || !Number.isInteger(days)) return value
  const [year, month, day] = value.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return shifted.toISOString().slice(0, 10)
}
