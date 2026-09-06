import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { currentThemeId, getTheme, selectTheme, subscribeToTheme, THEMES, type ThemeId } from './theme'
import { BottomSheet } from '../ui/BottomSheet'
import './ThemePicker.css'

/** Uses the page tokens directly, so the preview always matches its theme. */
function ThemePreview({ themeId }: { themeId: ThemeId }) {
  return <span className="theme-picker-preview" data-theme={themeId} aria-hidden="true">
    <span className="theme-preview-heading"><i/><i/></span>
    <span className="theme-preview-hero">
      <span>今日已赚</span><strong>¥268.80</strong>
      <span className="theme-preview-progress"><i/></span>
    </span>
    <span className="theme-preview-details"><span/><span/><span className="theme-preview-action"/></span>
  </span>
}

export function ThemePaletteGrid({ className = '' }: { className?: string }) {
  const [themeId, setThemeId] = useState<ThemeId>(() => currentThemeId())
  const [saveError, setSaveError] = useState(false)

  useEffect(() => subscribeToTheme(setThemeId), [])

  const chooseTheme = (nextThemeId: ThemeId) => {
    const persisted = selectTheme(nextThemeId)
    setThemeId(nextThemeId)
    setSaveError(!persisted)
  }

  const activeTheme = getTheme(themeId)

  return <div className={`theme-picker ${className}`.trim()}>
    <div className="theme-picker-current" aria-live="polite">
      <span className="theme-picker-current-swatch" aria-hidden="true"><Check size={20}/></span>
      <span><small>正在使用</small><b>{activeTheme.name}</b></span>
      <em>已应用</em>
    </div>
    <div className="theme-picker-grid" role="group" aria-label="整体配色">
      {THEMES.map(theme => {
        const selected = theme.id === themeId
        return <button
          key={theme.id}
          type="button"
          className="theme-picker-option"
          aria-pressed={selected}
          aria-label={theme.name}
          onClick={() => chooseTheme(theme.id)}
        >
          <ThemePreview themeId={theme.id}/>
          <span className="theme-picker-option-copy">
            <b>{theme.name}<i aria-hidden="true">{selected ? <Check size={15}/> : null}</i></b>
            <small>{theme.colorNames}</small>
          </span>
        </button>
      })}
    </div>
    {saveError && <p className="theme-picker-error" role="alert">配色已在本次使用中生效，但浏览器暂时无法保存这个选择。</p>}
  </div>
}

export function ThemePickerSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <BottomSheet
    open={open}
    onOpenChange={onOpenChange}
    title="一键换肤"
    description="选择喜欢的页面配色，立即生效并自动保存。"
    className="theme-picker-sheet"
  >
    <ThemePaletteGrid/>
  </BottomSheet>
}
