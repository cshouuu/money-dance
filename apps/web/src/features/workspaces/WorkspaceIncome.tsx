import { useState, type FormEvent } from 'react'
import { getSummaryRange } from '../../lib/ledger'
import { toLocalDateValue, MAX_MONEY_AMOUNT } from '../../lib/form'
import { recordSpaceIncome, setSpaceIncomeDeleted } from '../../lib/workspaces/actions'
import { summarizeSpaces } from '../../lib/workspaces/queries'
import { templateAtDate } from '../../lib/workspaces/templates'
import { PRIMARY_SPACE_ID, templateFeatures, type WorkSpace } from '../../lib/workspaces/model'
import { workProfileForDate } from '@salary-flow/core'
import { Button, Input } from '../../ui/BeuiControls'

export function WorkspaceIncome({ space }: { space: WorkSpace }) {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(toLocalDateValue)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null)
  const today = toLocalDateValue()
  const template = templateAtDate(space.profile, space.template, today)
  const relevant = template === 'sales' || templateFeatures(template).hourly
  const records = space.ledger.filter(entry => entry.kind === 'manual' && entry.direction === 'income' && (space.id !== PRIMARY_SPACE_ID || entry.spaceId || entry.workStageId))
  if (!relevant && !records.length) return null
  const { start, end } = getSummaryRange('month', today.slice(0, 7))
  const summary = summarizeSpaces([space], start, end, new Date(), space.id)
  const target = workProfileForDate(space.profile, today).monthlyIncomeTarget ?? 0
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!event.currentTarget.reportValidity()) return
    setBusy(true); setError(''); setNotice('')
    try {
      await recordSpaceIncome(space.id, source, Number(amount), date)
      setAmount(''); setOpen(false); setNotice('已入账，可在公共账本按本空间查看。')
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  return <section className="workspace-panel"><h2>{template === 'sales' ? '业绩与提成' : '项目收入'}</h2>
    <p>本月累计收入 <b>¥{summary.income.toFixed(2)}</b>{target > 0 && <> / 目标 ¥{target.toFixed(2)} · 已完成 {(summary.income / target * 100).toFixed(1)}%</>}</p>
    <p>已自动计算的工资无需再记；这里只记录额外提成、奖金或项目款。</p>
    <div className="workspace-actions">{(template === 'sales' ? ['开单提成', '签单奖金'] : ['项目定金', '项目尾款']).map(label => <Button key={label} variant="secondary" onClick={() => { setSource(label); setOpen(true); setNotice('') }}>{label}</Button>)}</div>
    {open && <form onSubmit={submit}><div className="workspace-fields"><Input label="收入名称" required maxLength={50} value={source} onValueChange={setSource}/><Input label="到账金额（元）" required type="number" min="0.01" max={MAX_MONEY_AMOUNT} step="0.01" value={amount} onValueChange={setAmount}/><Input label="实际到账日期" required type="date" max={today} value={date} onValueChange={setDate}/></div><div className="workspace-actions"><Button disabled={busy} type="submit">确认入账</Button><Button disabled={busy} variant="ghost" onClick={() => setOpen(false)}>取消</Button></div></form>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!!records.length && <div className="workspace-income-records"><h3>已登记的额外收入</h3>{records.slice().reverse().map(entry => <div className="workspace-income-row" key={entry.id}><span>{entry.localDate} · {entry.source}{entry.deleted ? '（已撤销）' : ''}</span><b>¥{entry.amount.toFixed(2)}</b>
      {pendingRemoval === entry.id || entry.deleted ? <Button size="sm" variant="secondary" disabled={busy} onClick={async () => {
        setBusy(true); setError('')
        try { await setSpaceIncomeDeleted(space.id, entry.id, !entry.deleted); setPendingRemoval(null) }
        catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
      }}>{entry.deleted ? '恢复记录' : '确认撤销'}</Button> : <Button size="sm" variant="ghost" onClick={() => setPendingRemoval(entry.id)}>撤销</Button>}
      {pendingRemoval === entry.id && <Button size="sm" variant="ghost" onClick={() => setPendingRemoval(null)}>取消</Button>}
    </div>)}</div>}
  </section>
}
