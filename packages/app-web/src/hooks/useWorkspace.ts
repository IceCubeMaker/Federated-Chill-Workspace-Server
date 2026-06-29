import { useState, useEffect, useRef, useCallback } from 'react'
import type { DocumentId, GroupDocument, IdentityDocument } from '@federation/models'
import { LocalIdentity } from '@federation/auth'
import { FederatedWorkspace } from '@federation/app'
import { CapacitorStorageAdapter } from '../lib/capacitor-storage-adapter.js'
import { createCapacitorIdentityStorage } from '../lib/capacitor-identity-storage.js'

// True only when running inside a Capacitor native shell (Android / iOS).
function detectNative(): boolean {
  const cap = (globalThis as Record<string, unknown>)['Capacitor'] as Record<string, unknown> | undefined
  if (!cap) return false
  const fn = cap['isNativePlatform']
  return typeof fn === 'function' && (fn as () => boolean)()
}
const IS_NATIVE = detectNative()

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
  /** Identity document ID — the "connection code" for logging in on another device. */
  connectionCode: string | null
}

function makeIdentity(): LocalIdentity {
  return new LocalIdentity(
    'federation-workspace',
    IS_NATIVE ? createCapacitorIdentityStorage() : undefined,
  )
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
    connectionCode: null,
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
      storageAdapter: IS_NATIVE ? new CapacitorStorageAdapter() : undefined,
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
      connectionCode: identity.getIdentityDocId(),
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
        const identity = makeIdentity()
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
   * Sign in on a new device using a connection code (identity doc ID) and password.
   * Spins up a temporary P2P node to fetch the identity document from the swarm,
   * reconstructs the identity from it, then fully initialises the workspace.
   */
  const connectFromCode = useCallback(async (connectionCode: string, password: string) => {
    const identity = identityRef.current
    if (!identity) return
    setState((s) => ({ ...s, status: 'initializing' }))
    try {
      // Temporary node — used only to fetch the identity doc from the swarm
      const tempWs = new FederatedWorkspace(identity)
      await tempWs.initialize({ platform: 'browser', storageAdapter: IS_NATIVE ? new CapacitorStorageAdapter() : undefined, bootstrapPeers: [], nodeRole: 'client' })

      // Give peers a moment to connect and share the doc
      await new Promise((r) => setTimeout(r, 2500))

      const handle = tempWs.getPublicHandle<IdentityDocument>(connectionCode as DocumentId)
      const identityDoc = await Promise.race([
        handle.doc() as Promise<IdentityDocument | undefined>,
        new Promise<undefined>((_, reject) =>
          setTimeout(
            () => reject(new Error('Identity not found on the network. Make sure your other device is online and connected.')),
            15000,
          )
        ),
      ])

      await tempWs.shutdown()

      if (!identityDoc) throw new Error('Identity document was empty')

      // Reconstruct the stored identity and save it locally
      await identity.importFromBlob(JSON.stringify({
        peerId: identityDoc.profile.userId,
        publicKeyHex: identityDoc.publicKeyHex,
        encrypted: {
          ciphertextHex: identityDoc.encryptedCiphertextHex,
          nonceHex: identityDoc.encryptedNonceHex,
          saltHex: identityDoc.encryptedSaltHex,
        },
        rootDocId: identityDoc.rootDocId || undefined,
        identityDocId: connectionCode,
        profile: identityDoc.profile,
      }))

      // Decrypt the private key, then start the real workspace
      await identity.unlock(password)
      await initNode(identity)
    } catch (err) {
      setState((s) => ({ ...s, status: 'needs_setup', error: String(err) }))
    }
  }, [initNode])

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
    connectFromCode,
  }
}
