import { Grid2X2, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { DEFAULT_DOCK_PATHS, loadDockPaths, saveDockPaths, setDockSlot } from '../lib/mobileDock'
import { NAVIGATION_ITEMS, type NavigationPath } from '../lib/navigation'
import { Button, SelectField } from '../ui/BeuiControls'
import { BottomSheet } from '../ui/BottomSheet'
import './MobileDockSettings.css'

const positions = ['第 1 项 · 最左', '第 2 项', '第 3 项', '第 4 项 · 最右']

function DockEditor({ close }: { close: () => void }) {
  const [draft, setDraft] = useState(loadDockPaths)
  const [error, setError] = useState('')
  const save = () => {
    if (!saveDockPaths(draft)) { setError('暂时无法保存，请检查浏览器存储空间后重试。'); return }
    close()
  }
  const preview = draft.map(path => NAVIGATION_ITEMS.find(([to]) => to === path)!)
  return <div className="dock-settings-editor">
    <div className="dock-settings-preview" role="group" aria-label="底部栏预览，从左到右">
      {preview.map(([path, Icon, label], index) => <div key={index} className="dock-settings-preview-pair">
        {index === 2 && <div className="dock-settings-preview-all"><Grid2X2 size={20}/><span>全部</span></div>}
        <div data-path={path}><Icon size={20}/><span>{label}</span></div>
      </div>)}
    </div>
    <p className="dock-settings-hint">按位置选择四个常用功能。选择已使用的功能会交换位置，中间的「全部」始终保留。</p>
    <div className="dock-settings-fields">
      {draft.map((path, index) => <SelectField key={index} label={positions[index]} value={path}
        onValueChange={value => { setDraft(current => setDockSlot(current, index, value as NavigationPath)); setError('') }}>
        {NAVIGATION_ITEMS.map(([to, , label]) => <option key={to} value={to}>{label}</option>)}
      </SelectField>)}
    </div>
    <Button variant="ghost" size="sm" className="dock-settings-reset" onClick={() => { setDraft([...DEFAULT_DOCK_PATHS]); setError('') }}><RotateCcw size={15}/>恢复默认</Button>
    {error && <p className="dock-settings-error" role="alert">{error}</p>}
    <div className="dock-settings-actions"><Button variant="secondary" onClick={close}>取消</Button><Button variant="primary" onClick={save}>保存并应用</Button></div>
  </div>
}

export function MobileDockSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <BottomSheet open={open} onOpenChange={onOpenChange} title="自定义底部栏" description="选择你的四个常用入口，保存后立即生效。" className="dock-settings-sheet">
    {open && <DockEditor close={() => onOpenChange(false)}/>}
  </BottomSheet>
}
