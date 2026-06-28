import type { DocumentId, PeerIdStr } from '@federation/types'

// ─── Re-export base types ────────────────────────────────────────────────────
export type { DocumentId, PeerIdStr } from '@federation/types'

// ─── Identifiers ─────────────────────────────────────────────────────────────
export type RoleId = string
export type InviteToken = string
export type ChannelId = string

// ─── System Actions ──────────────────────────────────────────────────────────
export type SystemAction =
  | 'create_doc'
  | 'edit_doc'
  | 'delete_doc'
  | 'view_doc'
  | 'invite_member'
  | 'accept_application'
  | 'kick_member'
  | 'create_role'
  | 'delete_role'
  | 'edit_role'
  | 'change_permission'
  | 'edit_group_metadata'
  | 'delete_group'
  | 'create_channel'
  | 'delete_channel'
  | 'edit_channel'
  | 'send_message'
  | 'delete_message'
  | 'manage_messages'

/** System actions plus any arbitrary custom action string. */
export type Action = SystemAction | string

// ─── Voting ──────────────────────────────────────────────────────────────────
export interface VotingCondition {
  quorumType: 'percentage' | 'absolute'
  /** 0–1 for percentage (e.g. 0.66 = 2/3), positive integer for absolute. */
  threshold: number
  /** If set, only votes from members of this role count. */
  roleScope?: RoleId
  /** Optional expiry window in seconds. */
  timeWindowSeconds?: number
}

// ─── Holders ─────────────────────────────────────────────────────────────────
export type Holder =
  | { type: 'user'; userId: PeerIdStr }
  | { type: 'role'; roleId: RoleId }
  | { type: 'vote'; condition: VotingCondition }

// ─── Permission Rule ─────────────────────────────────────────────────────────
export interface PermissionRule {
  action: Action
  /** Entities that may perform the action. */
  holders: Holder[]
  /** Entities that may modify this rule. Empty = administrator role only. */
  changeRule: Holder[]
  description?: string
}

// ─── Role ────────────────────────────────────────────────────────────────────
export interface Role {
  id: RoleId
  name: string
  description?: string
  /** Peer IDs of members who hold this role. */
  members: PeerIdStr[]
  /** If true, this role bypasses all permission checks. */
  isAdministrator: boolean
}

// ─── Group metadata (always public if isPubliclyViewable) ────────────────────
export interface GroupMetadata {
  name: string
  description?: string
  visibility: 'private' | 'open' | 'application'
  avatarUrl?: string
  /** If true, non-members can browse public channels / metadata. */
  isPubliclyViewable: boolean
}

// ─── Full Group Document (stored in Automerge) ───────────────────────────────
export interface GroupDocument {
  id: DocumentId
  metadata: GroupMetadata
  createdAt: number
  createdBy: PeerIdStr

  /** All current members. */
  members: PeerIdStr[]

  /** Key = peerId of applicant. Only used when visibility === 'application'. */
  pendingApplications: Record<PeerIdStr, { appliedAt: number }>

  /** Pending invite tokens: key = token, value = invitee peerId (or '' for open invites). */
  pendingInvites: Record<InviteToken, { invitedBy: PeerIdStr; invitedAt: number; forUserId?: PeerIdStr }>

  roles: Record<RoleId, Role>
  permissions: Record<Action, PermissionRule>
  defaultRoleId: RoleId

  /**
   * For private groups: a reference to a separate encrypted sub-document
   * that holds sensitive data (channel messages, private docs etc.).
   * The public GroupDocument itself stores roles/permissions in the clear
   * so admins can sync them; actual content is in the sub-document.
   */
  privateDataRef?: DocumentId

  /** Chat channels in this group, keyed by channelId. */
  channels: Record<ChannelId, Channel>

  /** Maps channelId → DocumentId of the ChannelMessages Automerge doc. */
  channelMessageDocIds: Record<ChannelId, DocumentId>
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface Channel {
  id: ChannelId
  name: string
  description?: string
  /** Lower position = displayed higher in the list. */
  position: number
  createdAt: number
  createdBy: PeerIdStr
  /** Cannot be deleted; always exists in the group. */
  isDefault: boolean
}

export interface ChatMessage {
  id: string
  authorId: PeerIdStr
  content: string
  timestamp: number
  /** PeerIds of explicitly @-mentioned users. */
  mentions: PeerIdStr[]
  replyTo?: string
  editedAt?: number
  deleted?: boolean
}

/** One Automerge document per channel, holds all messages as a CRDT list. */
export interface ChannelMessages {
  messages: ChatMessage[]
  lastMessageTimestamp: number
}

export interface ReadState {
  channelId: ChannelId
  lastReadMessageId: string
  readAt: number
}

// ─── User Profile ─────────────────────────────────────────────────────────────
export interface UserProfile {
  userId: PeerIdStr
  displayName: string
  /** Ed25519 public key (32 bytes), hex-encoded for JSON compatibility. */
  publicKeyHex: string
  createdAt: number
}
