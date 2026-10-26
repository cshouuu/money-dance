import { Link } from 'react-router-dom'
import { useWorkspaces } from './useWorkspaces'
import { PRIMARY_SPACE_ID } from '../../lib/workspaces/model'
import './Workspaces.css'

export function SharedJourney() {
  const spaces = useWorkspaces()
  if (spaces.length < 2) return null
  return <section className="workspace-panel"><h2>全部空间的工作历程</h2><p>各空间可以同时任职；以下主业详情沿用原有时间线。</p>{spaces.map(space => <div key={space.id}><h3>{space.name}</h3>{space.profile.workJourney?.stages.map(stage => <div className="workspace-journey-row" key={stage.id}><div><b>{stage.name}</b><p>{stage.startDate} — {stage.endDate ?? '至今'} · {stage.role}</p></div><Link to={space.id === PRIMARY_SPACE_ID ? '/settings' : `/spaces?space=${space.id}`}>{stage.profile ? '查看计薪与工作配置 →' : '历史薪资待补充'}</Link></div>) ?? <p>沿用当前主业设置</p>}</div>)}</section>
}
