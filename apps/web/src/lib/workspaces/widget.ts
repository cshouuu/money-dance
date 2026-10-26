import type { WidgetTimelineSegment } from '../widgetState'

/** Native widgets consume one timeline. Merge at every boundary so different
 * shifts, midnights and paused timers retain their own rates and resets. */
export function mergeSpaceTimelines(timelines: readonly WidgetTimelineSegment[][]): WidgetTimelineSegment[] {
  const boundaries = [...new Set(timelines.flatMap(timeline => timeline.flatMap(segment => [segment.startAt, segment.endAt])))].sort((a,b) => a-b)
  return boundaries.slice(0, -1).map((startAt, index) => {
    const active = timelines.flatMap(timeline => {
      const segment = timeline.find(item => item.startAt <= startAt && startAt < item.endAt)
      return segment ? [segment] : []
    })
    return { startAt, endAt: boundaries[index + 1],
      baseAmount: active.reduce((sum, item) => sum + item.baseAmount + (startAt - item.startAt) / 1000 * item.ratePerSecond, 0),
      ratePerSecond: active.reduce((sum, item) => sum + item.ratePerSecond, 0) }
  })
}
