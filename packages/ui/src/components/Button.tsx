import React from 'react'
import { color, radius, fontSize, fontWeight, transition, space } from '../tokens/index.js'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: color.brandPrimary,
    color: color.textPrimary,
    border: '1px solid transparent',
  },
  secondary: {
    background: color.surface3,
    color: color.textPrimary,
    border: `1px solid ${color.border}`,
  },
  ghost: {
    background: 'transparent',
    color: color.textSecondary,
    border: '1px solid transparent',
  },
  danger: {
    background: color.error,
    color: '#fff',
    border: '1px solid transparent',
  },
}

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: `${space[1]} ${space[2]}`, fontSize: fontSize.xs },
  md: { padding: `${space[2]} ${space[4]}`, fontSize: fontSize.sm },
  lg: { padding: `${space[3]} ${space[6]}`, fontSize: fontSize.base },
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: space[2],
        borderRadius: radius.md,
        fontWeight: fontWeight.medium,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.5 : 1,
        transition: transition.fast,
        outline: 'none',
        whiteSpace: 'nowrap',
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon}
      {children}
    </button>
  )
}

function Spinner({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      style={{ animation: 'fed-spin 0.7s linear infinite' }}
    >
      <circle cx={12} cy={12} r={10} strokeOpacity={0.25} />
      <path d="M12 2a10 10 0 0 1 10 10" />
      <style>{`@keyframes fed-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  )
}
