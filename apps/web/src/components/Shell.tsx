import {
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  CalendarCheck2,
  CircleDollarSign,
  Coins,
  Fish,
  Grid2X2,
  Heart,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
} from 'lucide-react'
import { LazyMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatedSidebar } from '../ui/AnimatedSidebar'
import { BottomSheet } from '../ui/BottomSheet'
import { ThemePickerSheet } from './ThemePicker'
import { initializeTheme } from './theme'
import './Shell.css'

initializeTheme()

const loadMotionFeatures = () => import('../ui/motion-features').then(module => module.default)

const items = [
  ['/', Coins, '今日', true],
  ['/convert', Heart, '心愿清单', false],
  ['/summary', BarChart3, '账本', false],
  ['/accidents', CircleDollarSign, '意外收支', false],
  ['/slacking', Fish, '摸鱼', true],
  ['/overtime', BriefcaseBusiness, '加班', true],
  ['/attendance', CalendarCheck2, '薪苦日历', false],
  ['/assets', Boxes, '物品', false],
  ['/settings', Settings2, '我的', true],
] as const

const overviewItems = items.slice(0, 4)
const workItems = items.slice(4, 8)
const settingsItem = items[8]
const compactItems = items.filter(([, , , compact]) => compact)
const drawerItems = items.filter(([, , , compact]) => !compact)

export function Shell() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [themePickerOpen, setThemePickerOpen] = useState(false)

  useEffect(() => setMobileOpen(false), [location.pathname])

  const renderDesktopItem = ([to, Icon, label]: (typeof items)[number]) => <NavLink
    key={to}
    to={to}
    end={to === '/'}
    title={sidebarCollapsed ? label : undefined}
    className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
  >
    <Icon size={18} />
    <span>{label}</span>
  </NavLink>

  const renderMobileItem = ([to, Icon, label]: (typeof items)[number], sheet = false) => <NavLink
    key={`${sheet ? 'sheet' : 'dock'}-${to}`}
    to={to}
    end={to === '/'}
    onClick={() => setMobileOpen(false)}
    className={({ isActive }) => `${sheet ? 'mobile-drawer-item' : 'mobile-dock-item'}${isActive ? ' active' : ''}`}
  >
    <Icon size={sheet ? 20 : 19} />
    <span>{label}</span>
  </NavLink>

  return <LazyMotion features={loadMotionFeatures} strict>
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
    <AnimatedSidebar
      collapsed={sidebarCollapsed}
      expandedWidth={232}
      collapsedWidth={76}
      className="sidebar"
      aria-label="MoneyDance 主导航"
    >
      <div className="sidebar-top">
        <div className="brand">
          <span className="brand-mark"><img src="/money-dance-icon.svg" alt="" /></span>
          <div className="brand-copy"><b>MoneyDance</b><small>TIME IS MONEY</small></div>
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          aria-expanded={!sidebarCollapsed}
          onClick={() => setSidebarCollapsed(value => !value)}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      <nav className="sidebar-navigation">
        <div className="nav-group">
          <p>总览</p>
          {overviewItems.map(renderDesktopItem)}
        </div>
        <div className="nav-group">
          <p>工作记录</p>
          {workItems.map(renderDesktopItem)}
        </div>
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="nav-item theme-switcher-button"
          title={sidebarCollapsed ? '一键换肤' : undefined}
          onClick={() => setThemePickerOpen(true)}
        >
          <Palette size={18}/>
          <span>一键换肤</span>
        </button>
        {renderDesktopItem(settingsItem)}
        <p className="privacy-note">Local-first · 薪资默认只保存在你的浏览器</p>
      </div>
    </AnimatedSidebar>

    <main className="main"><div className="route-stage" key={location.pathname}><Outlet /></div></main>

    <div className="mobile-nav-layer">
      <nav className="mobile-dock" aria-label="移动端主导航">
        {compactItems.slice(0, 2).map(item => renderMobileItem(item))}
        <button
          className="mobile-dock-more"
          type="button"
          aria-label="打开全部功能"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <span><Grid2X2 size={18} /></span>
          <small>全部</small>
        </button>
        {compactItems.slice(2).map(item => renderMobileItem(item))}
      </nav>
    </div>

    <BottomSheet
      open={mobileOpen}
      onOpenChange={setMobileOpen}
      title="全部功能"
      description="低频功能集中在这里，日常入口继续保留在底部。"
      className="mobile-more-sheet"
    >
      <nav className="mobile-drawer-grid" aria-label="全部功能">
        {drawerItems.map(item => renderMobileItem(item, true))}
        <button type="button" className="mobile-drawer-item mobile-theme-switcher" onClick={() => { setMobileOpen(false); setThemePickerOpen(true) }}>
          <Palette size={20}/>
          <span>一键换肤</span>
        </button>
      </nav>
    </BottomSheet>
    <ThemePickerSheet open={themePickerOpen} onOpenChange={setThemePickerOpen}/>
    </div>
  </LazyMotion>
}
