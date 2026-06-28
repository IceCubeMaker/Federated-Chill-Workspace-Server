import React from 'react'
import { color, radius, space } from '../tokens/index.js'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: space[2],
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        onClick={() => !disabled && onChange(!checked)}
        style={{
          width: 36,
          height: 20,
          borderRadius: radius.full,
          background: checked ? color.brandPrimary : color.surface3,
          border: `1px solid ${color.border}`,
          position: 'relative',
          transition: 'background 150ms ease',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 150ms ease',
          }}
        />
      </div>
      {label && (
        <span style={{ fontSize: '13px', color: color.textPrimary }}>{label}</span>
      )}
    </label>
  )
}
