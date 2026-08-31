export type WebTimerKind = 'slacking' | 'overtime'

/** Stable across retries and reloads for the same logical active timer. */
export function createWebTimerSessionId(kind: WebTimerKind, startTime: string): string | null {
  const startedAt = new Date(startTime).getTime()
  if (!Number.isFinite(startedAt)) return null
  return `web-${kind}-${startedAt}`
}

export function sameTimerStart(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false
  const leftTime = new Date(left).getTime()
  const rightTime = new Date(right).getTime()
  return Number.isFinite(leftTime) && leftTime === rightTime
}

/** Replaces a retry/partial session instead of appending a duplicate. */
export function upsertTimerSession<T extends { id: string; startTime: string }>(
  sessions: readonly T[],
  session: T,
): T[] {
  return [
    session,
    ...sessions.filter(item => item.id !== session.id && !sameTimerStart(item.startTime, session.startTime)),
  ]
}
