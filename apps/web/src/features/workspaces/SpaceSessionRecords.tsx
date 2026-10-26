import { useState } from 'react'
import { calculateRates, isEmployedOn } from '@salary-flow/core'
import { Button, Input, SelectField } from '../../ui/BeuiControls'
import { createCompletedOvertimeSession, createOvertimeLedgerEntries, hasOverlappingOvertime } from '../../lib/overtime'
import { createCompletedSlackingSession, hasOverlappingSlacking } from '../../lib/slacking'
import { calculatePaidTimeEarnings } from '../../lib/paidTime'
import { salaryProfileForBusinessDate } from '../../lib/profile'
import { createId } from '../../lib/id'
import { toLocalDateValue } from '../../lib/form'
import { commitWorkspaces, loadWorkspaceStore, replaceSpace } from '../../lib/workspaces/store'
import { PRIMARY_SPACE_ID } from '../../lib/workspaces/model'
import { useWorkspaces } from './useWorkspaces'
import './Workspaces.css'

export function SpaceSessionRecords({ kind }: { kind: 'slacking' | 'overtime' }) {
  const spaces = useWorkspaces().filter(space => space.id !== PRIMARY_SPACE_ID)
  const [selected, setSelected] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [amount, setAmount] = useState('1.5')
  const [payMode, setPayMode] = useState<'multiplier' | 'fixed' | 'unpaid'>('multiplier')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  if (!spaces.length) return null
  const records = spaces.flatMap(space => (kind === 'slacking' ? space.slacking : space.overtime).map(record => ({ ...record, spaceName: space.name })))
  const save = async () => {
    setBusy(true); setError(''); setNotice('')
    try {
      const snapshot = loadWorkspaceStore(); const space = snapshot.spaces.find(item => item.id === selected)
      if (!space) throw new Error('请选择记录归属空间。')
      const startAt = new Date(start); const endAt = new Date(end)
      if (!Number.isFinite(+startAt) || !Number.isFinite(+endAt) || endAt <= startAt || endAt > new Date()) throw new Error('请填写有效的已完成时段，结束必须晚于开始且不能在未来。')
      const date = toLocalDateValue(startAt)
      if (!isEmployedOn(space.profile, date)) throw new Error('开始日期不在该空间的任职范围内。')
      const input = { id: createId(), startTime: startAt.toISOString(), endTime: endAt.toISOString() }
      let next = space
      if (kind === 'overtime') {
        if (hasOverlappingOvertime(space.overtime, input.startTime, input.endTime)) throw new Error('与这个空间已有加班记录重叠。')
        const rate = calculateRates(salaryProfileForBusinessDate(space.profile, date, space.attendanceRecords, space.holidaySettings)).second
        const session = createCompletedOvertimeSession({ ...input, payMode, multiplier: Number(amount), fixedAmount: Number(amount) }, rate)
        if (!session) throw new Error('计薪金额或倍率无效。')
        next = { ...space, overtime: [...space.overtime, session], ledger: [...space.ledger, ...createOvertimeLedgerEntries(session, createId)] }
      } else {
        if (hasOverlappingSlacking(space.slacking, input.startTime, input.endTime)) throw new Error('与这个空间已有摸鱼记录重叠。')
        const earned = calculatePaidTimeEarnings(space.profile, startAt, endAt, space.workRecords, space.attendanceRecords, space.holidaySettings)
        const session = createCompletedSlackingSession(input, { paidDurationSeconds: earned.paidSeconds, earnedAmount: earned.earnedAmount })
        if (!session) throw new Error('记录时段无效。')
        next = { ...space, slacking: [...space.slacking, session] }
      }
      await commitWorkspaces(snapshot, store => replaceSpace(store, next)); setNotice(`已记入「${space.name}」。`); setStart(''); setEnd('')
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  return <section className="workspace-panel"><h2>其他空间的{kind === 'slacking' ? '摸鱼' : '加班'}记录</h2><p>主业计时与记录保留在下方。此处补记其他空间，金额按该空间规则结算。</p><div className="workspace-fields"><SelectField label="记录归属空间" value={selected} onValueChange={setSelected}><option value="">请选择</option>{spaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}</SelectField><Input type="datetime-local" label="开始时间" value={start} onValueChange={setStart}/><Input type="datetime-local" label="结束时间" value={end} onValueChange={setEnd}/>{kind === 'overtime' && <><SelectField label="加班计薪" value={payMode} onValueChange={value => setPayMode(value as typeof payMode)}><option value="multiplier">空间时薪倍率</option><option value="fixed">固定金额</option><option value="unpaid">无偿加班</option></SelectField>{payMode !== 'unpaid' && <Input label={payMode === 'fixed' ? '固定金额' : '时薪倍率'} type="number" min={0} value={amount} onValueChange={setAmount}/>}</>}</div><Button disabled={busy} onClick={save}>保存记录</Button>{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{records.sort((a,b) => b.startTime.localeCompare(a.startTime)).map(record => <div className="workspace-journey-row" key={record.id}><span>{record.spaceName} · {new Date(record.startTime).toLocaleString('zh-CN')}</span><b>{(record.durationSeconds / 3600).toFixed(2)} 小时 · ¥{record.earnedAmount.toFixed(2)}</b></div>)}</section>
}
