import React, { useState } from 'react'
import { color, space, fontSize, fontWeight, radius } from '@federation/ui'
import { Button, Input } from '@federation/ui'

export interface UnlockPageProps {
  displayName?: string
  onUnlock: (password: string) => Promise<void>
  error?: string
}

export function UnlockPage({ displayName, onUnlock, error }: UnlockPageProps) {
  const [password, setPassword] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleUnlock = async () => {
    if (!password) return
    setUnlocking(true)
    setLocalError(null)
    try {
      await onUnlock(password)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setUnlocking(false)
    }
  }

  const displayError = localError ?? error

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
        maxWidth: 380,
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
            Welcome back{displayName ? `, ${displayName}` : ''}
          </h1>
          <p style={{ color: color.textSecondary, fontSize: fontSize.sm, marginTop: space[2] }}>
            Enter your password to unlock your identity
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
          <Input
            label="Password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') void handleUnlock() }}
          />
          {displayError && (
            <p style={{ margin: 0, fontSize: fontSize.sm, color: color.error }}>{displayError}</p>
          )}
          <Button
            disabled={!password}
            loading={unlocking}
            onClick={() => void handleUnlock()}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Unlock
          </Button>
        </div>
      </div>
    </div>
  )
}
