// Dev-server fixture: real components and production CSS order, no saved user data.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { domAnimation, LazyMotion } from 'motion/react'
import { AttendanceDialog } from '../src/components/AttendanceDialog'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { EarlyFinishDialog } from '../src/components/EarlyFinishDialog'
import { LedgerEntryDialog } from '../src/components/LedgerEntryDialog'
import { OvertimeStartDialog } from '../src/components/OvertimeStartDialog'
import { OvertimeBackfillDialog } from '../src/components/OvertimeBackfillDialog'
import { SlackingTimeDialog } from '../src/components/SlackingTimeDialog'
import { WorkTimeDialog } from '../src/components/WorkTimeDialog'
import { BottomSheet } from '../src/ui/BottomSheet'
import { Input, SelectField } from '../src/ui/BeuiControls'
import '../src/App'
import '../src/styles.css'
import '../src/mobile.css'

const cases = ['attendance', 'confirm', 'early-finish', 'ledger', 'overtime-start', 'overtime-backfill', 'slacking', 'work-time', 'picker', 'sheet', 'select']
const date = '2026-09-02'
const leaveRecord = { date, status: 'leave' as const, leaveType: 'personal' as const, payMode: 'unpaid' as const, updatedAt: '2026-09-02T09:00:00.000Z' }
const longMessage = '回归检查：长内容应当能上下滚动，底部操作按钮可以完整显示。'.repeat(20)

function Fixture() {
  const [active, setActive] = useState(new URLSearchParams(location.search).get('case') ?? '')
  const [value, setValue] = useState('2026-09-02T09:00')
  const [dateValue, setDateValue] = useState(date)
  const [timeValue, setTimeValue] = useState('09:00')
  const close = () => setActive('')
  return <LazyMotion features={domAnimation} strict>
    <main style={{ padding: 20 }}>
      <h1>弹窗滚动回归检查</h1>
      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {cases.map(name => <a key={name} href={`?case=${name}`}>{name}</a>)}
      </nav>
      {active === 'picker' && <>
        <Input label="测试日期" type="date" value={dateValue} onValueChange={setDateValue}/>
        <Input label="测试时间" type="time" value={timeValue} onValueChange={setTimeValue}/>
        <Input label="测试日期时间" type="datetime-local" value={value} onValueChange={setValue}/>
      </>}
      {active === 'select' && <SelectField label="长列表" value={value} onValueChange={setValue}>
        {Array.from({ length: 30 }, (_, i) => <option key={i} value={String(i)}>选项 {i + 1}</option>)}
      </SelectField>}
      <p role="status">{active || '已关闭'}</p>
    </main>
    <AttendanceDialog open={active === 'attendance'} date={date} record={leaveRecord} onSave={() => true} onReset={() => true} onCancel={close}/>
    <ConfirmDialog open={active === 'confirm'} title="长文本确认" message={longMessage} confirmLabel="确认" cancelLabel="取消" onConfirm={close} onCancel={close}/>
    <EarlyFinishDialog open={active === 'early-finish'} settlementKind="under-target" workedSeconds={3600} targetSeconds={28800} actualAmount={20} fullDayAmount={160} secondRate={0.01} onActual={close} onFullDay={close} onAttendance={close} onOvertime={close} onCancel={close}/>
    <LedgerEntryDialog open={active === 'ledger'} entry={null} initialDate={date} onSave={close} onCancel={close}/>
    <OvertimeStartDialog open={active === 'overtime-start'} onStart={() => null} onCancel={close}/>
    <OvertimeBackfillDialog open={active === 'overtime-backfill'} onSave={() => null} onCancel={close}/>
    <SlackingTimeDialog open={active === 'slacking'} purpose="backfill" onStart={() => null} onBackfill={() => null} onCancel={close}/>
    <WorkTimeDialog open={active === 'work-time'} purpose="adjust" date={date} plannedStart="09:00" onStart={close} onAdjust={close} onCancel={close}/>
    <BottomSheet open={active === 'sheet'} onOpenChange={close} title="多行说明的底部面板" description={'标题说明换行时，内容区域应按剩余空间收缩。'.repeat(4)}>
      {Array.from({ length: 20 }, (_, i) => <p key={i}>面板内容 {i + 1}</p>)}
      <button onClick={close}>底部操作</button>
    </BottomSheet>
  </LazyMotion>
}

createRoot(document.getElementById('root')!).render(<Fixture/> )
