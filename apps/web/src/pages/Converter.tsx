import { calculateRates, formatDuration, priceToWorkSeconds } from '@salary-flow/core'
import { Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { getPageCount, getPageItems, Pagination } from '../components/Pagination'
import { loadAttendanceRecords } from '../lib/attendance'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey, toLocalDateValue } from '../lib/form'
import { createId } from '../lib/id'
import { appendLedgerEntry } from '../lib/ledger'
import { loadProfile, salaryProfileForBusinessDate } from '../lib/profile'
import { keys, loadJSON, saveJSON } from '../lib/storage'
import { useNow } from '../lib/useNow'
import { getWishProgress } from '../lib/wishProgress'
import { loadWorkRecords } from '../lib/work'
import type { WishItem } from '../types'
import './Converter.css'

function formatWorkDays(workSeconds: number, paidSecondsPerDay: number) {
  if (!Number.isFinite(workSeconds) || !Number.isFinite(paidSecondsPerDay) || paidSecondsPerDay <= 0) return '∞'
  return (workSeconds / paidSecondsPerDay).toFixed(2)
}

function formatEstimate(value: Date | null) {
  if (!value) return '当前日程下暂无法估算'
  return `预计 ${value.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} 达成`
}

type PendingAction = { type: 'delete' | 'purchase'; item: WishItem } | null

