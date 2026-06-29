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

const SLIDE_UP = `@keyframes fed-modal-slide-up {
  from { transform: translateY(100%); opacity: 0.9; }
  to   { transform: translateY(0);    opacity: 1; }
}`

const FADE_IN = `@keyframes fed-modal-fade-in {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
}`

export function Modal({ open, onClose, title, children, width = 480 }: ModalProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  const modal = isMobile ? (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <style>{SLIDE_UP}</style>
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: color.surface1,
          borderTop: `1px solid ${color.border}`,
          borderRadius: `${radius.xl} ${radius.xl} 0 0`,
          width: '100%',
          maxHeight: '90dvh',
          overflow: 'auto',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
          animation: 'fed-modal-slide-up 0.22s cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {title && (
          <div style={{
            padding: `${space[4]} ${space[5]}`,
            borderBottom: `1px solid ${color.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            background: color.surface1,
            zIndex: 1,
          }}>
            <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: color.textPrimary }}>
              {title}
            </span>
            <button
              onClick={onClose}
              style={{
                background: color.surface2,
                border: 'none',
                color: color.textSecondary,
                cursor: 'pointer',
                fontSize: fontSize.base,
                lineHeight: 1,
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
  ) : (
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
      <style>{FADE_IN}</style>
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
          animation: 'fed-modal-fade-in 0.15s ease',
        }}
      >
        {title && (
          <div style={{
            padding: `${space[4]} ${space[5]}`,
            borderBottom: `1px solid ${color.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
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
