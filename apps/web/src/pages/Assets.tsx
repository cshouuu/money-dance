import { assetCostPerHour } from '@salary-flow/core'
import { Plus, Trash2 } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { getPageCount, getPageItems, Pagination } from '../components/Pagination'
import { formatOwnershipDuration, MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey, toLocalDateValue } from '../lib/form'
import { createId } from '../lib/id'
import { keys, loadJSON, saveJSON } from '../lib/storage'
import { useNow } from '../lib/useNow'
import type { OwnedItem } from '../types'
import { Button, Input, SelectField } from '../ui/BeuiControls'
import './Assets.css'

export function Assets() {
  const now=useNow(60_000); const [items,setItems]=useState<OwnedItem[]>(()=>loadJSON(keys.assets,[])); const [page,setPage]=useState(1); const [name,setName]=useState(''); const [price,setPrice]=useState(''); const [date,setDate]=useState(()=>toLocalDateValue()); const [category,setCategory]=useState('数码'); const [pendingDelete,setPendingDelete]=useState<OwnedItem|null>(null)
  const currentPage=Math.min(page,getPageCount(items.length)); const visibleItems=getPageItems(items,currentPage)
  const add=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const p=parseNumberInput(price);const d=new Date(`${date}T00:00:00`);if(!e.currentTarget.reportValidity()||!name.trim()||p===null||p<0||p>MAX_MONEY_AMOUNT||Number.isNaN(d.getTime())||d>now)return;const next=[{id:createId(),name:name.trim(),price:p,purchaseDate:d.toISOString(),category,createdAt:new Date().toISOString()},...items];setItems(next);saveJSON(keys.assets,next);setPage(1);setName('');setPrice('')}
  const remove=()=>{if(!pendingDelete)return;const next=items.filter(i=>i.id!==pendingDelete.id);setItems(next);saveJSON(keys.assets,next);setPendingDelete(null)}
  return <section className="page assets-page"><header className="page-header"><div><p className="eyebrow">OWNERSHIP COST</p><h1>买得贵不贵，时间会给答案。</h1><p>持有时间越久，平均每小时成本越低。这里统计的是“持有成本”，不是实际使用时长。</p></div></header>
    <form className="input-card asset-form" onSubmit={add}><div className="form-card-heading"><span>NEW ITEM</span><div><b>记录一件好物</b><small>购买日期越准确，持有成本越真实。</small></div></div><Input label="物品名称" required maxLength={60} autoComplete="off" value={name} onValueChange={setName} placeholder="MacBook Pro"/><Input label="价格" required type="number" inputMode="decimal" min="0" max={MAX_MONEY_AMOUNT} step="0.01" value={price} leftIcon="¥" onKeyDown={preventInvalidNumberKey} onValueChange={value=>setPrice(normalizeDecimalInput(value))} placeholder="14999"/><Input label="购买日期" required type="date" max={toLocalDateValue()} value={date} onValueChange={setDate}/><SelectField label="分类" required value={category} onValueChange={setCategory}><option>数码</option><option>家居</option><option>交通</option><option>兴趣</option><option>其他</option></SelectField><Button type="submit" size="lg" ripple><Plus size={17}/> 添加物品</Button></form>
    <div className="list-section assets-list-section"><div className="section-title"><h2>我的好物</h2><span>{items.length} 件</span></div>{items.length===0?<div className="empty">添加一个你已经拥有的东西，看看它现在平均每小时花了多少钱。</div>:<><div className="asset-grid">{visibleItems.map(i=>{const hours=Math.max(0,(now.getTime()-new Date(i.purchaseDate).getTime())/3600000);const c=assetCostPerHour(i.price,i.purchaseDate,now);return <article className="asset-card" key={i.id}><div className="asset-top"><span>{i.category}</span><button className="icon-button" type="button" onClick={()=>setPendingDelete(i)} aria-label={`删除 ${i.name}`} title="删除"><Trash2 size={16}/></button></div><h3>{i.name}</h3><p>购买价格 ¥{i.price.toLocaleString()}</p><div className="cost"><small>当前持有成本</small><strong>{Number.isFinite(c)?`¥${c.toFixed(c<1?3:2)}`:'—'} <i>/ 小时</i></strong><span>已拥有 {(hours/24).toFixed(1)} 天 · 每小时自动下降</span></div></article>})}</div><Pagination total={items.length} page={currentPage} onPageChange={setPage}/></>}</div>
    <ConfirmDialog open={Boolean(pendingDelete)} title={pendingDelete?`这件好物已经跟了你 ${formatOwnershipDuration(pendingDelete.purchaseDate,now)} 了，确定不要了吗？`:'确定不要了吗？'} message={pendingDelete?.name} confirmLabel="对，不要了" cancelLabel="算了，再想想" onConfirm={remove} onCancel={()=>setPendingDelete(null)}/>
  </section>
}
