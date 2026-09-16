export type PetMood = 'working' | 'slacking' | 'overtime' | 'rest'
export type PetPresetId = 'xiaoxin' | 'mili' | 'huanhuan'
export interface PetLayoutMetrics { bodyWidth: number; bodyHeight: number; panelWidth: number; panelHeight: number }
export interface PetWindowLayout {
  bounds: { x: number; y: number; width: number; height: number }
  anchor: { x: number; y: number }
  body: { x: number; y: number; width: number; height: number }
  panel: { x: number; y: number; width: number; height: number } | null
  placement: string
}
export type PackState = 'idle' | PetMood | 'love' | 'celebrate'
export interface PackClip {
  src: string; width: number; height: number; frameWidth: number; frameHeight: number
  columns: number; durations: number[]; stillFrame: number
}
export interface PetPack {
  id: string; name: string; author: string; warnings: string[]
  clips: Record<string, PackClip>; bindings: Record<PackState, string>
}
export interface PetSettings {
  presetId?: PetPresetId
  enabled: boolean; name: string; size: number; reducedMotion: boolean
  reportMinutes: number; breakMinutes: number; warmth: boolean; milestones: boolean
  quietEnabled: boolean; quietStart: string; quietEnd: string
  hideAmounts: boolean; speech: boolean; notifications: boolean; launchAtLogin: boolean
}
export interface PetSnapshot {
  updatedAt: number; businessDate: string; state: PetMood; workAmount: number
  overtimeAmount: number; overtimeSeconds: number; overtimeId: string
  wish: { id: string; name: string; progress: number } | null
}
export interface DesktopState {
  settings: PetSettings; image: string | null; pack: PetPack | null; snapshot: PetSnapshot | null
  message: { id: string; text: string; kind: string; automatic: boolean; at: number } | null
  focusEndsAt: number; snoozedUntil: number
}
export type PetAction = 'report' | 'pet' | 'focus' | 'cancel-focus' | 'snooze' | 'unsnooze' | 'hide'
export interface DesktopBridge {
  platform: string
  getState(): Promise<DesktopState>
  saveSettings(settings: PetSettings): Promise<DesktopState>
  createPet(mode: 'extract' | 'transparent'): Promise<string | null>
  usePet(): Promise<DesktopState>
  resetPet(presetId?: PetPresetId): Promise<DesktopState>
  cancelExtraction(): Promise<void>
  importPack(): Promise<PetPack | null>
  usePack(id: string, bindings: PetPack['bindings']): Promise<DesktopState>
  savePackBindings(id: string, bindings: PetPack['bindings']): Promise<DesktopState>
  savePackTemplate(): Promise<boolean>
  publish(snapshot: PetSnapshot): void
  action(action: PetAction): Promise<DesktopState>
  openPage(route: string): Promise<void>
  setInteractive(value: boolean): void
  drag(phase: 'start' | 'move' | 'end'): void
  layout(metrics: PetLayoutMetrics): Promise<PetWindowLayout>
  onLayout(callback: (layout: PetWindowLayout) => void): () => void
  onState(callback: (state: Partial<DesktopState>) => void): () => void
  onNavigate(callback: (route: string) => void): () => void
  onProgress(callback: (progress: string) => void): () => void
}
declare global { interface Window { moneyDanceDesktop?: DesktopBridge } }
export const desktop = typeof window === 'undefined' ? undefined : window.moneyDanceDesktop
