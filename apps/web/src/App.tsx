import { WorkspaceManager } from './features/workspaces/WorkspaceManager'
import { LazyMotion } from 'motion/react'
import { TEST_BUILD } from './lib/buildMode'
import { Roster } from './pages/Roster'
import { WorkJourney } from './pages/WorkJourney'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { TimerPlanController } from './components/TimerPlanController'
import { AppUpdatePrompt } from './components/AppUpdatePrompt'
import { Shell } from './components/Shell'
import { WidgetSyncController } from './components/WidgetSyncController'
import { Accidents } from './pages/Accidents'
import { Assets } from './pages/Assets'
import { Converter } from './pages/Converter'
import { Dashboard } from './pages/Dashboard'
import { Settings } from './pages/Settings'
import { Slacking } from './pages/Slacking'
import { Summary } from './pages/Summary'
import { Overtime } from './pages/Overtime'
import { Attendance } from './pages/Attendance'
import { lazy, Suspense, useState } from 'react'
import { hasSavedSalaryProfile } from './lib/profile'
import { SalarySetup } from './components/SalarySetup'
import { DesktopController } from './components/DesktopController'
import { desktop } from './lib/desktop'

const DesktopPet = lazy(() => import('./pages/DesktopPet').then(module => ({ default: module.DesktopPet })))
const loadMotionFeatures = () => import('./ui/motion-features').then(module => module.default)

export default function App() {
  return <LazyMotion features={loadMotionFeatures} strict><AppContent/></LazyMotion>
}

function AppContent(){const [needsSetup, setNeedsSetup] = useState(() => !hasSavedSalaryProfile()); if (needsSetup) return <SalarySetup onComplete={() => setNeedsSetup(false)}/>; return <BrowserRouter>{!TEST_BUILD && !desktop && <AppUpdatePrompt/>}<WidgetSyncController/><TimerPlanController/><DesktopController/><Routes><Route element={<Shell/>}><Route path="/" element={<Dashboard/>}/><Route path="/spaces" element={<WorkspaceManager/>}/><Route path="/convert" element={<Converter/>}/><Route path="/summary" element={<Summary/>}/><Route path="/accidents" element={<Accidents/>}/><Route path="/slacking" element={<Slacking/>}/><Route path="/overtime" element={<Overtime/>}/><Route path="/attendance" element={<Attendance/>}/><Route path="/assets" element={<Assets/>}/><Route path="/roster" element={<Roster/>}/><Route path="/journey" element={<WorkJourney/>}/><Route path="/pet" element={<Suspense fallback={<p>正在打开桌宠工作室…</p>}><DesktopPet/></Suspense>}/><Route path="/settings" element={<Settings/>}/></Route></Routes></BrowserRouter>}
