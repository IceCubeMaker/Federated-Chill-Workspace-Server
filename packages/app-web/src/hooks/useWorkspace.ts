import { useState, useEffect, useRef, useCallback } from 'react'
import type { DocumentId, GroupDocument } from '@federation/models'
import { LocalIdentity } from '@federation/auth'
import { FederatedWorkspace } from '@federation/app'

export type WorkspaceStatus = 'idle' | 'initializing' | 'ready' | 'error'

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
}

const PENDING_NAME_KEY = 'fed-pending-display-name'

function getBrowserDataDir(): string {
  // In browser context the dataDir is a logical key for IndexedDB
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

  useEffect(() => {
    let cancelled = false

    async function init() {
      setState((s) => ({ ...s, status: 'initializing' }))
      try {
        const identity = new LocalIdentity(getBrowserDataDir())
        await identity.load()
        // Apply display name entered during first-run setup
        const pendingName = localStorage.getItem(PENDING_NAME_KEY)
        if (pendingName) {
          await identity.updateProfile({ displayName: pendingName })
          localStorage.removeItem(PENDING_NAME_KEY)
        }
        identityRef.current = identity

        const ws = new FederatedWorkspace(identity)
        await ws.initialize({
          platform: 'browser',
          bootstrapPeers: [],
          nodeRole: 'client', // Browser uses circuit relay for inbound reachability
        })
        wsRef.current = ws

        // Give the relay reservation a moment to propagate before reading addrs
        await new Promise((r) => setTimeout(r, 1500))

        if (!cancelled) {
          setState({
            status: 'ready',
            workspace: ws,
            identity,
            displayName: identity.getProfile().displayName,
            groups: [],
            activeGroupId: null,
            peerId: ws.getPeerId(),
            listenAddresses: ws.getListenAddresses(),
          })
          refreshGroups()
        }
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({ ...s, status: 'error', error: String(err), peerId: null, listenAddresses: [] }))
        }
      }
    }

    init()
    return () => { cancelled = true }
  }, [refreshGroups])

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
    if (identity) {
      await identity.updateProfile(patch)
      if (patch.displayName !== undefined) {
        setState((s) => ({ ...s, displayName: patch.displayName! }))
      }
    } else if (patch.displayName) {
      // Identity not loaded yet; save for init() to pick up
      localStorage.setItem(PENDING_NAME_KEY, patch.displayName)
    }
  }, [])

  return { state, switchGroup, createGroup, refreshGroups, updateProfile }
}
