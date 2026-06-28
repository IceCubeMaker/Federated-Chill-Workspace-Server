import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
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

  const modal = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${space[4]} ${space[3]}`,
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
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {title && (
          <div
            style={{
              padding: `${space[4]} ${space[5]}`,
              borderBottom: `1px solid ${color.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: color.textPrimary }}>
              {title}
            </span>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: color.textMuted,
                cursor: 'pointer',
                fontSize: fontSize.lg,
                lineHeight: 1,
                padding: space[1],
                outline: 'none',
              }}
            >
              ×
            </button>
          </div>
        )}
        <div style={{ padding: space[5] }}>{children}</div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
