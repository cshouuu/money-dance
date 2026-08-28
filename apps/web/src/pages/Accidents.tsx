import { ArrowDownLeft, ArrowUpRight, Plus } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { getPageCount, getPageItems, Pagination } from '../components/Pagination'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey, toLocalDateValue } from '../lib/form'
import { localDateAtNoon, loadLedger, saveLedger } from '../lib/ledger'
import type { LedgerDirection, LedgerEntry } from '../types'
import './Ledger.css'

function formatDate(value:string){return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}

export function Accidents(){
  const [ledger,setLedger]=useState<LedgerEntry[]>(()=>loadLedger())
  const [direction,setDirection]=useState<LedgerDirection>('expense')
  const [source,setSource]=useState('')
  const [amount,setAmount]=useState('')
  const [date,setDate]=useState(()=>toLocalDateValue())
  const [page,setPage]=useState(1)
  const accidents=useMemo(()=>ledger.filter(entry=>entry.kind==='accident').sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime()),[ledger])
  const currentPage=Math.min(page,getPageCount(accidents.length)); const visibleAccidents=getPageItems(accidents,currentPage)
  const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const n=parseNumberInput(amount);if(!event.currentTarget.reportValidity()||!source.trim()||n===null||n<=0||n>MAX_MONEY_AMOUNT||!date)return;const entry:LedgerEntry={id:crypto.randomUUID(),kind:'accident',direction,amount:n,source:source.trim(),occurredAt:localDateAtNoon(date).toISOString()};const next=[entry,...ledger];setLedger(next);saveLedger(next);setPage(1);setSource('');setAmount('')}

  return <section className="page"><header className="page-header"><div><p className="eyebrow">UNEXPECTED MONEY</p><h1>意外，也要算进生活里。</h1><p>记录某天突然发生的收入或花费。它不会改变你的薪资速度，但会进入汇算结果。</p></div></header>
    <form className="accident-form" onSubmit={submit}><div className="direction-switch"><button type="button" className={direction==='expense'?'active expense':''} onClick={()=>setDirection('expense')}><ArrowUpRight size={16}/>意外花费</button><button type="button" className={direction==='income'?'active income':''} onClick={()=>setDirection('income')}><ArrowDownLeft size={16}/>意外收入</button></div><label><span>发生了什么</span><input required maxLength={80} autoComplete="off" value={source} onChange={e=>setSource(e.target.value)} placeholder={direction==='expense'?'例如：手机突然碎屏':'例如：意外收到奖金'}/></label><label><span>金额</span><div className="money-input"><i>¥</i><input required type="number" inputMode="decimal" min="0.01" max={MAX_MONEY_AMOUNT} step="0.01" value={amount} onKeyDown={preventInvalidNumberKey} onChange={e=>setAmount(normalizeDecimalInput(e.target.value))} placeholder="0.00"/></div></label><label><span>发生日期</span><input required type="date" max={toLocalDateValue()} value={date} onChange={e=>setDate(e.target.value)}/></label><button className="primary-button" type="submit"><Plus size={17}/>记一笔</button></form>
    <div className="list-section"><div className="section-title"><h2>意外记录</h2><span>{accidents.length} 笔</span></div>{accidents.length===0?<div className="empty">还没有意外收支。希望“意外”更多是收入。</div>:<><div className="ledger-list">{visibleAccidents.map(entry=><article className="ledger-row" key={entry.id}><span className={`ledger-direction ${entry.direction}`}>{entry.direction==='income'?'+':'−'}</span><div className="ledger-source"><b>{entry.source}</b><span>{entry.direction==='income'?'意外收入':'意外花费'} · {formatDate(entry.occurredAt)}</span></div><strong className={entry.direction}>{entry.direction==='income'?'+':'−'}¥{entry.amount.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></article>)}</div><Pagination total={accidents.length} page={currentPage} onPageChange={setPage}/></>}</div>
  </section>
}
