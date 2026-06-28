import React, { useState } from 'react'
import { color } from '@federation/ui'
import { useWorkspace } from './hooks/useWorkspace.js'
import { SetupPage } from './pages/SetupPage.js'
import { LoadingPage } from './pages/LoadingPage.js'
import { WorkspacePage } from './pages/WorkspacePage.js'

const SETUP_DONE_KEY = 'fed-setup-done'

export function App() {
  const [setupDone, setSetupDone] = useState(() => !!localStorage.getItem(SETUP_DONE_KEY))
  const { state, switchGroup, createGroup, refreshGroups } = useWorkspace()

  // Show setup screen on first launch
  if (!setupDone) {
    return (
      <SetupPage
        onComplete={(displayName) => {
          localStorage.setItem('fed-pending-display-name', displayName)
          localStorage.setItem(SETUP_DONE_KEY, '1')
          setSetupDone(true)
        }}
      />
    )
  }

  if (state.status === 'initializing' || state.status === 'idle') {
    return <LoadingPage message="Starting peer-to-peer node…" />
  }

  if (state.status === 'error') {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        background: color.surface0,
        color: color.error,
        padding: '24px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 40 }}>⚠</div>
        <p style={{ fontSize: '16px', color: color.textPrimary }}>Failed to start</p>
        <p style={{ fontSize: '13px', color: color.textSecondary, maxWidth: 400 }}>{state.error}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: color.brandPrimary,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 20px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <WorkspacePage
      state={state}
      onSwitchGroup={switchGroup}
      onCreateGroup={createGroup}
      onRefreshGroups={refreshGroups}
    />
  )
}
