/** Design tokens for the Federation workspace UI. */

export const color = {
  // Brand
  brandPrimary:   'var(--fed-brand-primary,   #6366f1)',
  brandSecondary: 'var(--fed-brand-secondary, #8b5cf6)',

  // Surface
  surface0: 'var(--fed-surface-0, #0f0f13)',
  surface1: 'var(--fed-surface-1, #18181f)',
  surface2: 'var(--fed-surface-2, #23232e)',
  surface3: 'var(--fed-surface-3, #2e2e3d)',

  // Text
  textPrimary:   'var(--fed-text-primary,   #f0f0f5)',
  textSecondary: 'var(--fed-text-secondary, #9898b0)',
  textMuted:     'var(--fed-text-muted,     #55556a)',

  // Semantic
  success: 'var(--fed-success, #22c55e)',
  warning: 'var(--fed-warning, #f59e0b)',
  error:   'var(--fed-error,   #ef4444)',
  info:    'var(--fed-info,    #3b82f6)',

  // Border
  border: 'var(--fed-border, #2e2e3d)',
} as const

export const space = {
  px:  '1px',
  0.5: '2px',
  1:   '4px',
  2:   '8px',
  3:   '12px',
  4:   '16px',
  5:   '20px',
  6:   '24px',
  8:   '32px',
  10:  '40px',
  12:  '48px',
} as const

export const radius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const

export const fontSize = {
  xs:   '11px',
  sm:   '13px',
  base: '14px',
  md:   '16px',
  lg:   '18px',
  xl:   '20px',
  '2xl':'24px',
} as const

export const fontWeight = {
  normal:   400,
  medium:   500,
  semibold: 600,
  bold:     700,
} as const

export const transition = {
  fast:   'all 100ms ease',
  base:   'all 150ms ease',
  slow:   'all 250ms ease',
} as const

/** Inject CSS custom properties onto :root */
export function injectTokens(): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--fed-brand-primary',   '#6366f1')
  root.style.setProperty('--fed-brand-secondary', '#8b5cf6')
  root.style.setProperty('--fed-surface-0', '#0f0f13')
  root.style.setProperty('--fed-surface-1', '#18181f')
  root.style.setProperty('--fed-surface-2', '#23232e')
  root.style.setProperty('--fed-surface-3', '#2e2e3d')
  root.style.setProperty('--fed-text-primary',   '#f0f0f5')
  root.style.setProperty('--fed-text-secondary', '#9898b0')
  root.style.setProperty('--fed-text-muted',     '#55556a')
  root.style.setProperty('--fed-success', '#22c55e')
  root.style.setProperty('--fed-warning', '#f59e0b')
  root.style.setProperty('--fed-error',   '#ef4444')
  root.style.setProperty('--fed-info',    '#3b82f6')
  root.style.setProperty('--fed-border',  '#2e2e3d')
}
