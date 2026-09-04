import { calculateRates, formatDuration, priceToWorkSeconds } from '@salary-flow/core'
import { CheckCircle2, Clock3, Plus, ShoppingBag, Trash2 } from 'lucide-react'
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
import { Button, Input } from '../ui/BeuiControls'
import './Converter.css'

function formatWorkDays(workSeconds: number, paidSecondsPerDay: number) {
  if (!Number.isFinite(workSeconds) || !Number.isFinite(paidSecondsPerDay) || paidSecondsPerDay <= 0) return '∞'
  return (workSeconds / paidSecondsPerDay).toFixed(2)
}

function formatMoney(value: number) {
  return `¥${Math.max(0, value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
}

export type WishEstimateState = 'complete' | 'reached' | 'pending' | 'unavailable'

export function formatWishEstimate(value: Date | null, now: Date, complete: boolean): { label: string; state: WishEstimateState } {
  if (complete) return { label: '已达成', state: 'complete' }
  if (!value || Number.isNaN(value.getTime())) return { label: '当前日程下暂无法估算', state: 'unavailable' }
  if (value.getTime() <= now.getTime()) return { label: '已到达预计达成时间', state: 'reached' }

  const includeYear = value.getFullYear() !== now.getFullYear()
  const date = [
    ...(includeYear ? [value.getFullYear()] : []),
    value.getMonth() + 1,
    value.getDate(),
  ].join('/')
  const time = `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
  return { label: `预计 ${date} ${time} 达成`, state: 'pending' }
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

  return <section className="page converter-page">
    <header className="page-header"><div><p className="eyebrow">TIME CONVERTER</p><h1>这个东西，值你工作多久？</h1><p>把价格换算成真实的工作时间，并持续看看离它还有多远。</p></div></header>
    <form className="input-card" onSubmit={add}>
      <div className="form-card-heading"><span>NEW WISH</span><div><b>添加一个心愿</b><small>输入价格，立即换算需要投入的真实工作时间。</small></div></div>
      <Input label="想买什么" required maxLength={60} autoComplete="off" value={name} onValueChange={setName} placeholder="例如：AirPods Pro" />
      <Input label="价格" required type="number" inputMode="decimal" min="0" max={MAX_MONEY_AMOUNT} step="0.01" value={price} leftIcon="¥" onKeyDown={preventInvalidNumberKey} onValueChange={value => setPrice(normalizeDecimalInput(value))} placeholder="1899" />
      {previewWorkSeconds !== null ? <div className="live-result converter-live-result"><small>连续纯工时（24小时制）</small><strong>{formatDuration(previewWorkSeconds)}</strong><span>按你的工作日程 ≈ {formatWorkDays(previewWorkSeconds, rates.paidSecondsPerDay)} 个工作日</span></div> : null}
      <Button type="submit" size="lg" ripple><Plus size={17} /> 保存换算</Button>
    </form>
    <div className="list-section">
      <div className="section-title"><h2>心愿清单</h2><span>{wishlistItems.length} 项</span></div>
      {wishlistItems.length === 0
        ? <div className="empty">还没有心愿。先把一个想买的东西换成工作时间吧。</div>
        : <><div className="item-list">{visibleItems.map(item => {
            const progress = visibleProgress.get(item.id)
            const workSeconds = progress?.requiredSeconds ?? priceToWorkSeconds(item.price, rates.second)
            const remainingSeconds = progress?.remainingSeconds ?? workSeconds
            const earnedAmount = progress?.earnedAmount ?? 0
            const remainingAmount = progress?.remainingAmount ?? Math.max(0, item.price - earnedAmount)
            const complete = (progress?.progress ?? (item.price <= 0 ? 1 : 0)) >= 1 || remainingAmount <= 0
            const percent = Math.min(100, Math.max(0, (progress?.progress ?? 0) * 100))
            const estimate = formatWishEstimate(progress?.estimatedAt ?? null, now, complete)
            return <article className="list-card converter-card" key={item.id}>
              <header className="converter-card-header">
                <div className="item-avatar">{item.name.trim().slice(0, 1).toUpperCase() || '愿'}</div>
                <div className="converter-wish-title"><b>{item.name}</b><span>目标金额</span></div>
                <strong className="converter-wish-price">{formatMoney(item.price)}</strong>
              </header>
              <div className="wish-progress">
                <div className="wish-progress-heading"><span>心愿进度</span><strong>{percent.toFixed(0)}%</strong></div>
                <div className="wish-progress-track" role="progressbar" aria-label={`${item.name} 的完成进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><i style={{ width: `${percent}%` }} /></div>
                <div className="wish-progress-money"><span>已积累 <b>{formatMoney(earnedAmount)}</b></span><span>还差 <b>{formatMoney(remainingAmount)}</b></span></div>
              </div>
              <div className="converter-time-summary">
                <div><span>还需纯工时</span><strong>{formatDuration(remainingSeconds)}</strong></div>
                <p>目标总工时 <b>{formatDuration(workSeconds)}</b><i>·</i>约 <b>{formatWorkDays(workSeconds, rates.paidSecondsPerDay)}</b> 个工作日</p>
              </div>
              <footer className="converter-card-footer">
                <span className={`wish-estimate ${estimate.state}`} title={estimate.label}>
                  {estimate.state === 'complete' ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}
                  <span>{estimate.label}</span>
                </span>
                <div className="converter-actions">
                  <Button className="buy-button" variant="secondary" size="sm" onClick={() => setPending({ type: 'purchase', item })}><ShoppingBag size={15} /><span>已买</span></Button>
                  <Button className="wish-delete-button" variant="secondary" size="icon" onClick={() => setPending({ type: 'delete', item })} aria-label={`删除 ${item.name}`} title="删除"><Trash2 size={17} /></Button>
                </div>
              </footer>
            </article>
          })}</div><Pagination total={wishlistItems.length} page={currentPage} onPageChange={setPage} /></>}
    </div>
    <ConfirmDialog open={Boolean(pending)} title={pending?.type === 'delete' ? '真不想要了？' : '你真买了？'} message={pending?.item.name} confirmLabel={pending?.type === 'delete' ? '真不要了' : '我真买了'} cancelLabel={pending?.type === 'delete' ? '我再想想' : '骗你的'} onConfirm={confirmAction} onCancel={() => setPending(null)} />
    {showPurchaseToast ? <div className="purchase-toast"><div><b>别忘了录入物品哦</b><span>记录购买日期后，就能开始看它的持有成本。</span></div><Link to="/assets" onClick={() => setShowPurchaseToast(false)}>去录入</Link><button type="button" onClick={() => setShowPurchaseToast(false)} aria-label="关闭提醒">×</button></div> : null}
  </section>
}
