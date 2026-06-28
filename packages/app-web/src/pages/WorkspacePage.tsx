import React, { useState, useCallback, useEffect, useRef } from 'react'
import type { DocumentId, GroupDocument, PeerIdStr, UserProfile } from '@federation/models'
import {
  color, space, fontSize, fontWeight, radius,
  GroupContextProvider, GroupSwitcher, GroupSettings, GroupChatView,
  Button, Modal, Input, Select, Badge, Avatar, Tooltip,
} from '@federation/ui'
import type { FederatedWorkspace } from '@federation/app'
import type { WorkspaceState } from '../hooks/useWorkspace.js'

interface WorkspacePageProps {
  state: WorkspaceState
  onSwitchGroup: (id: DocumentId | null) => void
  onCreateGroup: (name: string, vis: GroupDocument['metadata']['visibility']) => Promise<void>
  onRefreshGroups: () => void
  onUpdateProfile: (patch: { displayName?: string }) => Promise<void>
  onExportIdentity: () => string
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < breakpoint
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = () => setIsMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return isMobile
}

function ConnectionInfo({ peerId, addresses, peerCount }: {
  peerId: string | null
  addresses: string[]
  peerCount: number
}) {
  const [copied, setCopied] = useState(false)
  const [showAddrs, setShowAddrs] = useState(false)

  const shortId = peerId ? peerId.slice(0, 20) + '…' : '—'

  const copyPeerId = () => {
    if (!peerId) return
    navigator.clipboard.writeText(peerId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const statusLabel = peerCount === 0
    ? '○ Offline mode'
    : `● ${peerCount} peer${peerCount === 1 ? '' : 's'} online`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div>
        <Badge variant={peerCount > 0 ? 'success' : 'default'}>
          {statusLabel}
        </Badge>
      </div>

      {peerId && (
        <div>
          <p style={{ fontSize: fontSize.xs, color: color.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: space[1] }}>
            Peer ID
          </p>
          <Tooltip content={copied ? 'Copied!' : 'Click to copy'}>
            <button
              onClick={copyPeerId}
              style={{
                background: color.surface2,
                border: `1px solid ${color.border}`,
                borderRadius: radius.sm,
                color: color.textSecondary,
                cursor: 'pointer',
                fontSize: fontSize.xs,
                fontFamily: 'monospace',
                padding: `${space[1]} ${space[2]}`,
                width: '100%',
                textAlign: 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {shortId}
            </button>
          </Tooltip>
        </div>
      )}

      {addresses.length > 0 && (
        <div>
          <button
            onClick={() => setShowAddrs((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              color: color.textMuted,
              cursor: 'pointer',
              fontSize: fontSize.xs,
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {showAddrs ? 'Hide' : 'Show'} addresses ({addresses.length})
          </button>
          {showAddrs && (
            <div style={{
              marginTop: space[1],
              display: 'flex',
              flexDirection: 'column',
              gap: space[1],
              maxHeight: 160,
              overflowY: 'auto',
            }}>
              {addresses.map((a) => (
                <code key={a} style={{
                  fontSize: 9,
                  color: color.textMuted,
                  wordBreak: 'break-all',
                  background: color.surface2,
                  padding: `2px ${space[1]}`,
                  borderRadius: radius.sm,
                  display: 'block',
                }}>
                  {a}
                </code>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyState({ onCreateGroup }: { onCreateGroup: () => void }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[4],
      color: color.textMuted,
      padding: space[6],
    }}>
      <div style={{ fontSize: 48, lineHeight: 1 }}>⬡</div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: fontSize.md, color: color.textSecondary, margin: 0, fontWeight: fontWeight.medium }}>No group selected</p>
        <p style={{ fontSize: fontSize.sm, marginTop: space[1], marginBottom: 0 }}>Create a group or join one to get started</p>
      </div>
      <Button onClick={onCreateGroup}>+ Create group</Button>
    </div>
  )
}

function useMembersMap(doc: GroupDocument, currentUserId: string, identity: WorkspaceState['identity']): Map<PeerIdStr, UserProfile> {
  const mapRef = useRef<Map<PeerIdStr, UserProfile>>(new Map())

  useEffect(() => {
    const map = new Map<PeerIdStr, UserProfile>()
    const myProfile = identity?.getProfile()
    for (const memberId of doc.members) {
      if (memberId === currentUserId && myProfile) {
        map.set(memberId, myProfile)
      } else {
        map.set(memberId, {
          userId: memberId,
          displayName: memberId.slice(0, 12),
          publicKeyHex: '',
          createdAt: 0,
        })
      }
    }
    mapRef.current = map
  }, [doc.members, currentUserId, identity])

  return mapRef.current
}

function GroupView({
  groupId,
  doc,
  workspace,
  currentUserId,
  identity,
}: {
  groupId: DocumentId
  doc: GroupDocument
  workspace: FederatedWorkspace
  currentUserId: string
  identity: WorkspaceState['identity']
}) {
  const [view, setView] = useState<'chat' | 'settings'>('chat')
  const [canCreateChannel, setCanCreateChannel] = useState(false)
  const [canSendMessage, setCanSendMessage] = useState(true)
  const members = useMembersMap(doc, currentUserId, identity)

  useEffect(() => {
    void workspace.permissions.canPerform(currentUserId, groupId, 'create_channel').then(setCanCreateChannel)
    void workspace.permissions.canPerform(currentUserId, groupId, 'send_message').then(setCanSendMessage)
  }, [workspace.permissions, currentUserId, groupId])

  const cb = {
    onUpdateMetadata: async (patch: Partial<GroupDocument['metadata']>) => {
      await workspace.updateDocument(groupId, (d: GroupDocument) => { Object.assign(d.metadata, patch) }, groupId)
    },
    onKickMember: async (userId: string) => {
      await workspace.groups.kickMember(groupId, userId)
    },
    onAcceptApplication: async (userId: string) => {
      await workspace.groups.acceptApplication(groupId, userId)
    },
    onDenyApplication: async (userId: string) => {
      await workspace.updateDocument(groupId, (d: GroupDocument) => {
        delete d.pendingApplications[userId]
      }, groupId)
    },
    onCreateRole: async (name: string, isAdmin: boolean) => {
      await workspace.groups.createRole(groupId, { name, members: [], isAdministrator: isAdmin })
    },
    onDeleteRole: async (roleId: string) => {
      await workspace.groups.deleteRole(groupId, roleId)
    },
    onAddMemberToRole: async (roleId: string, userId: string) => {
      await workspace.groups.updateRole(groupId, roleId, {
        members: [...(doc.roles[roleId]?.members ?? []), userId],
      })
    },
    onRemoveMemberFromRole: async (roleId: string, userId: string) => {
      await workspace.groups.updateRole(groupId, roleId, {
        members: (doc.roles[roleId]?.members ?? []).filter((m) => m !== userId),
      })
    },
    onUpdatePermission: async (action: string, holders: any[], changeRule: any[]) => {
      await workspace.permissions.updatePermission(groupId, action, holders, changeRule)
    },
    canPerform: async (action: string) => {
      return workspace.permissions.canPerform(currentUserId, groupId, action)
    },
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[3],
        padding: `${space[3]} ${space[4]}`,
        borderBottom: `1px solid ${color.border}`,
        background: color.surface1,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: color.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc.metadata.name}
        </span>
        <Badge variant={doc.metadata.visibility === 'open' ? 'success' : doc.metadata.visibility === 'application' ? 'warning' : 'default'}>
          {doc.metadata.visibility}
        </Badge>
        <button
          onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          style={{
            background: view === 'settings' ? color.surface3 : 'transparent',
            border: `1px solid ${view === 'settings' ? color.border : 'transparent'}`,
            borderRadius: radius.md,
            color: color.textSecondary,
            cursor: 'pointer',
            padding: `${space[1]} ${space[3]}`,
            fontSize: fontSize.sm,
            whiteSpace: 'nowrap',
            outline: 'none',
          }}
        >
          Settings
        </button>
      </header>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {view === 'settings' ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <GroupSettings groupId={groupId} doc={doc} currentUserId={currentUserId} cb={cb} />
          </div>
        ) : (
          <GroupChatView
            groupId={groupId}
            doc={doc}
            chat={workspace.chat}
            currentUserId={currentUserId}
            members={members}
            canCreateChannel={canCreateChannel}
            canSendMessage={canSendMessage}
          />
        )}
      </div>
    </div>
  )
}

export function WorkspacePage({ state, onSwitchGroup, onCreateGroup, onRefreshGroups, onUpdateProfile, onExportIdentity }: WorkspacePageProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newVis, setNewVis] = useState<GroupDocument['metadata']['visibility']>('private')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)

  const isMobile = useIsMobile()

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      await onCreateGroup(newName.trim(), newVis)
      setCreateOpen(false)
      setNewName('')
    } catch (err) {
      console.error('[WorkspacePage] createGroup failed:', err)
      setCreateError(err instanceof Error ? err.message : String(err))
    } finally { setCreating(false) }
  }

  const { workspace, identity, groups, activeGroupId, displayName } = state
  const currentUserId = identity?.getPeerId() ?? ''
  const activeGroup = groups.find((g) => g.id === activeGroupId)

  const getGroup = useCallback((id: DocumentId) => {
    return groups.find((g) => g.id === id)?.doc ?? null
  }, [groups])

  return (
    <GroupContextProvider getGroup={getGroup} initialGroupId={activeGroupId ?? undefined}>
      <div style={{ display: 'flex', height: '100%', background: color.surface0 }}>
        {/* Group switcher sidebar */}
        <GroupSwitcher
          groups={groups}
          onCreateGroup={() => setCreateOpen(true)}
          onSwitchGroup={onSwitchGroup}
          currentUser={isMobile ? { name: displayName, isConnected: !!state.workspace } : undefined}
          onProfileClick={isMobile ? () => setProfileOpen(true) : undefined}
        />

        {/* Main area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: color.surface1 }}>
          {activeGroup && workspace ? (
            <GroupView
              groupId={activeGroup.id}
              doc={activeGroup.doc}
              workspace={workspace}
              currentUserId={currentUserId}
              identity={state.identity}
            />
          ) : (
            <EmptyState onCreateGroup={() => setCreateOpen(true)} />
          )}
        </div>

        {/* Right sidebar — desktop only */}
        {!isMobile && (
          <aside style={{
            width: 220,
            borderLeft: `1px solid ${color.border}`,
            background: color.surface1,
            display: 'flex',
            flexDirection: 'column',
            padding: space[3],
            gap: space[3],
            flexShrink: 0,
            overflowY: 'auto',
          }}>
            <div>
              <p style={{ fontSize: fontSize.xs, color: color.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: space[2] }}>
                You
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                <Avatar name={displayName} size={28} />
                <span style={{ fontSize: fontSize.sm, color: color.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName}
                </span>
              </div>
            </div>

            {activeGroup && (
              <div>
                <p style={{ fontSize: fontSize.xs, color: color.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: space[2] }}>
                  Members ({activeGroup.doc.members.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
                  {activeGroup.doc.members.map((m) => (
                    <div key={m} style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                      <Avatar name={m} size={24} />
                      <span style={{ fontSize: fontSize.xs, color: color.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.slice(0, 14)}…
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: space[3] }}>
              <ConnectionInfo peerId={state.peerId} addresses={state.listenAddresses} peerCount={state.peerCount} />
              <button
                onClick={() => {
                  const blob = onExportIdentity()
                  const a = document.createElement('a')
                  a.href = `data:application/json,${encodeURIComponent(blob)}`
                  a.download = 'federation-identity.json'
                  a.click()
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: color.textMuted,
                  cursor: 'pointer',
                  fontSize: fontSize.xs,
                  padding: 0,
                  textDecoration: 'underline',
                  textAlign: 'left',
                }}
              >
                Export identity
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Create group modal */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setCreateError(null) }} title="Create a group">
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
          <Input label="Group name" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }} />
          <Select
            label="Visibility"
            value={newVis}
            onChange={setNewVis}
            options={[
              { value: 'private', label: 'Private — invite only' },
              { value: 'open', label: 'Open — anyone can join' },
              { value: 'application', label: 'Application — admin approves' },
            ]}
          />
          {createError && (
            <p style={{ margin: 0, fontSize: fontSize.sm, color: color.error }}>
              Error: {createError}
            </p>
          )}
          <div style={{ display: 'flex', gap: space[3], justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => { setCreateOpen(false); setCreateError(null) }}>Cancel</Button>
            <Button onClick={() => void handleCreate()} loading={creating} disabled={!newName.trim()}>
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Mobile profile modal */}
      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} title="Profile">
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
            <Avatar name={displayName} size={40} />
            <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: color.textPrimary }}>
              {displayName}
            </span>
          </div>
          <ConnectionInfo peerId={state.peerId} addresses={state.listenAddresses} peerCount={state.peerCount} />
          <Button
            variant="ghost"
            onClick={() => {
              const blob = onExportIdentity()
              const a = document.createElement('a')
              a.href = `data:application/json,${encodeURIComponent(blob)}`
              a.download = 'federation-identity.json'
              a.click()
            }}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Export identity (backup / new device)
          </Button>
          {activeGroup && (
            <div>
              <p style={{ fontSize: fontSize.xs, color: color.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: space[2] }}>
                Members ({activeGroup.doc.members.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
                {activeGroup.doc.members.map((m) => (
                  <div key={m} style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                    <Avatar name={m} size={24} />
                    <span style={{ fontSize: fontSize.xs, color: color.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.slice(0, 14)}…
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </GroupContextProvider>
  )
}
