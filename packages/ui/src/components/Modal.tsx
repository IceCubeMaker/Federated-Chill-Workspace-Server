import React, { useEffect } from 'react'
import { color, radius, space, fontSize, fontWeight } from '../tokens/index.js'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: number
}

export function Modal({ open, onClose, title, children, width = 480 }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: color.surface1,
          border: `1px solid ${color.border}`,
          borderRadius: radius.lg,
          width: '100%',
          maxWidth: width,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        {title && (
          <div
            style={{
              padding: `${space[4]} ${space[6]}`,
              borderBottom: `1px solid ${color.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: color.textPrimary }}>
              {title}
            </span>
            <button
              onClick={onClose}
              style={{
                background: 'transparent', border: 'none', color: color.textMuted,
                cursor: 'pointer', fontSize: fontSize.lg, lineHeight: 1, padding: space[1],
              }}
            >
              ×
            </button>
          </div>
        )}
        <div style={{ padding: space[6] }}>{children}</div>
      </div>
    </div>
  )
}
