import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppUpdatePrompt } from './components/AppUpdatePrompt'
import { Shell } from './components/Shell'
import { Accidents } from './pages/Accidents'
import { Assets } from './pages/Assets'
import { Converter } from './pages/Converter'
import { Dashboard } from './pages/Dashboard'
import { Settings } from './pages/Settings'
import { Slacking } from './pages/Slacking'
import { Summary } from './pages/Summary'
import { Overtime } from './pages/Overtime'
import { Attendance } from './pages/Attendance'

export default function App(){return <BrowserRouter><AppUpdatePrompt/><Routes><Route element={<Shell/>}><Route path="/" element={<Dashboard/>}/><Route path="/convert" element={<Converter/>}/><Route path="/summary" element={<Summary/>}/><Route path="/accidents" element={<Accidents/>}/><Route path="/slacking" element={<Slacking/>}/><Route path="/overtime" element={<Overtime/>}/><Route path="/attendance" element={<Attendance/>}/><Route path="/assets" element={<Assets/>}/><Route path="/settings" element={<Settings/>}/></Route></Routes></BrowserRouter>}