export function Converter() {
  const [search] = useSearchParams()
  const now = useNow(60_000)
  const [profile] = useState(() => loadProfile())
  const [attendanceRecords] = useState(() => loadAttendanceRecords())
  const [workRecords] = useState(() => loadWorkRecords())
  const [items, setItems] = useState<WishItem[]>(() => loadJSON(keys.wishes, []))
  const [name, setName] = useState(search.get('name') || '')
  const [price, setPrice] = useState(search.get('price') || '')
  const [pending, setPending] = useState<PendingAction>(null)
  const [showPurchaseToast, setShowPurchaseToast] = useState(false)
  const [page, setPage] = useState(1)
  const currentDate = toLocalDateValue(now)
  const rates = useMemo(() => calculateRates(
    salaryProfileForBusinessDate(profile, currentDate, attendanceRecords),
  ), [attendanceRecords, currentDate, profile])
  const wishlistItems = useMemo(() => items.filter(item => !item.purchasedAt), [items])
  const currentPage = Math.min(page, getPageCount(wishlistItems.length))
  const visibleItems = useMemo(
    () => getPageItems(wishlistItems, currentPage),
    [currentPage, wishlistItems],
  )
  const visibleProgress = useMemo(() => new Map(visibleItems.map(item => [
    item.id,
    getWishProgress(item, profile, now, workRecords, attendanceRecords),
  ])), [attendanceRecords, now, profile, visibleItems, workRecords])

  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedPrice = parseNumberInput(price)
    if (!event.currentTarget.reportValidity() || !name.trim() || parsedPrice === null || parsedPrice < 0 || parsedPrice > MAX_MONEY_AMOUNT) return
    const next = [{ id: createId(), name: name.trim(), price: parsedPrice, createdAt: new Date().toISOString() }, ...items]
    setItems(next)
    saveJSON(keys.wishes, next)
    setPage(1)
    setName('')
    setPrice('')
  }

  const remove = (item: WishItem) => {
    const next = items.filter(candidate => candidate.id !== item.id)
    setItems(next)
    saveJSON(keys.wishes, next)
    setPending(null)
  }

  const purchase = (item: WishItem) => {
    if (item.purchasedAt) {
      setPending(null)
      return
    }
    const purchasedAt = new Date().toISOString()
    const next = items.map(candidate => candidate.id === item.id ? { ...candidate, purchasedAt } : candidate)
    setItems(next)
    saveJSON(keys.wishes, next)
    appendLedgerEntry({
      id: createId(),
      kind: 'purchase',
      direction: 'expense',
      amount: item.price,
      source: `已买 · ${item.name}`,
      occurredAt: purchasedAt,
      linkedId: item.id,
    })
    setPending(null)
    setShowPurchaseToast(true)
  }

  const confirmAction = () => {
    if (!pending) return
    if (pending.type === 'delete') remove(pending.item)
    else purchase(pending.item)
  }
  const previewPrice = parseNumberInput(price)
  const previewWorkSeconds = previewPrice !== null && previewPrice >= 0 && previewPrice <= MAX_MONEY_AMOUNT
    ? priceToWorkSeconds(previewPrice, rates.second)
    : null

  return <section className="page">
    <header className="page-header"><div><p className="eyebrow">TIME CONVERTER</p><h1>这个东西，值你工作多久？</h1><p>把价格换算成真实的工作时间，并持续看看离它还有多远。</p></div></header>
    <form className="input-card" onSubmit={add}>
      <label><span>想买什么</span><input required maxLength={60} autoComplete="off" value={name} onChange={event => setName(event.target.value)} placeholder="例如：AirPods Pro" /></label>
      <label><span>价格</span><div className="money-input"><i>¥</i><input required type="number" inputMode="decimal" min="0" max={MAX_MONEY_AMOUNT} step="0.01" value={price} onKeyDown={preventInvalidNumberKey} onChange={event => setPrice(normalizeDecimalInput(event.target.value))} placeholder="1899" /></div></label>
      {previewWorkSeconds !== null ? <div className="live-result converter-live-result"><small>连续纯工时（24小时制）</small><strong>{formatDuration(previewWorkSeconds)}</strong><span>按你的工作日程 ≈ {formatWorkDays(previewWorkSeconds, rates.paidSecondsPerDay)} 个工作日</span></div> : null}
      <button className="primary-button" type="submit"><Plus size={17} /> 保存换算</button>
    </form>
    <div className="list-section">
      <div className="section-title"><h2>心愿清单</h2><span>{wishlistItems.length} 项</span></div>
      {wishlistItems.length === 0
        ? <div className="empty">还没有心愿。先把一个想买的东西换成工作时间吧。</div>
        : <><div className="item-list">{visibleItems.map(item => {
            const progress = visibleProgress.get(item.id)
            const workSeconds = progress?.requiredSeconds ?? priceToWorkSeconds(item.price, rates.second)
            const percent = (progress?.progress ?? 0) * 100
            return <article className="list-card converter-card" key={item.id}>
              <div className="item-avatar">{item.name.trim().slice(0, 1).toUpperCase() || '愿'}</div>
              <div className="item-main"><b>{item.name}</b><span>¥{item.price.toLocaleString('zh-CN')}</span></div>
              <div className="item-result converter-result">
                <div><small>连续纯工时（24小时制）</small><strong>{formatDuration(workSeconds)}</strong></div>
                <div><small>按你的工作日程</small><strong>≈ {formatWorkDays(workSeconds, rates.paidSecondsPerDay)} 个工作日</strong></div>
              </div>
              <div className="converter-actions">
                <button className="buy-button" type="button" onClick={() => setPending({ type: 'purchase', item })}><ShoppingBag size={15} /><span>已买</span></button>
                <button className="icon-button" type="button" onClick={() => setPending({ type: 'delete', item })} aria-label={`删除 ${item.name}`} title="删除"><Trash2 size={17} /></button>
              </div>
              <div className="wish-progress">
                <div className="wish-progress-heading"><span>从加入心愿起，已赚到 <b>¥{(progress?.earnedAmount ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</b></span><strong>{percent.toFixed(0)}%</strong></div>
                <div className="wish-progress-track" role="progressbar" aria-label={`${item.name} 的完成进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><i style={{ width: `${percent}%` }} /></div>
                <div className="wish-progress-meta"><span>还差 {formatDuration(progress?.remainingSeconds ?? workSeconds)} 纯工时</span><span>{formatEstimate(progress?.estimatedAt ?? null)}</span></div>
              </div>
            </article>
          })}</div><Pagination total={wishlistItems.length} page={currentPage} onPageChange={setPage} /></>}
    </div>
    <ConfirmDialog open={Boolean(pending)} title={pending?.type === 'delete' ? '真不想要了？' : '你真买了？'} message={pending?.item.name} confirmLabel={pending?.type === 'delete' ? '真不要了' : '我真买了'} cancelLabel={pending?.type === 'delete' ? '我再想想' : '骗你的'} onConfirm={confirmAction} onCancel={() => setPending(null)} />
    {showPurchaseToast ? <div className="purchase-toast"><div><b>别忘了录入物品哦</b><span>记录购买日期后，就能开始看它的持有成本。</span></div><Link to="/assets" onClick={() => setShowPurchaseToast(false)}>去录入</Link><button type="button" onClick={() => setShowPurchaseToast(false)} aria-label="关闭提醒">×</button></div> : null}
  </section>
}
