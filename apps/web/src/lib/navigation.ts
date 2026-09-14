import { BarChart3, Boxes, BriefcaseBusiness, CalendarCheck2, CircleDollarSign, Coins, Fish, Heart, Route, Settings2 } from 'lucide-react'

export const NAVIGATION_ITEMS = [
  ['/', Coins, '今日'],
  ['/convert', Heart, '心愿清单'],
  ['/summary', BarChart3, '账本'],
  ['/accidents', CircleDollarSign, '意外收支'],
  ['/slacking', Fish, '摸鱼'],
  ['/overtime', BriefcaseBusiness, '加班'],
  ['/attendance', CalendarCheck2, '薪苦日历'],
  ['/assets', Boxes, '物品'],
  ['/journey', Route, '工作旅程'],
  ['/settings', Settings2, '我的'],
] as const

export type NavigationPath = (typeof NAVIGATION_ITEMS)[number][0]
