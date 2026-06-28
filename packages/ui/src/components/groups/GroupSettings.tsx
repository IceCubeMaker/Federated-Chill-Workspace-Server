import React, { useState } from 'react'
import type { Action, DocumentId, GroupDocument, Holder, PermissionRule, Role, RoleId, PeerIdStr } from '@federation/models'
import { color, space, fontSize, fontWeight, radius } from '../../tokens/index.js'
import { Tabs } from '../Tabs.js'
import { Button } from '../Button.js'
import { Input } from '../Input.js'
import { Toggle } from '../Toggle.js'
import { Select } from '../Select.js'
import { Badge } from '../Badge.js'
import { Avatar } from '../Avatar.js'
import { Modal } from '../Modal.js'

// ── Prop types ────────────────────────────────────────────────────────────────

export interface GroupSettingsCallbacks {
  onUpdateMetadata: (patch: Partial<GroupDocument['metadata']>) => Promise<void>
  onKickMember: (userId: PeerIdStr) => Promise<void>
  onAcceptApplication: (userId: PeerIdStr) => Promise<void>
  onDenyApplication: (userId: PeerIdStr) => Promise<void>
  onCreateRole: (name: string, isAdmin: boolean) => Promise<void>
  onDeleteRole: (roleId: RoleId) => Promise<void>
  onAddMemberToRole: (roleId: RoleId, userId: PeerIdStr) => Promise<void>
  onRemoveMemberFromRole: (roleId: RoleId, userId: PeerIdStr) => Promise<void>
  onUpdatePermission: (action: Action, holders: Holder[], changeRule: Holder[]) => Promise<void>
  canPerform: (action: Action) => Promise<boolean>
}

export interface GroupSettingsProps {
  groupId: DocumentId
  doc: GroupDocument
  currentUserId: PeerIdStr
  cb: GroupSettingsCallbacks
}

// ── General Tab ───────────────────────────────────────────────────────────────

function GeneralTab({ doc, cb }: { doc: GroupDocument; cb: GroupSettingsCallbacks }) {
  const [name, setName] = useState(doc.metadata.name)
  const [desc, setDesc] = useState(doc.metadata.description ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try { await cb.onUpdateMetadata({ name, description: desc }) } finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4], maxWidth: 480 }}>
      <Input label="Group name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input label="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
      <Select
        label="Visibility"
        value={doc.metadata.visibility}
        onChange={(v) => cb.onUpdateMetadata({ visibility: v as GroupDocument['metadata']['visibility'] })}
        options={[
          { value: 'open', label: 'Open — anyone can join' },
          { value: 'application', label: 'Application — admin approval required' },
          { value: 'private', label: 'Private — invite only' },
        ]}
      />
      <Toggle
        label="Publicly viewable (non-members can browse metadata)"
        checked={doc.metadata.isPubliclyViewable}
        onChange={(v) => cb.onUpdateMetadata({ isPubliclyViewable: v })}
      />
      <Button onClick={save} loading={saving} style={{ alignSelf: 'flex-start' }}>
        Save changes
      </Button>
    </div>
  )
}

// ── Members Tab ───────────────────────────────────────────────────────────────

