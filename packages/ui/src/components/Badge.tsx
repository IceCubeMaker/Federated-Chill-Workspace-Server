import React from 'react'
import { color, radius, fontSize, space } from '../tokens/index.js'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'brand'

const variantColor: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: color.surface3,    text: color.textSecondary },
  success: { bg: '#14532d',          text: color.success },
  warning: { bg: '#451a03',          text: color.warning },
  error:   { bg: '#450a0a',          text: color.error },
  info:    { bg: '#1e3a5f',          text: color.info },
  brand:   { bg: '#312e81',          text: color.brandPrimary },
}

export interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
}

export function Badge({ variant = 'default', children }: BadgeProps) {
  const { bg, text } = variantColor[variant]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: `${space[0.5]} ${space[2]}`,
        borderRadius: radius.full,
        fontSize: fontSize.xs,
        fontWeight: 500,
        background: bg,
        color: text,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}
