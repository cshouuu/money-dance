import { initializePrimarySpace } from '../lib/workspaces/store'
import { WorkspaceSetup } from '../features/workspaces/WorkspaceSetup'
import './SalarySetup.css'

/** Business controllers stay unmounted until real salary and work rules are saved. */
export function SalarySetup({ onComplete }: { onComplete: () => void }) {
  return <main className="salary-setup">
    <header><p className="eyebrow">MONEY DANCE</p><h1>从你的真实工资开始</h1>
      <p>先选择工作方式，只填写与你有关的设置。以后还可以添加兼职或其他工作空间。</p></header>
    <WorkspaceSetup initial onSave={space => {
      initializePrimarySpace(space)
      if (space.template === 'nurse' || space.template === 'factory') window.history.replaceState(null, '', '/roster')
      onComplete()
    }}/>
  </main>
}
