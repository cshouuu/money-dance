import { calculateRates, formatDuration, priceToWorkSeconds } from '@salary-flow/core'
import { Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { appendLedgerEntry } from '../lib/ledger'
import { loadProfile } from '../lib/profile'
import { keys, loadJSON, saveJSON } from '../lib/storage'
import type { WishItem } from '../types'
import './Converter.css'

function formatWorkDays(workSeconds: number, paidSecondsPerDay: number) {
  if (!Number.isFinite(workSeconds) || !Number.isFinite(paidSecondsPerDay) || paidSecondsPerDay <= 0) return '∞'
  return (workSeconds / paidSecondsPerDay).toFixed(2)
}

type PendingAction = { type: 'delete' | 'purchase'; item: WishItem } | null

export function Converter() {
  const [search] = useSearchParams()
  const [items, setItems] = useState<WishItem[]>(() => loadJSON(keys.wishes, []))
  const profile = loadProfile(); const rates = useMemo(() => calculateRates(profile), [JSON.stringify(profile)])
  const [name, setName] = useState(search.get('name') || '')
  const [price, setPrice] = useState(search.get('price') || '')
  const [pending, setPending] = useState<PendingAction>(null)
  const [showPurchaseToast, setShowPurchaseToast] = useState(false)
  const wishlistItems = items.filter(item => !item.purchasedAt)

  const add = (e: FormEvent) => { e.preventDefault(); const n=Number(price); if(!name.trim() || !Number.isFinite(n) || n<0) return; const next=[{id:crypto.randomUUID(),name:name.trim(),price:n,createdAt:new Date().toISOString()},...items]; setItems(next); saveJSON(keys.wishes,next); setName(''); setPrice('') }
  const remove=(item:WishItem)=>{const next=items.filter(i=>i.id!==item.id);setItems(next);saveJSON(keys.wishes,next);setPending(null)}
  const purchase=(item:WishItem)=>{
    if(item.purchasedAt){setPending(null);return}
    const purchasedAt=new Date().toISOString()
    const next=items.map(i=>i.id===item.id?{...i,purchasedAt}:i)
    setItems(next);saveJSON(keys.wishes,next)
    appendLedgerEntry({id:crypto.randomUUID(),kind:'purchase',direction:'expense',amount:item.price,source:`已买 · ${item.name}`,occurredAt:purchasedAt,linkedId:item.id})
    setPending(null);setShowPurchaseToast(true)
  }
  const confirmAction=()=>{if(!pending)return;pending.type==='delete'?remove(pending.item):purchase(pending.item)}
  const previewPrice = Number(price)
  const previewWorkSeconds = price && Number.isFinite(previewPrice) && previewPrice >= 0
    ? priceToWorkSeconds(previewPrice, rates.second)
    : null

  return <section className="page"><header className="page-header"><div><p className="eyebrow">TIME CONVERTER</p><h1>这个东西，值你工作多久？</h1><p>把价格换算成真实的工作时间，而不是一个抽象的数字。</p></div></header>
    <form className="input-card" onSubmit={add}><label><span>想买什么</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="例如：AirPods Pro" /></label><label><span>价格</span><div className="money-input"><i>¥</i><input value={price} onChange={e=>setPrice(e.target.value)} inputMode="decimal" placeholder="1899" /></div></label>{previewWorkSeconds !== null && <div className="live-result converter-live-result"><small>连续纯工时（24小时制）</small><strong>{formatDuration(previewWorkSeconds)}</strong><span>按你的工作日程 ≈ {formatWorkDays(previewWorkSeconds, rates.paidSecondsPerDay)} 个工作日</span></div>}<button className="primary-button" type="submit"><Plus size={17}/> 保存换算</button></form>
    <div className="list-section"><div className="section-title"><h2>心愿清单</h2><span>{wishlistItems.length} 项</span></div>{wishlistItems.length===0 ? <div className="empty">还没有心愿。先把一个想买的东西换成工作时间吧。</div> : <div className="item-list">{wishlistItems.map(i=>{const workSeconds=priceToWorkSeconds(i.price,rates.second); return <article className="list-card converter-card" key={i.id}><div className="item-avatar">{i.name.slice(0,1).toUpperCase()}</div><div className="item-main"><b>{i.name}</b><span>¥{i.price.toLocaleString()}</span></div><div className="item-result converter-result"><div><small>连续纯工时（24小时制）</small><strong>{formatDuration(workSeconds)}</strong></div><div><small>按你的工作日程</small><strong>≈ {formatWorkDays(workSeconds, rates.paidSecondsPerDay)} 个工作日</strong></div></div><div className="converter-actions"><button className="buy-button" type="button" onClick={()=>setPending({type:'purchase',item:i})}><ShoppingBag size={15}/><span>已买</span></button><button className="icon-button" type="button" onClick={()=>setPending({type:'delete',item:i})} aria-label={`删除 ${i.name}`} title="删除"><Trash2 size={17}/></button></div></article>})}</div>}</div>
    <ConfirmDialog open={Boolean(pending)} title={pending?.type==='delete'?'真不想要了？':'你真买了？'} message={pending?.item.name} confirmLabel={pending?.type==='delete'?'真不要了':'我真买了'} cancelLabel={pending?.type==='delete'?'我再想想':'骗你的'} onConfirm={confirmAction} onCancel={()=>setPending(null)}/>
    {showPurchaseToast&&<div className="purchase-toast"><div><b>别忘了录入物品哦</b><span>记录购买日期后，就能开始看它的持有成本。</span></div><Link to="/assets" onClick={()=>setShowPurchaseToast(false)}>去录入</Link><button type="button" onClick={()=>setShowPurchaseToast(false)} aria-label="关闭提醒">×</button></div>}
  </section>
}
