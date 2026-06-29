import React from 'react'
import { color, space, fontSize } from '@federation/ui'

export function LoadingPage({ message = 'Starting up…' }: { message?: string }) {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[4],
      background: color.surface0,
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      <div style={{
        width: 40,
        height: 40,
        border: `3px solid ${color.surface3}`,
        borderTopColor: color.brandPrimary,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ color: color.textSecondary, fontSize: fontSize.sm }}>{message}</p>
    </div>
  )
}
