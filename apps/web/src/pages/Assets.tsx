import { assetCostPerHour } from '@salary-flow/core'
import { Plus, Trash2 } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { keys, loadJSON, saveJSON } from '../lib/storage'
import { useNow } from '../lib/useNow'
import type { OwnedItem } from '../types'

export function Assets() {
  const now=useNow(60_000); const [items,setItems]=useState<OwnedItem[]>(()=>loadJSON(keys.assets,[])); const [name,setName]=useState(''); const [price,setPrice]=useState(''); const [date,setDate]=useState(new Date().toISOString().slice(0,10)); const [category,setCategory]=useState('数码')
  const add=(e:FormEvent)=>{e.preventDefault();const p=Number(price);const d=new Date(`${date}T00:00:00`);if(!name.trim()||!Number.isFinite(p)||p<0||Number.isNaN(d.getTime())||d>now)return;const next=[{id:crypto.randomUUID(),name:name.trim(),price:p,purchaseDate:d.toISOString(),category,createdAt:new Date().toISOString()},...items];setItems(next);saveJSON(keys.assets,next);setName('');setPrice('')}
  const remove=(id:string)=>{const next=items.filter(i=>i.id!==id);setItems(next);saveJSON(keys.assets,next)}
  return <section className="page"><header className="page-header"><div><p className="eyebrow">OWNERSHIP COST</p><h1>买得贵不贵，时间会给答案。</h1><p>持有时间越久，平均每小时成本越低。MVP 统计“持有成本”，不是实际使用时长。</p></div></header>
    <form className="input-card asset-form" onSubmit={add}><label><span>物品名称</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="MacBook Pro"/></label><label><span>价格</span><div className="money-input"><i>¥</i><input inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)} placeholder="14999"/></div></label><label><span>购买日期</span><input type="date" max={new Date().toISOString().slice(0,10)} value={date} onChange={e=>setDate(e.target.value)}/></label><label><span>分类</span><select value={category} onChange={e=>setCategory(e.target.value)}><option>数码</option><option>家居</option><option>交通</option><option>兴趣</option><option>其他</option></select></label><button className="primary-button" type="submit"><Plus size={17}/> 添加物品</button></form>
    <div className="asset-grid">{items.map(i=>{const hours=Math.max(0,(now.getTime()-new Date(i.purchaseDate).getTime())/3600000);const c=assetCostPerHour(i.price,i.purchaseDate,now);return <article className="asset-card" key={i.id}><div className="asset-top"><span>{i.category}</span><button className="icon-button" onClick={()=>remove(i.id)}><Trash2 size={16}/></button></div><h3>{i.name}</h3><p>购买价格 ¥{i.price.toLocaleString()}</p><div className="cost"><small>当前持有成本</small><strong>{Number.isFinite(c)?`¥${c.toFixed(c<1?3:2)}`:'—'} <i>/ 小时</i></strong><span>已拥有 {(hours/24).toFixed(1)} 天 · 每小时自动下降</span></div></article>})}</div>{items.length===0&&<div className="empty">添加一个你已经拥有的东西，看看它现在平均每小时花了多少钱。</div>}
  </section>
}
