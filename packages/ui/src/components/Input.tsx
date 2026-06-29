import React from 'react'
import { color, radius, fontSize, space, transition } from '../tokens/index.js'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: React.ReactNode
}

export function Input({ label, error, hint, icon, style, id, ...rest }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{ fontSize: fontSize.xs, color: color.textSecondary, fontWeight: 500 }}
        >
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        {icon && (
          <span
            style={{
              position: 'absolute',
              left: space[3],
              top: '50%',
              transform: 'translateY(-50%)',
              color: color.textMuted,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {icon}
          </span>
        )}
        <input
          id={inputId}
          style={{
            width: '100%',
            minHeight: 44,
            background: color.surface2,
            border: `1px solid ${error ? color.error : color.border}`,
            borderRadius: radius.md,
            color: color.textPrimary,
            fontSize: fontSize.md,
            padding: icon ? `${space[2]} ${space[3]} ${space[2]} ${space[8]}` : `${space[2]} ${space[3]}`,
            outline: 'none',
            transition: transition.fast,
            boxSizing: 'border-box',
            ...style,
          }}
          {...rest}
        />
      </div>
      {error && <span style={{ fontSize: fontSize.xs, color: color.error }}>{error}</span>}
      {!error && hint && <span style={{ fontSize: fontSize.xs, color: color.textMuted }}>{hint}</span>}
    </div>
  )
}
