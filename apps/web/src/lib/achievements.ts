import type { OvertimeSession, SlackingSession } from '../types'
import { keys, loadJSON, saveJSON } from './storage'

export type AchievementKind = 'slacking' | 'overtime'

export interface AchievementDefinition {
  id: string
  level: number
  name: string
  description: string
  thresholdSeconds: number
}

export interface AchievementState {
  lifetimeSeconds: number
  processedSessionIds: string[]
  /** Highest duration already credited for each session; enables idempotent corrections. */
  creditedSecondsBySessionId: Record<string, number>
  highestLevel: number
  unlockedAt: Record<string, string>
}

export interface AchievementSnapshot {
  definitions: readonly AchievementDefinition[]
  lifetimeSeconds: number
  activeSeconds: number
  totalSeconds: number
  highestLevel: number
  current: AchievementDefinition | null
  next: AchievementDefinition | null
  remainingSeconds: number
  progress: number
}

interface AchievementStore {
  version: 1
  slacking: AchievementState
  overtime: AchievementState
}

type AchievementSession = Pick<SlackingSession | OvertimeSession, 'id' | 'durationSeconds' | 'endTime'>

const HOUR = 3600

export const ACHIEVEMENTS: Record<AchievementKind, readonly AchievementDefinition[]> = {
  slacking: [
    { id: 'slacking-1', level: 1, name: '鱼苗试水', description: '累计摸鱼 30 分钟', thresholdSeconds: 0.5 * HOUR },
    { id: 'slacking-2', level: 2, name: '带薪入门', description: '累计摸鱼 3 小时', thresholdSeconds: 3 * HOUR },
    { id: 'slacking-3', level: 3, name: '鱼塘常客', description: '累计摸鱼 10 小时', thresholdSeconds: 10 * HOUR },
    { id: 'slacking-4', level: 4, name: '摸鱼大师', description: '累计摸鱼 30 小时', thresholdSeconds: 30 * HOUR },
    { id: 'slacking-5', level: 5, name: '深海传说', description: '累计摸鱼 100 小时', thresholdSeconds: 100 * HOUR },
  ],
  overtime: [
    { id: 'overtime-1', level: 1, name: '偶尔晚归', description: '累计加班 1 小时', thresholdSeconds: HOUR },
    { id: 'overtime-2', level: 2, name: '夜色常客', description: '累计加班 10 小时', thresholdSeconds: 10 * HOUR },
    { id: 'overtime-3', level: 3, name: '工位守夜人', description: '累计加班 30 小时', thresholdSeconds: 30 * HOUR },
    { id: 'overtime-4', level: 4, name: '月亮合伙人', description: '累计加班 100 小时', thresholdSeconds: 100 * HOUR },
    { id: 'overtime-5', level: 5, name: '钢铁工时人', description: '累计加班 300 小时', thresholdSeconds: 300 * HOUR },
  ],
}

export function createEmptyAchievementState(): AchievementState {
  return { lifetimeSeconds: 0, processedSessionIds: [], creditedSecondsBySessionId: {}, highestLevel: 0, unlockedAt: {} }
}

function createEmptyAchievementStore(): AchievementStore {
  return {
    version: 1,
    slacking: createEmptyAchievementState(),
    overtime: createEmptyAchievementState(),
  }
}

