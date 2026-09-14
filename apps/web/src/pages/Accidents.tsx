import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPageCount, getPageItems, Pagination } from '../components/Pagination'
import { loadLedger } from '../lib/ledger'
import type { LedgerEntry } from '../types'
import './Ledger.css'

function formatDate(value:string){return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}

export function Accidents(){
  const [ledger]=useState<LedgerEntry[]>(()=>loadLedger())
  const [page,setPage]=useState(1)
  const accidents=useMemo(()=>ledger.filter(entry=>entry.kind==='accident').sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime()),[ledger])
  const currentPage=Math.min(page,getPageCount(accidents.length)); const visibleAccidents=getPageItems(accidents,currentPage)

  return <section className="page accidents-page"><header className="page-header"><div><p className="eyebrow">UNEXPECTED MONEY</p><h1>意外，也要算进生活里。</h1><p>记录某天突然发生的收入或花费。它不会改变你的薪资速度，但会进入账本统计。</p></div></header>
    <div className="task-links"><Link to="/summary?new=accident">记一笔意外收支</Link><Link to="/summary">返回账本 · 编辑与查看全部记录</Link></div>
    <div className="list-section"><div className="section-title"><h2>意外记录</h2><span>{accidents.length} 笔</span></div>{accidents.length===0?<div className="empty">还没有意外收支。希望“意外”更多是收入。</div>:<><div className="ledger-list">{visibleAccidents.map(entry=><article className="ledger-row" key={entry.id}><span className={`ledger-direction ${entry.direction}`}>{entry.direction==='income'?'+':'−'}</span><div className="ledger-source"><b>{entry.source}</b><span>{entry.direction==='income'?'意外收入':'意外花费'} · {formatDate(entry.occurredAt)}</span></div><strong className={entry.direction}>{entry.direction==='income'?'+':'−'}¥{entry.amount.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></article>)}</div><Pagination total={accidents.length} page={currentPage} onPageChange={setPage}/></>}</div>
  </section>
}
