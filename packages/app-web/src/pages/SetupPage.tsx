import React, { useState } from 'react'
import { color, space, fontSize, fontWeight, radius } from '@federation/ui'
import { Button, Input } from '@federation/ui'

export interface SetupPageProps {
  onComplete: (displayName: string) => void
}

export function SetupPage({ onComplete }: SetupPageProps) {
  const [name, setName] = useState('')

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
        maxWidth: 400,
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
          padding: space[6],
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: space[4],
        }}>
          <h2 style={{ color: color.textPrimary, fontSize: fontSize.md, fontWeight: fontWeight.semibold, margin: 0 }}>
            Create your identity
          </h2>
          <p style={{ color: color.textSecondary, fontSize: fontSize.sm, margin: 0 }}>
            Your identity is generated locally and never sent to a server. Only your display name is shared with people you invite.
          </p>
          <Input
            label="Display name"
            placeholder="e.g. Alice"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onComplete(name.trim()) }}
            autoFocus
          />
          <Button
            disabled={!name.trim()}
            onClick={() => onComplete(name.trim())}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Get started →
          </Button>
        </div>

        <p style={{ color: color.textMuted, fontSize: fontSize.xs, textAlign: 'center' }}>
          No account. No server. No tracking.
        </p>
      </div>
    </div>
  )
}
