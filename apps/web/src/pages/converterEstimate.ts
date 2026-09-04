export type WishEstimateState = 'complete' | 'reached' | 'pending' | 'unavailable'

export function formatWishEstimate(value: Date | null, now: Date, complete: boolean): { label: string; state: WishEstimateState } {
  if (complete) return { label: '已达成', state: 'complete' }
  if (!value || Number.isNaN(value.getTime())) return { label: '当前日程下暂无法估算', state: 'unavailable' }
  if (value.getTime() <= now.getTime()) return { label: '已到达预计达成时间', state: 'reached' }

  const includeYear = value.getFullYear() !== now.getFullYear()
  const date = [
    ...(includeYear ? [value.getFullYear()] : []),
    value.getMonth() + 1,
    value.getDate(),
  ].join('/')
  const time = `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
  return { label: `预计 ${date} ${time} 达成`, state: 'pending' }
}
