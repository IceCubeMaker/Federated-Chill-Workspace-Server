import React from 'react'
import { color, radius, transition } from '../tokens/index.js'

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: 'sm' | 'md'
  active?: boolean
}

export function IconButton({ label, size = 'md', active = false, children, style, ...rest }: IconButtonProps) {
  const dim = size === 'sm' ? 32 : 44
  return (
    <button
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: dim,
        height: dim,
        minWidth: dim,
        minHeight: dim,
        borderRadius: radius.md,
        background: active ? color.surface3 : 'transparent',
        border: 'none',
        color: active ? color.textPrimary : color.textSecondary,
        cursor: 'pointer',
        transition: transition.fast,
        outline: 'none',
        flexShrink: 0,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