function safeSeconds(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

function normalizeState(kind: AchievementKind, value: unknown): AchievementState {
  if (!value || typeof value !== 'object') return createEmptyAchievementState()
  const candidate = value as Partial<AchievementState>
  const processedSessionIds = Array.isArray(candidate.processedSessionIds)
    ? [...new Set(candidate.processedSessionIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : []
  const creditedSecondsBySessionId = candidate.creditedSecondsBySessionId
    && typeof candidate.creditedSecondsBySessionId === 'object'
    ? Object.fromEntries(Object.entries(candidate.creditedSecondsBySessionId)
      .filter((entry): entry is [string, number] => entry[0].length > 0 && typeof entry[1] === 'number' && Number.isFinite(entry[1]))
      .map(([id, seconds]) => [id, Math.max(0, seconds)]))
    : {}
  const unlockedAt = candidate.unlockedAt && typeof candidate.unlockedAt === 'object'
    ? Object.fromEntries(Object.entries(candidate.unlockedAt).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : {}
  const highestLevel = Math.min(
    ACHIEVEMENTS[kind].length,
    Math.max(0, Number.isFinite(candidate.highestLevel) ? Math.floor(candidate.highestLevel as number) : 0),
  )
  return {
    lifetimeSeconds: safeSeconds(candidate.lifetimeSeconds),
    processedSessionIds,
    creditedSecondsBySessionId,
    highestLevel,
    unlockedAt,
  }
}

function loadAchievementStore(): AchievementStore {
  const fallback = createEmptyAchievementStore()
  const stored = loadJSON<unknown>(keys.achievements, fallback)
  if (!stored || typeof stored !== 'object') return fallback
  const candidate = stored as Partial<AchievementStore>
  return {
    version: 1,
    slacking: normalizeState('slacking', candidate.slacking),
    overtime: normalizeState('overtime', candidate.overtime),
  }
}

export function loadAchievementState(kind: AchievementKind): AchievementState {
  return loadAchievementStore()[kind]
}

export function saveAchievementState(kind: AchievementKind, state: AchievementState): boolean {
  const store = loadAchievementStore()
  return saveJSON(keys.achievements, { ...store, [kind]: normalizeState(kind, state) })
}

export function achievementLevelAt(kind: AchievementKind, totalSeconds: number): number {
  const seconds = safeSeconds(totalSeconds)
  let level = 0
  for (const achievement of ACHIEVEMENTS[kind]) {
    if (seconds < achievement.thresholdSeconds) break
    level = achievement.level
  }
  return level
}

export function formatTimerDuration(totalSeconds: number): string {
  const seconds = Math.floor(safeSeconds(totalSeconds))
  const hours = Math.floor(seconds / HOUR)
  const minutes = Math.floor((seconds % HOUR) / 60)
  const remainingSeconds = seconds % 60
  return [hours, minutes, remainingSeconds].map(value => String(value).padStart(2, '0')).join(':')
}

export function elapsedSecondsSince(startTime: string, now = new Date()): number {
  const startedAt = new Date(startTime).getTime()
  if (!Number.isFinite(startedAt)) return 0
  return Math.max(0, (now.getTime() - startedAt) / 1000)
}

function validTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) return fallback
  return value
}

function withUnlockedLevels(kind: AchievementKind, state: AchievementState, targetLevel: number, unlockedAt: string): AchievementState {
  const normalizedTarget = Number.isFinite(targetLevel) ? Math.floor(targetLevel) : state.highestLevel
  const safeTarget = Math.min(ACHIEVEMENTS[kind].length, Math.max(state.highestLevel, normalizedTarget))
  let nextUnlockedAt = state.unlockedAt
  let changed = safeTarget !== state.highestLevel
  for (const achievement of ACHIEVEMENTS[kind]) {
    if (achievement.level > safeTarget || nextUnlockedAt[achievement.id]) continue
    if (nextUnlockedAt === state.unlockedAt) nextUnlockedAt = { ...state.unlockedAt }
    nextUnlockedAt[achievement.id] = unlockedAt
    changed = true
  }
  if (!changed) return state
  return { ...state, highestLevel: safeTarget, unlockedAt: nextUnlockedAt }
}

export function unlockAchievementLevel(kind: AchievementKind, state: AchievementState, targetLevel: number, unlockedAt: string): AchievementState {
  return withUnlockedLevels(kind, state, targetLevel, validTimestamp(unlockedAt, new Date().toISOString()))
}

export function reconcileAchievementSessions(
  kind: AchievementKind,
  state: AchievementState,
  sessions: readonly AchievementSession[],
  reconciledAt: string,
): AchievementState {
  const processed = new Set(state.processedSessionIds)
  const pending = sessions
    .filter(session => typeof session.id === 'string' && session.id.length > 0)
    .slice()
    .sort((left, right) => new Date(left.endTime).getTime() - new Date(right.endTime).getTime())
  if (pending.length === 0) {
    return withUnlockedLevels(kind, state, achievementLevelAt(kind, state.lifetimeSeconds), validTimestamp(reconciledAt, new Date().toISOString()))
  }

  let next: AchievementState = {
    ...state,
    processedSessionIds: [...state.processedSessionIds],
    creditedSecondsBySessionId: { ...state.creditedSecondsBySessionId },
  }
  for (const session of pending) {
    const wasProcessed = processed.has(session.id)
    const hadCredit = Object.prototype.hasOwnProperty.call(next.creditedSecondsBySessionId, session.id)
    const creditedSeconds = hadCredit ? next.creditedSecondsBySessionId[session.id] ?? 0 : 0
    const currentSeconds = safeSeconds(session.durationSeconds)
    if (!wasProcessed) {
      processed.add(session.id)
      next.processedSessionIds.push(session.id)
    }

    // Stores created before duration credits existed already included every
    // processed ID in lifetimeSeconds. Register their current duration without
    // adding it a second time. Later increases only add the positive delta.
    const addedSeconds = !wasProcessed
      ? currentSeconds
      : hadCredit
        ? Math.max(0, currentSeconds - creditedSeconds)
        : 0
    next.creditedSecondsBySessionId[session.id] = Math.max(creditedSeconds, currentSeconds)
    if (addedSeconds <= 0) continue
    next = { ...next, lifetimeSeconds: next.lifetimeSeconds + addedSeconds }
    next = withUnlockedLevels(
      kind,
      next,
      achievementLevelAt(kind, next.lifetimeSeconds),
      validTimestamp(session.endTime, validTimestamp(reconciledAt, new Date().toISOString())),
    )
  }
  return next
}

export function getAchievementSnapshot(kind: AchievementKind, state: AchievementState, activeSeconds = 0): AchievementSnapshot {
  const definitions = ACHIEVEMENTS[kind]
  const safeActiveSeconds = safeSeconds(activeSeconds)
  const totalSeconds = state.lifetimeSeconds + safeActiveSeconds
  const highestLevel = Math.max(state.highestLevel, achievementLevelAt(kind, totalSeconds))
  const current = highestLevel > 0 ? definitions[highestLevel - 1] ?? null : null
  const next = definitions[highestLevel] ?? null
  const progressFloor = current?.thresholdSeconds ?? 0
  const effectiveSeconds = Math.max(totalSeconds, progressFloor)
  const progress = next
    ? Math.min(1, Math.max(0, (effectiveSeconds - progressFloor) / (next.thresholdSeconds - progressFloor)))
    : 1
  return {
    definitions,
    lifetimeSeconds: state.lifetimeSeconds,
    activeSeconds: safeActiveSeconds,
    totalSeconds,
    highestLevel,
    current,
    next,
    remainingSeconds: next ? Math.ceil(Math.max(0, next.thresholdSeconds - effectiveSeconds)) : 0,
    progress,
  }
}
