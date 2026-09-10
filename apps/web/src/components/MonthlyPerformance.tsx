import { Clock3, Fish, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { formatDuration } from '@salary-flow/core'
import type { MonthlyWorkStats } from '../lib/monthlyStats'
import { BouncyAccordion } from '../ui/BouncyAccordion'
import './MonthlyPerformance.css'

const money = (amount: number) => `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const hourly = (amount: number | null) => amount === null ? '暂无数据' : money(amount)

export function MonthlyPerformance({ stats, now }: { stats: MonthlyWorkStats; now: Date }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  return <>
    <div className="section-title dashboard-performance-title"><div><p className="eyebrow">MONTHLY SCORE</p><h2>本月战绩</h2></div><span>{now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</span></div>
    <article className="dashboard-performance-card" aria-label="本月战绩">
      <div className="dashboard-performance-primary"><div><small>本月累计收入</small><strong>{money(stats.income)}</strong><span>本月预计 {money(stats.expectedIncome)}</span></div></div>
      <div className="dashboard-performance-progress">
        <div><span>计划工时进度</span><strong>{(stats.progress * 100).toFixed(0)}%</strong></div>
        <div className="dashboard-performance-track" role="progressbar" aria-label="本月计划工时进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(stats.progress * 100)}><i style={{ width: `${stats.progress * 100}%` }}/></div>
        <small>{formatDuration(stats.workedSeconds)} / {formatDuration(stats.plannedSeconds)} · 本月 {stats.workdayCount} 个工作日</small>
      </div>
      <div className="dashboard-performance-details">
        <div><Clock3 size={16}/><span>累计工作时长</span><b>{formatDuration(stats.totalWorkedSeconds)}</b></div>
        <div><Fish size={16}/><span>其中摸鱼</span><b>{formatDuration(stats.slackingSeconds)}</b></div>
        <div><TrendingUp size={16}/><span>综合时薪</span><b>{hourly(stats.averageHourlyIncome)}</b></div>
      </div>
      <BouncyAccordion className="monthly-performance-breakdown" value={expanded} onValueChange={setExpanded} items={[{
        id: 'calculation',
        title: <b>{expanded ? '收起计算明细' : '查看计算明细'}</b>,
        description: <div className="monthly-performance-calculation">
          <dl className="monthly-performance-rows">
            <div><dt>正常工时</dt><dd>{formatDuration(stats.normalWorkedSeconds)}</dd></div>
            <div><dt>加班工时<span>含无偿加班</span></dt><dd>{formatDuration(stats.overtimeSeconds)}</dd></div>
            <div><dt>其中摸鱼<span>已包含在工作时长中</span></dt><dd>{formatDuration(stats.slackingSeconds)}</dd></div>
            <div><dt>扣除摸鱼后的投入</dt><dd>{formatDuration(stats.netWorkedSeconds)}</dd></div>
          </dl>
          <div className="monthly-performance-rate">
            <span>扣除摸鱼后时薪 <small>估算</small></span>
            <strong>{hourly(stats.netHourlyIncome)}{stats.netHourlyIncome !== null && <small>/ 小时</small>}</strong>
            <p>工作收入 ÷（累计工作时长 − 已记录摸鱼时间）</p>
          </div>
          <div className="monthly-performance-notes">
            <p>工作收入 {money(stats.workIncome)} = 工资 {money(stats.salaryIncome)} + 加班收益 {money(stats.overtimeIncome)}。综合时薪 = 工作收入 ÷ 累计工作时长。</p>
            <p>加班、摸鱼仅统计已结束记录，跨月归入开始月。工时去重，摸鱼只计工作内的部分。</p>
            <p>摸鱼收益已包含在工资中，时薪不计意外、手工收入。本月累计收入沿用账本口径，计划进度不额外累加加班。</p>
          </div>
        </div>,
      }]}/>
    </article>
  </>
}
