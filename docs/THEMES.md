# Theme presentation

The 12 theme IDs and the saved preference key remain stable. `apps/web/src/themes.css`
defines the palette roles used by both the application and its miniature previews.

- Canvas, paper and control surfaces establish neutral page layers.
- Accent/action colors are independent of the hero background and its text colors.
- Classic, cobalt-ivory and cyan-tide use dark hero surfaces; the other themes use
  light hero surfaces with dark text.
- Secondary colors are reserved for small badges and highlights.
- Income, expense, error and warning colors retain semantic meaning across themes.
- Shared beUI presentation is in `theme-surfaces.css`; calendar geometry and salary
  calculation/storage behavior are unchanged.

`themeContrast.test.ts` checks all palettes for normal-text contrast of at least
4.5:1 and control-border / hero-progress contrast of at least 3:1. These palette
tests complement visual checks; they do not certify every rendered state.

Android's optional `Appearance` bridge saves the selected canvas in native
preferences and reapplies it on launch and resume to the window, WebView and
navigation area. Old shells without the plugin still support web theme switching.
The initial platform splash continues to use the existing branding assets.

## Preview validation — 2026-09-06

- Typecheck, full regression suite (487 tests), web/PWA build passed locally.
- Desktop homepage, 390px mobile homepage and beUI dropdown checked visually.
- 320px theme grid: all 12 themes switched successfully, exactly one selected
  option, preview hero colors matched the settings hero, no page overflow.
- Selected theme survived reload. Time picker and running slacking timer checked
  with a light hero theme; test timer stopped afterwards.
- Native build checks run in the Android workflow. Status/navigation bars still
  need acceptance on an actual Android device; browser checks cannot cover them.

Deploy the `feature/ui-refresh` branch through `deploy-ui-preview.yml`. Dispatch
`build-android-apk.yml` on the same commit for a debug test APK. No release tag is
needed for this acceptance build.
