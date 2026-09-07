import { calculateRates, priceToWorkSeconds, type SalaryProfile } from '@salary-flow/core'
import type { AttendanceRecord, DailyWorkRecord, WishItem } from '../types'
import { loadChinaHolidaySettings } from './attendance'
import { toLocalDateValue } from './form'
import { calculatePaidTimeEarnings, estimatePaidEarningsCompletionDate } from './paidTime'
import { salaryProfileForBusinessDate } from './profile'

export interface WishProgress {
  upcomingStart: Date | null
  earnedAmount: number
  progress: number
  remainingAmount: number
  requiredSeconds: number
  remainingSeconds: number
  requiredWorkDays: number
  estimatedAt: Date | null
}

export function getWishProgress(
  item: WishItem,
  profile: SalaryProfile,
  now = new Date(),
  workRecords: readonly DailyWorkRecord[] = [],
  attendanceRecords: readonly AttendanceRecord[] = [],
): WishProgress {
  const settings = loadChinaHolidaySettings(now)
  const currentProfile = salaryProfileForBusinessDate(profile, toLocalDateValue(now), [...attendanceRecords], settings)
  const rates = calculateRates(currentProfile)
  const createdAt = new Date(item.startedAt ?? item.createdAt)
  const progressStart = Number.isNaN(createdAt.getTime()) ? now : createdAt
  const upcomingStart = progressStart > now ? progressStart : null
  const rawEarnedAmount = upcomingStart ? 0 : calculatePaidTimeEarnings(
    profile,
    progressStart,
    now,
    workRecords,
    attendanceRecords,
    settings,
  ).earnedAmount
  const price = Math.max(0, Number.isFinite(item.price) ? item.price : 0)
  const earnedAmount = Math.min(price, Math.max(0, rawEarnedAmount))
  const remainingAmount = Math.max(0, price - earnedAmount)
  const requiredSeconds = priceToWorkSeconds(price, rates.second)
  const remainingSeconds = priceToWorkSeconds(remainingAmount, rates.second)
  const progress = upcomingStart ? 0 : price === 0 ? 1 : Math.min(1, earnedAmount / price)
  return {
    upcomingStart,
    earnedAmount,
    progress,
    remainingAmount,
    requiredSeconds,
    remainingSeconds,
    requiredWorkDays: rates.paidSecondsPerDay > 0 ? requiredSeconds / rates.paidSecondsPerDay : Number.POSITIVE_INFINITY,
    estimatedAt: estimatePaidEarningsCompletionDate(profile, upcomingStart ?? now, remainingAmount, attendanceRecords, settings, workRecords),
  }
}
