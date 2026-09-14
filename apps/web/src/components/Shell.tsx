import { Grid2X2, Palette, PanelLeftClose, PanelLeftOpen, SlidersHorizontal } from 'lucide-react'
import { LazyMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatedSidebar } from '../ui/AnimatedSidebar'
import { BottomSheet } from '../ui/BottomSheet'
import { ThemePickerSheet } from './ThemePicker'
import { initializeTheme } from './theme'
import { NAVIGATION_ITEMS as items } from '../lib/navigation'
import { loadDockPaths, subscribeDockPaths } from '../lib/mobileDock'
import { Button } from '../ui/BeuiControls'
import { MobileDockSettings } from './MobileDockSettings'
import './Shell.css'
import './Usability.css'
import { TEST_BUILD } from '../lib/setup'

initializeTheme()

const loadMotionFeatures = () => import('../ui/motion-features').then(module => module.default)

const overviewItems = ['/', '/summary', '/convert'].map(path => items.find(([to]) => to === path)!)
const workItems = items.filter(([to]) => ['/slacking', '/overtime', '/attendance'].includes(to))
const settingsItem = items[9]

export function Shell() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dockPaths, setDockPaths] = useState(loadDockPaths)
  const [dockSettingsOpen, setDockSettingsOpen] = useState(false)
  const compactItems = dockPaths.map(path => items.find(([to]) => to === path)!)
  useEffect(() => subscribeDockPaths(setDockPaths), [])
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
          <p>日常</p>
          {overviewItems.map(renderDesktopItem)}
        </div>
        <div className="nav-group">
          <p>工作记录</p>
          {workItems.map(renderDesktopItem)}
        </div>
      </nav>

      <div className="sidebar-footer">
        <button type="button" className="nav-item" onClick={() => setMobileOpen(true)} title="全部功能"><Grid2X2 size={18}/><span>全部功能</span></button>
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

    <main className="main">{TEST_BUILD && <div className="test-build-banner"><span className="test-build-label">易用性测试版 · 数据与正式版独立</span></div>}<div className="route-stage" key={location.pathname}><Outlet /></div></main>

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
      description="按你想做的事情，找到对应功能。"
      className="mobile-more-sheet"
    >
      {([
        ['工作与时间', ['/', '/slacking', '/overtime', '/attendance', '/journey']],
        ['收支与心愿', ['/summary', '/accidents', '/convert', '/assets']],
        ['偏好设置', ['/settings']],
      ] as [string, string[]][]).map(([label, paths]) => <section className="feature-directory" key={label}><h3>{label}</h3><nav className="mobile-drawer-grid" aria-label={label}>{paths.map(path => renderMobileItem(items.find(([to]) => to === path)!, true))}</nav></section>)}
      <nav className="mobile-drawer-grid" aria-label="外观与导航">
        <button type="button" className="mobile-drawer-item mobile-theme-switcher" onClick={() => { setMobileOpen(false); setThemePickerOpen(true) }}>
          <Palette size={20}/>
          <span>一键换肤</span>
        </button>
      </nav>
      <Button variant="secondary" className="mobile-dock-customize" onClick={() => { setMobileOpen(false); setDockSettingsOpen(true) }}><SlidersHorizontal size={17}/>自定义底部栏</Button>
    </BottomSheet>
    <MobileDockSettings open={dockSettingsOpen} onOpenChange={setDockSettingsOpen}/>
    <ThemePickerSheet open={themePickerOpen} onOpenChange={setThemePickerOpen}/>
    </div>
  </LazyMotion>
}
