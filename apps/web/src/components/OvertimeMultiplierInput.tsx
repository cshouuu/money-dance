import type { ReactNode } from 'react'
import { normalizeDecimalInput, preventInvalidNumberKey } from '../lib/form'
import { Input } from '../ui/BeuiControls'
import './OvertimeMultiplierInput.css'

interface OvertimeMultiplierInputProps {
  value: string
  onValueChange: (value: string) => void
  hint: ReactNode
}

export function OvertimeMultiplierInput({ value, onValueChange, hint }: OvertimeMultiplierInputProps) {
  return <fieldset className="overtime-multiplier-field">
    <legend className="sr-only">输入工资倍率</legend>
    <Input label="工资倍率" required aria-label="工资倍率" type="number" inputMode="decimal" min="0.01" step="0.01" value={value} rightIcon="倍" onKeyDown={preventInvalidNumberKey} onValueChange={next => onValueChange(normalizeDecimalInput(next))} placeholder="例如：1.5" hint={hint}/>
  </fieldset>
}
