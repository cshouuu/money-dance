import { CalendarDays, TrendingDown, TrendingUp, WalletCards } from 'lucide-react'
import { useMemo, useState } from 'react'
import { getSummaryRange, loadLedger, summarizeLedger, type SummaryDimension } from '../lib/ledger'
import { loadProfile } from '../lib/profile'
import './Ledger.css'

function pad(value:number){return String(value).padStart(2,'0')}
function todayValue(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function monthValue(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}`}
function formatMoney(value:number){return `${value<0?'-':''}¥${Math.abs(value).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`}
function formatDate(value:string){return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}

export function Summary(){
  const [dimension,setDimension]=useState<SummaryDimension>('month')
  const [day,setDay]=useState(todayValue())
  const [month,setMonth]=useState(monthValue())
  const [year,setYear]=useState(String(new Date().getFullYear()))
  const profile=loadProfile()
  const ledger=loadLedger()
  const anchor=dimension==='day'?day:dimension==='month'?month:year
  const summary=useMemo(()=>{const {start,end}=getSummaryRange(dimension,anchor);return summarizeLedger(profile,ledger,start,end)},[dimension,anchor,JSON.stringify(profile),JSON.stringify(ledger)])

  return <section className="page"><header className="page-header"><div><p className="eyebrow">MONEY SUMMARY</p><h1>钱最后，都去了哪里？</h1><p>把薪资、已买物品和意外收支放到同一本账里，按日、月、年看清真实结余。</p></div></header>
    <div className="ledger-toolbar"><div className="dimension-tabs">{(['day','month','year'] as SummaryDimension[]).map(item=><button key={item} type="button" className={dimension===item?'active':''} onClick={()=>setDimension(item)}>{item==='day'?'日':item==='month'?'月':'年'}</button>)}</div><div className="period-picker"><CalendarDays size={16}/>{dimension==='day'&&<input type="date" value={day} onChange={e=>setDay(e.target.value)}/>} {dimension==='month'&&<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>} {dimension==='year'&&<input type="number" min="2000" max="2100" value={year} onChange={e=>setYear(e.target.value)}/>}</div></div>
    <div className="summary-metrics"><article><span className="summary-icon income"><TrendingUp size={18}/></span><small>收入合计</small><strong>{formatMoney(summary.income)}</strong></article><article><span className="summary-icon expense"><TrendingDown size={18}/></span><small>支出合计</small><strong>{formatMoney(summary.expense)}</strong></article><article className="net"><span className="summary-icon"><WalletCards size={18}/></span><small>汇算结余</small><strong className={summary.net<0?'negative':''}>{formatMoney(summary.net)}</strong></article></div>
    <div className="list-section"><div className="section-title"><h2>款项来源</h2><span>{summary.entries.length} 笔</span></div>{summary.entries.length===0?<div className="empty">这个时间范围还没有款项。</div>:<div className="ledger-list">{summary.entries.map(entry=><article className="ledger-row" key={entry.id}><span className={`ledger-direction ${entry.direction}`}>{entry.direction==='income'?'+':'−'}</span><div className="ledger-source"><b>{entry.source}</b><span>{entry.category} · {formatDate(entry.occurredAt)}</span></div><strong className={entry.direction}>{entry.direction==='income'?'+':'−'}¥{entry.amount.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></article>)}</div>}</div>
  </section>
}
