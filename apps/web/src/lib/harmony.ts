// Build-time detection keeps native-only behavior out of the ordinary website.
export const isHarmonyBuild = import.meta.env.MODE === 'harmony'

interface HarmonyFileResult { cancelled?: boolean; text?: string; error?: string }
declare global {
  interface Window {
    MoneyDanceHarmony?: {
      save(id: string, text: string, filename: string): void
      open(id: string): void
    }
    moneyDanceHarmonyResult?: (id: string, result: HarmonyFileResult) => void
  }
}

let sequence = 0
const pending = new Map<string, { resolve: (result: HarmonyFileResult) => void; reject: (error: Error) => void }>()
export function harmonyFile(method: 'open' | 'save', text = '', filename = ''): Promise<HarmonyFileResult> {
  return new Promise((resolve, reject) => {
    const bridge = window.MoneyDanceHarmony
    if (!bridge) { reject(new Error('鸿蒙文件服务尚未就绪，请重新打开应用。')); return }
    window.moneyDanceHarmonyResult = (id, result) => {
      const request = pending.get(id)
      if (!request) return
      pending.delete(id)
      if (result.error) request.reject(new Error(result.error))
      else request.resolve(result)
    }
    const id = String(++sequence)
    pending.set(id, { resolve, reject })
    try {
      if (method === 'save') bridge.save(id, text, filename)
      else bridge.open(id)
    } catch {
      pending.delete(id)
      reject(new Error('文件操作未完成，请重新选择文件。'))
    }
  })
}