function MembersTab({ doc, currentUserId, cb }: { doc: GroupDocument; currentUserId: PeerIdStr; cb: GroupSettingsCallbacks }) {
  const applications = Object.entries(doc.pendingApplications)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {applications.length > 0 && (
        <section>
          <h4 style={{ margin: `0 0 ${space[3]}`, color: color.textSecondary, fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Pending Applications ({applications.length})
          </h4>
          {applications.map(([userId, { appliedAt }]) => (
            <div key={userId} style={rowStyle}>
              <Avatar name={userId} size={32} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: fontSize.sm, color: color.textPrimary }}>{userId.slice(0, 12)}…</div>
                <div style={{ fontSize: fontSize.xs, color: color.textMuted }}>
                  Applied {new Date(appliedAt).toLocaleDateString()}
                </div>
              </div>
              <Button size="sm" onClick={() => cb.onAcceptApplication(userId)}>Accept</Button>
              <Button size="sm" variant="danger" onClick={() => cb.onDenyApplication(userId)}>Deny</Button>
            </div>
          ))}
        </section>
      )}

      <section>
        <h4 style={{ margin: `0 0 ${space[3]}`, color: color.textSecondary, fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Members ({doc.members.length})
        </h4>
        {doc.members.map((userId) => {
          const userRoles = Object.values(doc.roles).filter((r) => r.members.includes(userId))
          const isMe = userId === currentUserId
          return (
            <div key={userId} style={rowStyle}>
              <Avatar name={userId} size={32} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: fontSize.sm, color: color.textPrimary }}>
                  {userId.slice(0, 16)}…{isMe && ' (you)'}
                </div>
                <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', marginTop: space[1] }}>
                  {userRoles.map((r) => (
                    <Badge key={r.id} variant={r.isAdministrator ? 'brand' : 'default'}>{r.name}</Badge>
                  ))}
                </div>
              </div>
              {!isMe && (
                <Button size="sm" variant="danger" onClick={() => cb.onKickMember(userId)}>
                  Kick
                </Button>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}

// ── Roles Tab ─────────────────────────────────────────────────────────────────

function RolesTab({ doc, cb }: { doc: GroupDocument; cb: GroupSettingsCallbacks }) {
  const [showCreate, setShowCreate] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleAdmin, setNewRoleAdmin] = useState(false)

  const createRole = async () => {
    if (!newRoleName.trim()) return
    await cb.onCreateRole(newRoleName.trim(), newRoleAdmin)
    setNewRoleName('')
    setNewRoleAdmin(false)
    setShowCreate(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="sm" onClick={() => setShowCreate(true)}>+ New role</Button>
      </div>

      {Object.values(doc.roles).map((role) => (
        <RoleCard key={role.id} role={role} doc={doc} cb={cb} />
      ))}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create role">
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
          <Input label="Role name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} />
          <Toggle label="Administrator (bypasses all permission checks)" checked={newRoleAdmin} onChange={setNewRoleAdmin} />
          <div style={{ display: 'flex', gap: space[3], justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={createRole}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function RoleCard({ role, doc, cb }: { role: Role; doc: GroupDocument; cb: GroupSettingsCallbacks }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ background: color.surface2, border: `1px solid ${color.border}`, borderRadius: radius.lg }}>
      <div
        style={{ ...rowStyle, cursor: 'pointer', padding: space[4] }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
            <span style={{ color: color.textPrimary, fontWeight: fontWeight.semibold }}>{role.name}</span>
            {role.isAdministrator && <Badge variant="brand">Admin</Badge>}
          </div>
          {role.description && <div style={{ fontSize: fontSize.xs, color: color.textMuted }}>{role.description}</div>}
        </div>
        <span style={{ color: color.textMuted, fontSize: fontSize.sm }}>{role.members.length} members</span>
        <span style={{ color: color.textMuted }}>{expanded ? '▴' : '▾'}</span>
      </div>

      {expanded && (
        <div style={{ padding: `0 ${space[4]} ${space[4]}`, borderTop: `1px solid ${color.border}` }}>
          <div style={{ paddingTop: space[3], display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {role.members.map((userId) => (
              <div key={userId} style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                <Avatar name={userId} size={24} />
                <span style={{ flex: 1, fontSize: fontSize.sm, color: color.textSecondary }}>{userId.slice(0, 20)}…</span>
                <Button size="sm" variant="ghost" onClick={() => cb.onRemoveMemberFromRole(role.id, userId)}>Remove</Button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: space[2], marginTop: space[2] }}>
              {!role.isAdministrator && (
                <Button size="sm" variant="danger" onClick={() => cb.onDeleteRole(role.id)}>Delete role</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Permissions Tab ───────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  create_doc: 'Create documents',
  edit_doc: 'Edit documents',
  delete_doc: 'Delete documents',
  view_doc: 'View documents',
  invite_member: 'Invite members',
  accept_application: 'Accept applications',
  kick_member: 'Kick members',
  create_role: 'Create roles',
  delete_role: 'Delete roles',
  edit_role: 'Edit roles',
  change_permission: 'Change any permission',
  edit_group_metadata: 'Edit group info',
  delete_group: 'Delete group',
}

function HolderPill({ holder, doc }: { holder: Holder; doc: GroupDocument }) {
  if (holder.type === 'user') {
    return <Badge variant="info">{holder.userId.slice(0, 8)}</Badge>
  }
  if (holder.type === 'role') {
    const role = doc.roles[holder.roleId]
    return <Badge variant={role?.isAdministrator ? 'brand' : 'default'}>{role?.name ?? holder.roleId}</Badge>
  }
  return (
    <Badge variant="warning">
      Vote: {holder.condition.quorumType === 'percentage'
        ? `${Math.round(holder.condition.threshold * 100)}%`
        : `${holder.condition.threshold} votes`}
      {holder.condition.roleScope ? ` (${holder.condition.roleScope})` : ''}
    </Badge>
  )
}

function PermissionsTab({ doc, cb }: { doc: GroupDocument; cb: GroupSettingsCallbacks }) {
  const actions = Object.keys({ ...ACTION_LABELS, ...doc.permissions }) as Action[]

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fontSize.sm }}>
        <thead>
          <tr>
            {(['Action', 'Who can do this', 'Who can change this rule'] as const).map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: `${space[2]} ${space[3]}`,
                  color: color.textSecondary,
                  fontSize: fontSize.xs,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  borderBottom: `1px solid ${color.border}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => {
            const rule = doc.permissions[action]
            return (
              <tr
                key={action}
                style={{ borderBottom: `1px solid ${color.border}` }}
              >
                <td style={{ padding: `${space[3]} ${space[3]}`, color: color.textPrimary, whiteSpace: 'nowrap' }}>
                  {ACTION_LABELS[action] ?? action}
                </td>
                <td style={{ padding: `${space[3]} ${space[3]}` }}>
                  <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
                    {rule?.holders.map((h, i) => <HolderPill key={i} holder={h} doc={doc} />) ?? <span style={{ color: color.textMuted }}>—</span>}
                  </div>
                </td>
                <td style={{ padding: `${space[3]} ${space[3]}` }}>
                  <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
                    {rule && rule.changeRule.length > 0
                      ? rule.changeRule.map((h, i) => <HolderPill key={i} holder={h} doc={doc} />)
                      : <Badge variant="brand">Admin only</Badge>}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Root GroupSettings ────────────────────────────────────────────────────────

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[3],
  padding: `${space[2]} 0`,
}

export function GroupSettings({ doc, currentUserId, cb }: GroupSettingsProps) {
  return (
    <Tabs
      tabs={[
        { key: 'general',     label: 'General',     content: <GeneralTab doc={doc} cb={cb} /> },
        { key: 'members',     label: 'Members',     content: <MembersTab doc={doc} currentUserId={currentUserId} cb={cb} /> },
        { key: 'roles',       label: 'Roles',       content: <RolesTab doc={doc} cb={cb} /> },
        { key: 'permissions', label: 'Permissions', content: <PermissionsTab doc={doc} cb={cb} /> },
      ]}
    />
  )
}
