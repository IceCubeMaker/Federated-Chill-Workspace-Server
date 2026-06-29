import React from 'react'
import { color } from '@federation/ui'
import { useWorkspace } from './hooks/useWorkspace.js'
import { SetupPage } from './pages/SetupPage.js'
import { UnlockPage } from './pages/UnlockPage.js'
import { LoadingPage } from './pages/LoadingPage.js'
import { WorkspacePage } from './pages/WorkspacePage.js'

export function App() {
  const {
    state,
    switchGroup,
    createGroup,
    refreshGroups,
    updateProfile,
    completeSetup,
    unlock,
    connectFromCode,
  } = useWorkspace()

  if (state.status === 'idle' || state.status === 'initializing') {
    return <LoadingPage message="Starting peer-to-peer node…" />
  }

  if (state.status === 'needs_setup') {
    return (
      <SetupPage
        onComplete={completeSetup}
        onSignIn={connectFromCode}
        error={state.error}
      />
    )
  }

  if (state.status === 'locked') {
    return (
      <UnlockPage
        displayName={state.identity?.getProfile().displayName}
        onUnlock={unlock}
        error={state.error}
      />
    )
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
      onUpdateProfile={updateProfile}
    />
  )
}
