import { useState, useEffect, useRef, useCallback } from 'react'
import type { DocumentId, GroupDocument } from '@federation/models'
import { LocalIdentity } from '@federation/auth'
import { FederatedWorkspace } from '@federation/app'

export type WorkspaceStatus = 'idle' | 'initializing' | 'needs_setup' | 'locked' | 'ready' | 'error'

export interface WorkspaceState {
  status: WorkspaceStatus
  error?: string
  workspace: FederatedWorkspace | null
  identity: LocalIdentity | null
  displayName: string
  groups: Array<{ id: DocumentId; doc: GroupDocument }>
  activeGroupId: DocumentId | null
  peerId: string | null
  listenAddresses: string[]
  peerCount: number
}

function getBrowserDataDir(): string {
  return 'federation-workspace'
}

export function useWorkspace() {
  const wsRef = useRef<FederatedWorkspace | null>(null)
  const identityRef = useRef<LocalIdentity | null>(null)

  const [state, setState] = useState<WorkspaceState>({
    status: 'idle',
    workspace: null,
    identity: null,
    displayName: 'Me',
    groups: [],
    activeGroupId: null,
    peerId: null,
    listenAddresses: [],
    peerCount: 0,
  })

  const refreshGroups = useCallback(() => {
    const ws = wsRef.current
    if (!ws) return
    const ids = ws.groups.listMyGroups()
    const groups = ids.flatMap((id) => {
      try {
        const doc = ws.groups.getGroupDocument(id)
        return doc ? [{ id, doc }] : []
      } catch { return [] }
    })
    setState((s) => ({ ...s, groups }))
  }, [])

  // Initialize the libp2p node + Automerge repo after identity is unlocked
  const initNode = useCallback(async (identity: LocalIdentity) => {
    const ws = new FederatedWorkspace(identity)
    await ws.initialize({
      platform: 'browser',
      bootstrapPeers: [],
      nodeRole: 'client',
    })
    wsRef.current = ws

    // Give relay reservation a moment to propagate
    await new Promise((r) => setTimeout(r, 1500))

    // Subscribe to peer count changes
    const unsubPeers = ws.onPeerCountChange((count) => {
      setState((s) => ({ ...s, peerCount: count }))
    })

    setState({
      status: 'ready',
      workspace: ws,
      identity,
      displayName: identity.getProfile().displayName,
      groups: [],
      activeGroupId: null,
      peerId: ws.getPeerId(),
      listenAddresses: ws.getListenAddresses(),
      peerCount: ws.getPeerCount(),
    })
    refreshGroups()

    // Cleanup on unmount (stored in ref so effect cleanup can reach it)
    return unsubPeers
  }, [refreshGroups])

  useEffect(() => {
    let cancelled = false
    let unsubPeers: (() => void) | null = null

    async function init() {
      setState((s) => ({ ...s, status: 'initializing' }))
      try {
        const identity = new LocalIdentity(getBrowserDataDir())
        const isNew = await identity.load()
        identityRef.current = identity

        if (cancelled) return

        if (isNew) {
          // Brand-new user — show setup page
          setState((s) => ({ ...s, status: 'needs_setup', identity }))
          return
        }

        if (identity.isProtected() && !identity.isUnlocked()) {
          // Returning user with password — show unlock page
          setState((s) => ({ ...s, status: 'locked', identity }))
          return
        }

        // Unprotected returning user — go straight to workspace
        unsubPeers = await initNode(identity)
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({ ...s, status: 'error', error: String(err), peerId: null, listenAddresses: [] }))
        }
      }
    }

    init()
    return () => {
      cancelled = true
      unsubPeers?.()
    }
  }, [initNode])

  /** Called from SetupPage when user finishes first-run setup. */
  const completeSetup = useCallback(async (displayName: string, password: string) => {
    const identity = identityRef.current
    if (!identity) return
    setState((s) => ({ ...s, status: 'initializing' }))
    try {
      await identity.updateProfile({ displayName })
      if (password) await identity.protect(password)
      await initNode(identity)
    } catch (err) {
      setState((s) => ({ ...s, status: 'error', error: String(err) }))
    }
  }, [initNode])

  /** Called from UnlockPage when user enters their password. */
  const unlock = useCallback(async (password: string) => {
    const identity = identityRef.current
    if (!identity) return
    setState((s) => ({ ...s, status: 'initializing' }))
    try {
      await identity.unlock(password)
      await initNode(identity)
    } catch (err) {
      // Re-surface the 'locked' status with an error message so UnlockPage can show it
      setState((s) => ({ ...s, status: 'locked', error: String(err) }))
    }
  }, [initNode])

  /**
   * Import an identity blob (from another device) and either go to the unlock
   * screen (if protected) or straight to the workspace.
   */
  const importIdentity = useCallback(async (blob: string) => {
    const identity = identityRef.current
    if (!identity) return
    setState((s) => ({ ...s, status: 'initializing' }))
    try {
      await identity.importFromBlob(blob)
      if (identity.isProtected()) {
        setState((s) => ({ ...s, status: 'locked', identity }))
      } else {
        await initNode(identity)
      }
    } catch (err) {
      setState((s) => ({ ...s, status: 'needs_setup', error: String(err) }))
    }
  }, [initNode])

  /** Export the current identity as a blob for transfer to another device. */
  const exportIdentity = useCallback((): string => {
    return identityRef.current?.exportBlob() ?? ''
  }, [])

  const switchGroup = useCallback((id: DocumentId | null) => {
    wsRef.current?.switchGroup(id)
    setState((s) => ({ ...s, activeGroupId: id }))
  }, [])

  const createGroup = useCallback(async (name: string, visibility: GroupDocument['metadata']['visibility']) => {
    const ws = wsRef.current
    if (!ws) return
    const id = await ws.groups.createGroup(name, visibility, visibility === 'open')
    refreshGroups()
    switchGroup(id)
  }, [refreshGroups, switchGroup])

  const updateProfile = useCallback(async (patch: { displayName?: string }) => {
    const identity = identityRef.current
    if (!identity) return
    await identity.updateProfile(patch)
    if (patch.displayName !== undefined) {
      setState((s) => ({ ...s, displayName: patch.displayName! }))
    }
  }, [])

  return {
    state,
    switchGroup,
    createGroup,
    refreshGroups,
    updateProfile,
    completeSetup,
    unlock,
    importIdentity,
    exportIdentity,
  }
}
