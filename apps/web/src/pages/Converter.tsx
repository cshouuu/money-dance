import { calculateRates, formatDuration, priceToWorkSeconds } from '@salary-flow/core'
import { Plus, Trash2 } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadProfile } from '../lib/profile'
import { keys, loadJSON, saveJSON } from '../lib/storage'
import type { WishItem } from '../types'

export function Converter() {
  const [search] = useSearchParams()
  const [items, setItems] = useState<WishItem[]>(() => loadJSON(keys.wishes, []))
  const profile = loadProfile(); const rates = useMemo(() => calculateRates(profile), [JSON.stringify(profile)])
  const [name, setName] = useState(search.get('name') || '')
  const [price, setPrice] = useState(search.get('price') || '')
  const add = (e: FormEvent) => { e.preventDefault(); const n=Number(price); if(!name.trim() || !Number.isFinite(n) || n<0) return; const next=[{id:crypto.randomUUID(),name:name.trim(),price:n,createdAt:new Date().toISOString()},...items]; setItems(next); saveJSON(keys.wishes,next); setName(''); setPrice('') }
  const remove=(id:string)=>{const next=items.filter(i=>i.id!==id);setItems(next);saveJSON(keys.wishes,next)}
  return <section className="page"><header className="page-header"><div><p className="eyebrow">TIME CONVERTER</p><h1>这个东西，值你工作多久？</h1><p>把价格换算成真实的工作时间，而不是一个抽象的数字。</p></div></header>
    <form className="input-card" onSubmit={add}><label><span>想买什么</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="例如：AirPods Pro" /></label><label><span>价格</span><div className="money-input"><i>¥</i><input value={price} onChange={e=>setPrice(e.target.value)} inputMode="decimal" placeholder="1899" /></div></label>{price && Number(price)>=0 && <div className="live-result"><small>需要工作</small><strong>{formatDuration(priceToWorkSeconds(Number(price), rates.second))}</strong><span>≈ {(priceToWorkSeconds(Number(price),rates.second)/rates.paidSecondsPerDay).toFixed(2)} 个工作日</span></div>}<button className="primary-button" type="submit"><Plus size={17}/> 保存换算</button></form>
    <div className="list-section"><div className="section-title"><h2>我的换算</h2><span>{items.length} 项</span></div>{items.length===0 ? <div className="empty">还没有记录。先把一个想买的东西换成工作时间吧。</div> : <div className="item-list">{items.map(i=><article className="list-card" key={i.id}><div className="item-avatar">{i.name.slice(0,1).toUpperCase()}</div><div className="item-main"><b>{i.name}</b><span>¥{i.price.toLocaleString()}</span></div><div className="item-result"><small>需要工作</small><strong>{formatDuration(priceToWorkSeconds(i.price,rates.second))}</strong></div><button className="icon-button" onClick={()=>remove(i.id)} aria-label="删除"><Trash2 size={17}/></button></article>)}</div>}</div>
  </section>
}
