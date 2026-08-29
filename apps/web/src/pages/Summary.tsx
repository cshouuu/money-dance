import { Pencil, Plus, Trash2, TrendingDown, TrendingUp, WalletCards } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LedgerCalendar } from '../components/LedgerCalendar'
import { LedgerEntryDialog, type LedgerEntryDraft } from '../components/LedgerEntryDialog'
import { getPageCount, getPageItems, Pagination } from '../components/Pagination'
import { toLocalDateValue, toLocalMonthValue } from '../lib/form'
import { createId } from '../lib/id'
import { loadAttendanceRecords } from '../lib/attendance'
import { getSummaryRange, loadLedger, saveLedger, summarizeLedger, type SummaryDimension, type SummaryEntry } from '../lib/ledger'
import { loadProfile } from '../lib/profile'
import { loadWorkRecords } from '../lib/work'
import type { AttendanceRecord, DailyWorkRecord, LedgerEntry } from '../types'
import './Ledger.css'

function formatMoney(value: number) {
  return `${value < 0 ? '−' : ''}¥${Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

function initialDateForSelection(dimension: SummaryDimension, anchor: string): string {
  const today = toLocalDateValue()
  if (dimension === 'day') return anchor <= today ? anchor : today
  if (dimension === 'month') return anchor === toLocalMonthValue() ? today : `${anchor}-01`
  return anchor === String(new Date().getFullYear()) ? today : `${anchor}-01-01`
}

export function Summary() {
  const [profile] = useState(() => loadProfile())
  const [ledger, setLedger] = useState<LedgerEntry[]>(() => loadLedger())
  const [workRecords] = useState<DailyWorkRecord[]>(() => loadWorkRecords())
  const [attendanceRecords] = useState<AttendanceRecord[]>(() => loadAttendanceRecords())
  const [dimension, setDimension] = useState<SummaryDimension>('month')
  const [anchor, setAnchor] = useState(() => toLocalMonthValue())
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<SummaryEntry | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SummaryEntry | null>(null)

  const summary = useMemo(() => {
    const { start, end } = getSummaryRange(dimension, anchor)
    return summarizeLedger(profile, ledger, start, end, new Date(), workRecords, attendanceRecords)
  }, [dimension, anchor, profile, ledger, workRecords, attendanceRecords])
  const currentPage = Math.min(page, getPageCount(summary.entries.length))
  const visibleEntries = getPageItems(summary.entries, currentPage)

  const updateLedger = useCallback((next: LedgerEntry[]) => {
    saveLedger(next)
    setLedger(next)
  }, [])

  const changeSelection = useCallback((nextDimension: SummaryDimension, nextAnchor: string) => {
    setDimension(nextDimension)
    setAnchor(nextAnchor)
    setPage(1)
  }, [])

  const openAddDialog = useCallback(() => {
    setEditingEntry(null)
    setDialogOpen(true)
  }, [])

  const openEditDialog = useCallback((entry: SummaryEntry) => {
    setEditingEntry(entry)
    setDialogOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    setEditingEntry(null)
  }, [])

  const saveDraft = useCallback((draft: LedgerEntryDraft) => {
    let next: LedgerEntry[]
    if (!editingEntry) {
      next = [{ id: createId(), kind: 'manual', ...draft }, ...ledger]
    } else if (editingEntry.generated) {
      next = [{ id: createId(), kind: 'salary_override', replacesId: editingEntry.id, ...draft }, ...ledger]
    } else {
      next = ledger.map(entry => entry.id === editingEntry.ledgerEntryId ? { ...entry, ...draft } : entry)
    }
    updateLedger(next)
    closeDialog()
  }, [editingEntry, ledger, updateLedger, closeDialog])

  const cancelDelete = useCallback(() => setPendingDelete(null), [])
  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return
    let next: LedgerEntry[]
    if (pendingDelete.generated) {
      next = [{
        id: createId(),
        kind: 'salary_override',
        direction: pendingDelete.direction,
        amount: pendingDelete.amount,
        source: pendingDelete.source,
        occurredAt: pendingDelete.occurredAt,
        replacesId: pendingDelete.id,
        deleted: true,
      }, ...ledger]
    } else if (pendingDelete.kind === 'salary_override') {
      next = ledger.map(entry => entry.id === pendingDelete.ledgerEntryId ? { ...entry, deleted: true } : entry)
    } else {
      next = ledger.filter(entry => entry.id !== pendingDelete.ledgerEntryId)
    }
    updateLedger(next)
    setPendingDelete(null)
  }, [pendingDelete, ledger, updateLedger])

  return <section className="page"><header className="page-header"><div><p className="eyebrow">MONEY LEDGER</p><h1>账本</h1><p>把薪资、已买物品和意外收支放到同一本账里，按日、月、年看清真实结余。</p></div></header>
    <LedgerCalendar profile={profile} ledger={ledger} workRecords={workRecords} attendanceRecords={attendanceRecords} dimension={dimension} anchor={anchor} onChange={changeSelection}/>
    <div className="summary-metrics"><article><span className="summary-icon income"><TrendingUp size={18}/></span><small>收入合计</small><strong>{formatMoney(summary.income)}</strong></article><article><span className="summary-icon expense"><TrendingDown size={18}/></span><small>支出合计</small><strong>{formatMoney(summary.expense)}</strong></article><article className="net"><span className="summary-icon"><WalletCards size={18}/></span><small>账本结余</small><strong className={summary.net<0?'negative':''}>{formatMoney(summary.net)}</strong></article></div>
    <div className="list-section"><div className="section-title ledger-section-title"><div><h2>收支明细</h2><span>{summary.entries.length} 笔</span></div><button type="button" className="primary-button ledger-add-button" onClick={openAddDialog}><Plus size={16}/>新增明细</button></div>{summary.entries.length===0?<div className="empty ledger-empty"><p>这个时间范围还没有收支明细。</p><button type="button" className="ghost-button" onClick={openAddDialog}><Plus size={15}/>记一笔</button></div>:<><div className="ledger-list">{visibleEntries.map(entry=><article className="ledger-row" key={`${entry.id}-${entry.ledgerEntryId ?? 'generated'}`}><span className={`ledger-direction ${entry.direction}`}>{entry.direction==='income'?'+':'−'}</span><div className="ledger-source"><b>{entry.source}</b><span>{entry.category} · {formatDate(entry.occurredAt)}</span></div><strong className={entry.direction}>{entry.direction==='income'?'+':'−'}¥{entry.amount.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><div className="ledger-row-actions"><button type="button" className="icon-button" aria-label={`编辑${entry.source}`} onClick={()=>openEditDialog(entry)}><Pencil size={15}/></button><button type="button" className="icon-button danger" aria-label={`删除${entry.source}`} onClick={()=>setPendingDelete(entry)}><Trash2 size={15}/></button></div></article>)}</div><Pagination total={summary.entries.length} page={currentPage} onPageChange={setPage}/></>}</div>
    <LedgerEntryDialog open={dialogOpen} entry={editingEntry} initialDate={initialDateForSelection(dimension, anchor)} onSave={saveDraft} onCancel={closeDialog}/>
    <ConfirmDialog open={pendingDelete!==null} title="确定删除这笔收支明细吗？" message={pendingDelete ? `${pendingDelete.source} · ${formatDate(pendingDelete.occurredAt)}，删除后不会计入账本统计。` : undefined} confirmLabel="确定删除" cancelLabel="再想想" onConfirm={confirmDelete} onCancel={cancelDelete}/>
  </section>
}
