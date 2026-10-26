import { toLocalDateValue } from '../../lib/form'
import { templateAtDate } from '../../lib/workspaces/templates'
import { templateFeatures } from '../../lib/workspaces/model'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDuration, workProfileForDate } from '@salary-flow/core'
import { Button } from '../../ui/BeuiControls'
import { useNow } from '../../lib/useNow'
import { summarizeTodayWork } from '../../lib/work'
import { changeSpaceTimer } from '../../lib/workspaces/actions'
import { PRIMARY_SPACE_ID, SPACE_TEMPLATES, type WorkSpace } from '../../lib/workspaces/model'
import './Workspaces.css'

const money = (amount: number) => `¥${amount.toFixed(2)}`
export function WorkspaceWorkCard({ space }: { space: WorkSpace }) {
  const now = useNow(1000)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const work = summarizeTodayWork(space.profile, space.workRecords, now, undefined, space.attendanceRecords, space.holidaySettings)
  const date = toLocalDateValue(now)
  const config = workProfileForDate(space.profile, date)
  const template = templateAtDate(space.profile, space.template, date)
  const features = templateFeatures(template)
  const operate = async (action: 'start' | 'pause' | 'finish') => {
    setBusy(true); setError('')
    try { await changeSpaceTimer(space.id, action) } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  return <article className="workspace-card"><div><Link to={`/spaces?space=${space.id}`}><b>{space.name}</b></Link><small>{SPACE_TEMPLATES.find(item => item.id === template)?.name}</small></div><strong>{money(work.earnedAmount)}</strong><p>{work.status === 'working' ? '计薪中' : work.status === 'paused' ? '已暂停' : work.status === 'ended' ? '已结束' : '尚未开始'} · {formatDuration(work.workedSeconds)}</p><small>{config.payday ? `发薪日：每月 ${config.payday} 日` : '未设置发薪日'}</small>
    {space.id === PRIMARY_SPACE_ID ? <small>主业操作在今日页；公共模块展示全部空间。</small> : space.archivedOn ? <small>{space.archivedOn} 已归档</small> : config.defaultWorkMode === 'flexible' ? <div className="workspace-actions">{work.status === 'working' ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => operate('pause')}>暂停</Button> : <Button size="sm" disabled={busy} onClick={() => operate('start')}>{work.record ? '继续工作' : '开始工作'}</Button>}{work.record && work.status !== 'ended' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => operate('finish')}>结束并结算</Button>}</div> : <Link to={`/spaces?space=${space.id}`}>按空间作息计薪 · 调整设置 →</Link>}
    <div className="workspace-quick-links">{features.roster && <Link to={space.id === PRIMARY_SPACE_ID ? '/roster' : `/spaces?space=${space.id}&tab=roster`}>{template === 'factory' ? '循环倒班' : '安排班次'} →</Link>}{(features.hourly || template === 'sales') && <Link to={`/spaces?space=${space.id}`}>{template === 'sales' ? '记录提成' : '记录项目款'} →</Link>}</div>
    {error && <p role="alert">{error}</p>}
  </article>
}
