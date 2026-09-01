import type { ReactNode } from 'react'
import { normalizeDecimalInput, preventInvalidNumberKey } from '../lib/form'
import './OvertimeMultiplierInput.css'

interface OvertimeMultiplierInputProps {
  value: string
  onValueChange: (value: string) => void
  hint: ReactNode
}

export function OvertimeMultiplierInput({ value, onValueChange, hint }: OvertimeMultiplierInputProps) {
  return <fieldset className="overtime-multiplier-field">
    <legend>输入工资倍率</legend>
    <label className="overtime-multiplier-input"><input required aria-label="工资倍率" type="number" inputMode="decimal" min="0.01" step="0.01" value={value} onKeyDown={preventInvalidNumberKey} onChange={event => onValueChange(normalizeDecimalInput(event.target.value))} placeholder="例如：1.5"/><i>倍</i></label>
    <small className="overtime-multiplier-help">{hint}</small>
  </fieldset>
}
