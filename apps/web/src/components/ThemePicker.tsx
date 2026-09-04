import { Check } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { currentThemeId, getTheme, selectTheme, subscribeToTheme, THEMES, type ThemeId } from './theme'
import { BottomSheet } from '../ui/BottomSheet'
import './ThemePicker.css'

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
      <span
        className="theme-picker-current-swatch"
        style={{ '--theme-preview-a': activeTheme.colors[0], '--theme-preview-b': activeTheme.colors[1] } as CSSProperties}
      />
      <span><small>正在使用</small><b>{activeTheme.name}</b></span>
      <em>背景、控件与高亮已同步</em>
    </div>
    <div className="theme-picker-grid" role="group" aria-label="整体配色">
      {THEMES.map(theme => {
        const selected = theme.id === themeId
        return <button
          key={theme.id}
          type="button"
          className="theme-picker-option"
          aria-pressed={selected}
          onClick={() => chooseTheme(theme.id)}
          style={{ '--theme-preview-a': theme.colors[0], '--theme-preview-b': theme.colors[1] } as CSSProperties}
        >
          <span className="theme-picker-preview" aria-hidden="true"><i>{selected ? <Check size={15}/> : null}</i></span>
          <span className="theme-picker-option-copy">
            <b>{theme.name}</b>
            <small>{theme.colorNames}</small>
            <em>{theme.colors[0]} · {theme.colors[1]}</em>
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
    description="选择后立即预览，页面背景、按钮、选中态与高亮会一起切换。"
    className="theme-picker-sheet"
  >
    <ThemePaletteGrid/>
  </BottomSheet>
}
