import { useProfile } from '../lib/useProfile'
import { calculateRates, formatDuration, priceToWorkSeconds } from '@salary-flow/core'
import { ArrowUp, CheckCircle2, Clock3, Pencil, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { getPageCount, getPageItems, Pagination } from '../components/Pagination'
import { loadAttendanceRecords } from '../lib/attendance'
import { MAX_MONEY_AMOUNT, normalizeDecimalInput, parseNumberInput, preventInvalidNumberKey, toLocalDateValue } from '../lib/form'
import { createId } from '../lib/id'
import { salaryProfileForBusinessDate } from '../lib/profile'
import { keys, loadJSON, saveJSON } from '../lib/storage'
import { useNow } from '../lib/useNow'
import { getWishProgress } from '../lib/wishProgress'
import { isWidgetBridgeAvailable } from '../lib/widgetBridge'
import { loadWorkRecords } from '../lib/work'
import { useWishStore } from '../lib/useWishStore'
import { commitWishChange, type WishChange, type WishStore } from '../lib/wishStore'
import { createWishAllocationPlan, getQueuedWishProgress, type QueuedWishProgress } from '../lib/wishAllocation'
import type { WishItem } from '../types'
import { Button, Input, SelectField } from '../ui/BeuiControls'
import { formatWishEstimate } from './converterEstimate'
import './Converter.css'

function formatWorkDays(workSeconds: number, paidSecondsPerDay: number) {
  if (!Number.isFinite(workSeconds) || !Number.isFinite(paidSecondsPerDay) || paidSecondsPerDay <= 0) return '∞'
  return (workSeconds / paidSecondsPerDay).toFixed(2)
}
function formatMoney(value: number) {
  return `¥${Math.max(0, value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
type PendingAction = { type: 'delete' | 'purchase'; item: WishItem; store: WishStore } | null

export function Converter() {
  const [search] = useSearchParams()
  const now = useNow(60_000)
  const profile = useProfile()
  const store = useWishStore()
  const { items, plan } = store
  const attendanceRecords = useMemo(loadAttendanceRecords, [store])
  const workRecords = useMemo(loadWorkRecords, [store])
  const [name, setName] = useState(search.get('name') || '')
  const [price, setPrice] = useState(search.get('price') || '')
  const [startedDate, setStartedDate] = useState(() => toLocalDateValue())
  const [editing, setEditing] = useState<{ item: WishItem; store: WishStore } | null>(null)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [migration, setMigration] = useState<WishStore | null>(null)
  const [widgetIds, setWidgetIds] = useState<string[]>(() => loadJSON(keys.widgetWishes, []))
  const [pending, setPending] = useState<PendingAction>(null)
  const [showPurchaseToast, setShowPurchaseToast] = useState(false)
  const [page, setPage] = useState(1)
  const currentDate = toLocalDateValue(now)
  const rates = useMemo(() => calculateRates(salaryProfileForBusinessDate(profile, currentDate, attendanceRecords)), [attendanceRecords, currentDate, profile])
  const wishlistItems = useMemo(() => items.filter(item => !item.purchasedAt), [items])
  const currentPage = Math.min(page, getPageCount(wishlistItems.length))
  const visibleItems = useMemo(() => getPageItems(wishlistItems, currentPage), [currentPage, wishlistItems])
  const queued = useMemo(() => plan ? getQueuedWishProgress(plan, profile, now, workRecords, attendanceRecords) : null, [attendanceRecords, now, plan, profile, workRecords])
  const visibleProgress = useMemo(() => queued?.progress ?? new Map(visibleItems.map(item => [item.id, getWishProgress(item, profile, now, workRecords, attendanceRecords)])), [attendanceRecords, now, profile, queued, visibleItems, workRecords])
  const migrationPreview = useMemo(() => migration ? getQueuedWishProgress(createWishAllocationPlan(migration.items, now), profile, now, workRecords, attendanceRecords) : null, [attendanceRecords, migration, now, profile, workRecords])
  const needsMigration = !plan && items.length > 0
  const disabled = busy || Boolean(store.error)

  const saveChange = async (change: WishChange, expected = store) => {
    if (busy) return false
    setBusy(true)
    setFormError('')
    setNotice('')
    try {
      const error = await commitWishChange(expected, change)
      if (error) { setFormError(error); return false }
      return true
    } catch { setFormError('心愿暂时无法保存，请重试。'); return false }
    finally { setBusy(false) }
  }
  const clearEditor = () => { setEditing(null); setName(''); setPrice(''); setStartedDate(toLocalDateValue()) }
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const parsedPrice = parseNumberInput(price)
    if (disabled || !event.currentTarget.reportValidity() || !name.trim() || parsedPrice === null || parsedPrice < 0 || parsedPrice > MAX_MONEY_AMOUNT) return
    const start = new Date(startedDate + 'T00:00:00')
    if (!Number.isFinite(start.getTime())) return
    const existing = editing?.item
    const startedAt = existing && startedDate === toLocalDateValue(new Date(existing.startedAt ?? existing.createdAt)) ? existing.startedAt : start.toISOString()
    const item: WishItem = existing ? { ...existing, name: name.trim(), price: parsedPrice, startedAt }
      : { id: createId(), name: name.trim(), price: parsedPrice, createdAt: new Date().toISOString(), startedAt }
    if (await saveChange({ type: 'save', item }, editing?.store ?? store)) {
      setNotice(needsMigration ? '心愿已保存，仍沿用各自独立估算的进度。' : existing ? '心愿已更新。此前分配保留，超过新价格的金额继续分给后续心愿。' : '心愿已加入队尾，按顺序分配。')
      form.reset()
      clearEditor()
      setPage(1)
    }
  }
  const confirmAction = async () => {
    if (!pending || busy) return
    const action = pending
    if (await saveChange({ type: action.type, id: action.item.id }, action.store)) {
      setPending(null)
      if (action.type === 'purchase') setShowPurchaseToast(true)
      else setNotice(plan ? '心愿已删除，原分配金额已释放给后续心愿或留在待分配余额中。' : '心愿已删除，其余心愿的独立估算不变。')
    }
  }
  const pendingAmount = pending ? queued?.allocation.amounts[pending.item.id] ?? 0 : 0
  const purchaseShortfall = pending ? Math.max(0, pending.item.price - pendingAmount - Math.max(0, queued?.allocation.available ?? 0)) : 0
  const confirmMessage = pending && !plan ? pending.type === 'delete' ? `删除「${pending.item.name}」，其余心愿继续按各自起始日期独立估算。` : `将「${pending.item.name}」标记已买，并记入 ${formatMoney(pending.item.price)} 购买支出。`
    : pending?.type === 'delete'
    ? `${pending.item.name}：已分配的 ${formatMoney(pendingAmount)} 将释放给后续心愿；没有后续心愿时保留为待分配余额。`
    : pending ? `${pending.item.name}：记录 ${formatMoney(pending.item.price)} 购买支出，已使用金额不再分给其他心愿。${purchaseShortfall > 0 ? `本次尚差 ${formatMoney(purchaseShortfall)}，之后的估算收入先补齐这个缺口。` : ''}` : ''
  const previewPrice = parseNumberInput(price)
  const previewWorkSeconds = previewPrice !== null && previewPrice >= 0 && previewPrice <= MAX_MONEY_AMOUNT ? priceToWorkSeconds(previewPrice, rates.second) : null
  const saving = wishlistItems.find(item => queued?.progress.get(item.id)?.state === 'saving')

  return <section className="page converter-page">
    <header className="page-header"><div><p className="eyebrow">WISH LIST</p><h1>按顺序，攒下每一个心愿。</h1><p>同一份工作收入只分配一次，攒够一个后自动继续下一个。</p></div></header>
    {store.error && <p role="alert">{store.error}</p>}
    {needsMigration && <section className="input-card wish-migration" aria-label="旧心愿分配预览">
      <div><b>让旧心愿共用一份收入</b><p>目前仍显示各自独立估算的进度。切换后，从原起始日期统一计算，再按创建顺序分配；以前标记已买的金额会扣除。</p></div>
      {!migration ? <Button onClick={() => { setMigration(store); setFormError('') }}>预览按顺序攒</Button> : migrationPreview && <>
        <p>统一收入估算 <b>{formatMoney(migrationPreview.allocation.income)}</b> · 已买 <b>{formatMoney(migrationPreview.allocation.spent)}</b></p>
        <div className="wish-migration-rows">{migrationPreview.allocation.items.filter(item => !item.purchasedAt).map((item, index) => <div key={item.id}><b>{index + 1}. {item.name}</b><span>{formatMoney(getWishProgress(item, profile, now, workRecords, attendanceRecords).earnedAmount)} → <strong>{formatMoney(migrationPreview.allocation.amounts[item.id] ?? 0)}</strong></span></div>)}</div>
        <p>{migrationPreview.allocation.available < 0 ? `历史购买尚差 ${formatMoney(-migrationPreview.allocation.available)}，后续收入先补齐。` : `待分配余额 ${formatMoney(migrationPreview.allocation.available)}。`}确认后，调整顺序只影响后续分配。</p>
        <div className="wish-review-actions"><Button disabled={busy} onClick={async () => { if (await saveChange({ type: 'adopt' }, migration)) { setMigration(null); setNotice('已切换为按顺序攒，旧心愿记录已保留。') } }}>确认按顺序攒</Button><Button variant="secondary" disabled={busy} onClick={() => setMigration(null)}>暂不切换</Button></div>
      </>}
    </section>}
    {queued && <section className="wish-queue-summary" aria-label="心愿收入分配">
      <b>{saving ? `正在攒：${saving.name}` : wishlistItems.some(item => queued.progress.get(item.id)?.state === 'upcoming') ? '等待心愿参与分配' : wishlistItems.length ? '当前心愿都已攒够' : '添加下一个想实现的心愿'}</b>
      <p>收入估算 {formatMoney(queued.allocation.income)} · 已买 {formatMoney(queued.allocation.spent)} · 待分配 {formatMoney(queued.allocation.available)}</p>
      {queued.allocation.available < -0.005 && <p className="wish-shortfall">提前购买尚差 {formatMoney(-queued.allocation.available)}，接下来的收入先补齐，再继续分配。</p>}
      <details><summary>进度怎么算</summary><p>从首个心愿的开始日期起，按工资和计薪工作时段估算，每份收入只分配一次。未用余额可用于之后参与的心愿。这里只扣除心愿的已买金额，不包含账本其他收支，也不代表银行存款余额。修正工资或出勤历史时，估算会按当时的心愿顺序重新计算。</p></details>
    </section>}
    {(formError || notice) && <p className="wish-operation-notice" role={formError ? 'alert' : 'status'}>{formError || notice}</p>}
    <form id="wish-form" className="input-card" onSubmit={add}>
      <div className="form-card-heading"><span>{editing ? 'EDIT WISH' : 'NEW WISH'}</span><div><b>{editing ? '编辑心愿' : '添加一个心愿'}</b><small>{needsMigration ? '目前沿用独立估算，可在上方预览新的分配方式。' : '填好名称和价格，默认加入队尾。'}</small></div></div>
      <Input label="想买什么" required maxLength={60} autoComplete="off" value={name} onValueChange={setName} placeholder="例如：耳机" />
      <Input label="价格" required type="number" inputMode="decimal" min="0" max={MAX_MONEY_AMOUNT} step="0.01" value={price} leftIcon="¥" onKeyDown={preventInvalidNumberKey} onValueChange={value => setPrice(normalizeDecimalInput(value))} placeholder="1899" />
      <Input label={plan ? '参与分配日期' : '从哪天开始攒'} required type="date" value={startedDate} onValueChange={setStartedDate} hint={plan ? '日期到了才参与分配，可使用待分配余额；修改日期不挪走已经分配的金额。' : '从这一天起按工作收入估算；未来日期到日后开始。'} />
      {previewWorkSeconds !== null && <div className="live-result converter-live-result"><small>这个价格相当于纯工时</small><strong>{formatDuration(previewWorkSeconds)}</strong><span>约 {formatWorkDays(previewWorkSeconds, rates.paidSecondsPerDay)} 个工作日，未含前面心愿的等待</span></div>}
      <Button type="submit" size="lg" ripple disabled={disabled}><Plus size={17}/>{editing ? '保存修改' : '添加心愿'}</Button>
      {editing && <Button variant="secondary" disabled={busy} onClick={clearEditor}>取消编辑</Button>}
    </form>
    {isWidgetBridgeAvailable() && <div className="input-card widget-wish-settings"><div className="form-card-heading"><span>ANDROID WIDGET</span><div><b>桌面心愿</b><small>最多展示 3 个心愿，进度按完整清单分配。约每小时刷新，打开应用立即刷新。</small></div></div>{[0, 1, 2].map(index => <SelectField key={index} label={'心愿 ' + (index + 1)} value={wishlistItems.some(item => item.id === widgetIds[index]) ? widgetIds[index] : ''} onValueChange={id => { const next = [0, 1, 2].map(i => i === index ? id : widgetIds[i] ?? ''); if (saveJSON(keys.widgetWishes, next)) setWidgetIds(next); else setFormError('桌面心愿暂时无法保存，请重试。') }}><option value="">暂不展示</option>{wishlistItems.filter(item => item.id === widgetIds[index] || !widgetIds.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>)}</div>}
    <div className="list-section">
      <div className="section-title"><h2>心愿清单</h2><span>{wishlistItems.length} 项</span></div>
      {!wishlistItems.length ? <div className="empty">还没有心愿。添加一个想实现的目标吧。</div> : <>
        {plan && <p className="wish-list-hint">从上往下攒。点“优先攒这个”调整后续顺序，已有分配保留。</p>}
        <div className="item-list">{visibleItems.map(item => {
          const progress = visibleProgress.get(item.id)
          const queueProgress = plan ? progress as QueuedWishProgress | undefined : undefined
          const workSeconds = progress?.requiredSeconds ?? priceToWorkSeconds(item.price, rates.second)
          const remainingSeconds = progress?.remainingSeconds ?? workSeconds
          const earnedAmount = progress?.earnedAmount ?? 0
          const remainingAmount = progress?.remainingAmount ?? Math.max(0, item.price - earnedAmount)
          const complete = !progress?.upcomingStart && remainingAmount < 0.0000001
          const percent = Math.min(100, Math.max(0, (progress?.progress ?? 0) * 100))
          const estimate = formatWishEstimate(progress?.estimatedAt ?? null, now, complete)
          const status = queueProgress?.state === 'funded' ? '已攒够' : queueProgress?.state === 'saving' ? '正在攒' : queueProgress?.state === 'waiting' ? '排队中' : progress?.upcomingStart ? `${toLocalDateValue(progress.upcomingStart)} 参与分配` : '独立估算 · 待切换'
          return <article className="list-card converter-card" key={item.id} data-wish-id={item.id}>
            <header className="converter-card-header"><div className="item-avatar">{queueProgress?.position ?? item.name.trim().slice(0, 1)}</div><div className="converter-wish-title"><b>{item.name}</b><span>{status}</span></div><strong className="converter-wish-price">{formatMoney(item.price)}</strong></header>
            <div className="wish-progress"><div className="wish-progress-heading"><span>{plan ? '分配进度' : '独立估算进度'}</span><strong>{percent.toFixed(0)}%</strong></div><div className="wish-progress-track" role="progressbar" aria-label={`${item.name} 的完成进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><i style={{ width: `${percent}%` }}/></div><div className="wish-progress-money"><span>{plan ? '预计已攒' : '独立估算'} <b>{formatMoney(earnedAmount)}</b></span><span>还差 <b>{formatMoney(remainingAmount)}</b></span></div></div>
            <div className="converter-time-summary"><div><span>本心愿还需纯工时</span><strong>{formatDuration(remainingSeconds)}</strong></div><p>目标总工时 <b>{formatDuration(workSeconds)}</b><i>·</i>约 <b>{formatWorkDays(workSeconds, rates.paidSecondsPerDay)}</b> 个工作日</p>{plan && <p>预计达成时间已计入排队等待。</p>}</div>
            <footer className="converter-card-footer"><span className={`wish-estimate ${estimate.state}`} title={estimate.label}>{complete ? <CheckCircle2 size={16}/> : <Clock3 size={16}/>}<span>{estimate.label}</span></span><div className="converter-actions"><Button variant="secondary" size="icon" disabled={disabled} aria-label={'编辑 ' + item.name} onClick={() => { setEditing({ item, store }); setName(item.name); setPrice(String(item.price)); setStartedDate(toLocalDateValue(new Date(item.startedAt ?? item.createdAt))); document.getElementById('wish-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><Pencil size={16}/></Button><Button className="buy-button" variant="secondary" size="sm" disabled={disabled} onClick={() => setPending({ type: 'purchase', item, store })}><ShoppingBag size={15}/><span>已买</span></Button><Button className="wish-delete-button" variant="secondary" size="icon" disabled={disabled} onClick={() => setPending({ type: 'delete', item, store })} aria-label={`删除 ${item.name}`}><Trash2 size={17}/></Button></div></footer>
            {plan && queueProgress && queueProgress.position > 1 && !complete && <Button className="wish-prioritize" variant="ghost" size="sm" disabled={busy} aria-label={`优先攒 ${item.name}`} onClick={async () => { if (await saveChange({ type: 'prioritize', id: item.id })) { setPage(1); setNotice(`接下来优先攒「${item.name}」，各心愿已经分配的金额保留。`) } }}><ArrowUp size={14}/>优先攒这个</Button>}
          </article>
        })}</div><Pagination total={wishlistItems.length} page={currentPage} onPageChange={setPage}/>
      </>}
    </div>
    <ConfirmDialog open={Boolean(pending)} title={pending?.type === 'delete' ? '删除这个心愿？' : '确认已经购买？'} message={formError && pending ? `${confirmMessage}\n${formError}` : confirmMessage} confirmLabel={busy ? '保存中…' : pending?.type === 'delete' ? plan ? '删除并释放金额' : '确认删除' : '确认已买'} cancelLabel="取消" onConfirm={() => { void confirmAction() }} onCancel={() => { if (!busy) setPending(null) }}/>
    {showPurchaseToast && <div className="purchase-toast"><div><b>购买已记入账本</b><span>也可以录入物品，继续查看它的持有成本。</span></div><Link to="/assets" onClick={() => setShowPurchaseToast(false)}>去录入</Link><button type="button" onClick={() => setShowPurchaseToast(false)} aria-label="关闭提醒">×</button></div>}
  </section>
}
