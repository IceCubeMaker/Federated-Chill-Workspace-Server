import React from 'react'
import { color, radius, fontSize, space } from '../tokens/index.js'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
}

export interface SelectProps<T extends string = string> {
  options: SelectOption<T>[]
  value: T
  onChange: (val: T) => void
  label?: string
  disabled?: boolean
}

export function Select<T extends string>({ options, value, onChange, label, disabled }: SelectProps<T>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
      {label && (
        <label style={{ fontSize: fontSize.xs, color: color.textSecondary, fontWeight: 500 }}>
          {label}
        </label>
      )}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        style={{
          background: color.surface2,
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
          color: color.textPrimary,
          fontSize: fontSize.sm,
          padding: `${space[2]} ${space[3]}`,
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239898b0' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: `right ${space[3]} center`,
          paddingRight: space[8],
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
