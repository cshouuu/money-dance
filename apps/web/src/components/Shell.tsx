import { Boxes, Clock3, Coins, Fish, Settings2 } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

const items = [
  ['/', Coins, '今日'],
  ['/convert', Clock3, '换算'],
  ['/slacking', Fish, '摸鱼'],
  ['/assets', Boxes, '物品'],
  ['/settings', Settings2, '我的'],
] as const

export function Shell() {
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">¥</span><div><b>SalaryFlow</b><small>薪流</small></div></div>
      <nav>{items.map(([to, Icon, label]) => <NavLink key={to} to={to} end={to === '/'} className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}><Icon size={19}/><span>{label}</span></NavLink>)}</nav>
      <p className="privacy-note">Local-first · 薪资默认只保存在你的浏览器</p>
    </aside>
    <main className="main"><Outlet /></main>
    <nav className="mobile-nav">{items.map(([to, Icon, label]) => <NavLink key={to} to={to} end={to === '/'} className={({isActive}) => isActive ? 'mobile-nav-item active' : 'mobile-nav-item'}><Icon size={19}/><span>{label}</span></NavLink>)}</nav>
  </div>
}
