import React, { useState } from 'react'
import { color, space, fontSize, fontWeight, radius } from '@federation/ui'
import { Button, Input } from '@federation/ui'

export interface SetupPageProps {
  onComplete: (displayName: string, password: string) => Promise<void>
  onSignIn: (connectionCode: string, password: string) => Promise<void>
  error?: string
}

type Tab = 'create' | 'signin'

export function SetupPage({ onComplete, onSignIn, error }: SetupPageProps) {
  const [tab, setTab] = useState<Tab>('create')

  // Create account state
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Sign in state
  const [connectionCode, setConnectionCode] = useState('')
  const [signInPassword, setSignInPassword] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword
  const canCreate = name.trim().length > 0 && password.length >= 8 && !passwordMismatch
  const canSignIn = connectionCode.trim().length > 0 && signInPassword.length >= 1

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

  const handleSignIn = async () => {
    if (!canSignIn) return
    setSubmitting(true)
    setLocalError(null)
    try {
      await onSignIn(connectionCode.trim(), signInPassword)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const displayError = localError ?? error

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: `${space[2]} ${space[3]}`,
    background: active ? color.surface0 : 'transparent',
    border: 'none',
    borderRadius: radius.md,
    color: active ? color.textPrimary : color.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: active ? fontWeight.semibold : fontWeight.normal,
    cursor: 'pointer',
    transition: 'all 0.15s',
  })

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
          padding: space[6],
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: space[4],
        }}>
          {/* Tab switcher */}
          <div style={{
            display: 'flex',
            background: color.surface2,
            borderRadius: radius.md,
            padding: 3,
            gap: 2,
          }}>
            <button style={tabStyle(tab === 'create')} onClick={() => { setTab('create'); setLocalError(null) }}>
              Create account
            </button>
            <button style={tabStyle(tab === 'signin')} onClick={() => { setTab('signin'); setLocalError(null) }}>
              Sign in
            </button>
          </div>

          {tab === 'create' && (
            <>
              <div>
                <h2 style={{ color: color.textPrimary, fontSize: fontSize.md, fontWeight: fontWeight.semibold, margin: 0 }}>
                  Create your identity
                </h2>
                <p style={{ color: color.textSecondary, fontSize: fontSize.sm, marginTop: space[1], marginBottom: 0 }}>
                  Your keys are generated locally. Your password encrypts your private key so you can sign in from another device.
                </p>
              </div>
              <Input
                label="Display name"
                placeholder="e.g. Alice"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <Input
                label="Password (min 8 characters)"
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
                Get started →
              </Button>
            </>
          )}

          {tab === 'signin' && (
            <>
              <div>
                <h2 style={{ color: color.textPrimary, fontSize: fontSize.md, fontWeight: fontWeight.semibold, margin: 0 }}>
                  Sign in on this device
                </h2>
                <p style={{ color: color.textSecondary, fontSize: fontSize.sm, marginTop: space[1], marginBottom: 0 }}>
                  Enter your connection code (shown in the sidebar on your other device) and your password.
                  Make sure your other device is online.
                </p>
              </div>
              <Input
                label="Connection code"
                placeholder="Paste your connection code"
                value={connectionCode}
                onChange={(e) => setConnectionCode(e.target.value)}
                autoFocus
              />
              <Input
                label="Password"
                placeholder="Your account password"
                value={signInPassword}
                onChange={(e) => setSignInPassword(e.target.value)}
                type="password"
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSignIn() }}
              />
              {displayError && (
                <p style={{ margin: 0, fontSize: fontSize.sm, color: color.error }}>{displayError}</p>
              )}
              <Button
                disabled={!canSignIn}
                loading={submitting}
                onClick={() => void handleSignIn()}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Sign in →
              </Button>
            </>
          )}
        </div>

        <p style={{ color: color.textMuted, fontSize: fontSize.xs, textAlign: 'center' }}>
          No account. No server. No tracking.
        </p>
      </div>
    </div>
  )
}
