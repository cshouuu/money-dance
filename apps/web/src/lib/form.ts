export const MAX_MONEY_AMOUNT = 999_999_999

export function toLocalDateValue(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function toLocalMonthValue(date = new Date()): string {
  return toLocalDateValue(date).slice(0, 7)
}

export function toLocalDateTime(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

export function localDateWithTime(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
}

export function toLocalTimeValue(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function normalizeDecimalInput(value: string, decimalPlaces = 2): string {
  if (!value) return ''

  const [rawInteger = '', ...fractionParts] = value.replace(/[^\d.]/g, '').split('.')
  const integer = (rawInteger || '0').replace(/^0+(?=\d)/, '')
  if (fractionParts.length === 0 || decimalPlaces === 0) return integer

  const fraction = fractionParts.join('').slice(0, decimalPlaces)
  return `${integer}.${fraction}`
}

export function parseNumberInput(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function preventInvalidNumberKey(event: { key: string; preventDefault: () => void }): void {
  if (['e', 'E', '+', '-'].includes(event.key)) event.preventDefault()
}

export function formatOwnershipDuration(purchaseDate: string | Date, now = new Date()): string {
  const purchase = purchaseDate instanceof Date ? purchaseDate : new Date(purchaseDate)
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - purchase.getTime()) / 86_400_000))
  if (elapsedDays < 1) return '不到 1 天'
  if (elapsedDays < 30) return `${elapsedDays} 天`

  const months = Math.floor(elapsedDays / 30)
  if (months < 12) return `${months} 个月`

  const years = Math.floor(months / 12)
  const remainingMonths = months % 12
  return remainingMonths > 0 ? `${years} 年 ${remainingMonths} 个月` : `${years} 年`
}
