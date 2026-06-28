import React, { useState, useRef } from 'react'
import { color, space, fontSize, fontWeight, radius } from '@federation/ui'
import { Button, Input } from '@federation/ui'

export interface SetupPageProps {
  onComplete: (displayName: string, password: string) => Promise<void>
  onImport: (blob: string) => Promise<void>
  error?: string
}

type Tab = 'create' | 'import'

export function SetupPage({ onComplete, onImport, error }: SetupPageProps) {
  const [tab, setTab] = useState<Tab>('create')

  // Create tab state
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  // Import tab state
  const [importBlob, setImportBlob] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword
  const canCreate = name.trim().length > 0 && password.length >= 8 && !passwordMismatch

  const handleCreate = async () => {
    if (!canCreate) return
    setSubmitting(true)
    setLocalError(null)
    try {
      await onComplete(name.trim(), password)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleImport = async () => {
    if (!importBlob.trim()) return
    setImporting(true)
    setLocalError(null)
    try {
      await onImport(importBlob.trim())
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setImportBlob((ev.target?.result as string) ?? '')
    reader.readAsText(file)
  }

  const displayError = localError ?? error

  const tabStyle = (active: boolean) => ({
    flex: 1,
    padding: `${space[2]} ${space[3]}`,
    border: 'none',
    borderBottom: `2px solid ${active ? color.brandPrimary : 'transparent'}`,
    background: 'none',
    color: active ? color.brandPrimary : color.textMuted,
    cursor: 'pointer',
    fontSize: fontSize.sm,
    fontWeight: active ? fontWeight.semibold : fontWeight.normal,
    transition: 'color 0.15s, border-color 0.15s',
  } as React.CSSProperties)

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: `radial-gradient(ellipse at 50% 0%, #1e1e3a 0%, ${color.surface0} 70%)`,
      padding: space[4],
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: space[6],
      }}>
        {/* Logo mark */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: radius.xl,
          background: `linear-gradient(135deg, ${color.brandPrimary}, ${color.brandSecondary})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 36,
          boxShadow: `0 0 40px ${color.brandPrimary}44`,
        }}>
          ⬡
        </div>

        <div style={{ textAlign: 'center' }}>
          <h1 style={{ color: color.textPrimary, fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, margin: 0 }}>
            Federated Workspace
          </h1>
          <p style={{ color: color.textSecondary, fontSize: fontSize.sm, marginTop: space[2] }}>
            Private, encrypted, peer-to-peer collaboration
          </p>
        </div>

        <div style={{
          background: color.surface1,
          border: `1px solid ${color.border}`,
          borderRadius: radius.lg,
          width: '100%',
          overflow: 'hidden',
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${color.border}` }}>
            <button style={tabStyle(tab === 'create')} onClick={() => { setTab('create'); setLocalError(null) }}>
              New identity
            </button>
            <button style={tabStyle(tab === 'import')} onClick={() => { setTab('import'); setLocalError(null) }}>
              Import identity
            </button>
          </div>

          <div style={{ padding: space[6], display: 'flex', flexDirection: 'column', gap: space[4] }}>
            {tab === 'create' ? (
              <>
                <p style={{ color: color.textSecondary, fontSize: fontSize.sm, margin: 0 }}>
                  Your keys are generated locally and never leave your device without encryption. Your password protects your private key and lets you log in from other devices.
                </p>
                <Input
                  label="Display name"
                  placeholder="e.g. Alice"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
                <Input
                  label="Password (min 8 chars)"
                  placeholder="Choose a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                />
                <Input
                  label="Confirm password"
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
                />
                {passwordMismatch && (
                  <p style={{ margin: 0, fontSize: fontSize.sm, color: color.error }}>Passwords do not match</p>
                )}
                {displayError && (
                  <p style={{ margin: 0, fontSize: fontSize.sm, color: color.error }}>{displayError}</p>
                )}
                <Button
                  disabled={!canCreate}
                  loading={submitting}
                  onClick={() => void handleCreate()}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Create identity →
                </Button>
              </>
            ) : (
              <>
                <p style={{ color: color.textSecondary, fontSize: fontSize.sm, margin: 0 }}>
                  Paste your exported identity blob or load it from a file. Your data will sync from the P2P network once connected.
                </p>
                <textarea
                  value={importBlob}
                  onChange={(e) => setImportBlob(e.target.value)}
                  placeholder='Paste identity JSON here…'
                  rows={5}
                  style={{
                    width: '100%',
                    background: color.surface2,
                    border: `1px solid ${color.border}`,
                    borderRadius: radius.md,
                    color: color.textPrimary,
                    fontSize: fontSize.xs,
                    fontFamily: 'monospace',
                    padding: space[3],
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <Button
                  variant="ghost"
                  onClick={() => fileRef.current?.click()}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Load from file
                </Button>
                <input ref={fileRef} type="file" accept=".json,application/json,text/plain" style={{ display: 'none' }} onChange={handleFile} />
                {displayError && (
                  <p style={{ margin: 0, fontSize: fontSize.sm, color: color.error }}>{displayError}</p>
                )}
                <Button
                  disabled={!importBlob.trim()}
                  loading={importing}
                  onClick={() => void handleImport()}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Import identity →
                </Button>
              </>
            )}
          </div>
        </div>

        <p style={{ color: color.textMuted, fontSize: fontSize.xs, textAlign: 'center' }}>
          No account. No server. No tracking.
        </p>
      </div>
    </div>
  )
}
