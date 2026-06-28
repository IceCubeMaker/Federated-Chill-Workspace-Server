import { v4 as uuidv4 } from 'uuid'
import type { DocumentId, GroupDocument, GroupMetadata, PeerIdStr, Action, PermissionRule, Role, RoleId } from '@federation/models'
import type { LocalIdentity } from '@federation/auth'
import type { WorkspaceFederation } from '@federation/sync'
import { GroupCrypto } from './group-crypto.js'
import { getDefaultPermissions, ADMIN_ROLE_ID, MEMBER_ROLE_ID } from './default-permissions.js'

const DM_TOPIC_PREFIX = 'sync:dm:'

export class GroupManager {
  /** groupId → symmetric group key */
  private readonly groupKeys = new Map<DocumentId, Uint8Array>()

  constructor(
    private readonly federation: WorkspaceFederation,
    private readonly identity: LocalIdentity,
  ) {}

  async createGroup(
    name: string,
    visibility: GroupMetadata['visibility'],
    isPubliclyViewable: boolean,
  ): Promise<DocumentId> {
    const creatorId = this.identity.getPeerId()
    const groupKey = await GroupCrypto.generateGroupKey()

    const adminRole: Role = {
      id: ADMIN_ROLE_ID,
      name: 'Admin',
      description: 'Full control',
      members: [creatorId],
      isAdministrator: true,
    }

    const memberRole: Role = {
      id: MEMBER_ROLE_ID,
      name: 'Member',
      description: 'Standard member access',
      members: [],
      isAdministrator: false,
    }

    const permissions = getDefaultPermissions(creatorId)

    const groupDoc: GroupDocument = {
      id: '' as DocumentId, // filled in after creation
      metadata: { name, description: undefined, visibility, avatarUrl: undefined, isPubliclyViewable },
      createdAt: Date.now(),
      createdBy: creatorId,
      members: [creatorId],
      pendingApplications: {},
      pendingInvites: {},
      roles: { [ADMIN_ROLE_ID]: adminRole, [MEMBER_ROLE_ID]: memberRole },
      permissions,
      defaultRoleId: MEMBER_ROLE_ID,
    }

    const docId = await this.federation.createDocument<GroupDocument>(groupDoc)

    // Back-fill the id field
    await this.federation.updateDocument<GroupDocument>(docId, (doc) => {
      doc.id = docId
    })

    this.groupKeys.set(docId, groupKey)

    // Also store the key in the federation repo so encrypted payloads work
    this.federation.getRepo().importKey(docId, groupKey)

    return docId
  }

  async joinGroup(groupId: DocumentId): Promise<void> {
    const doc = this.getGroupDocument(groupId)
    const userId = this.identity.getPeerId()

    if (doc.metadata.visibility === 'open') {
      await this.federation.updateDocument<GroupDocument>(groupId, (d) => {
        if (!d.members.includes(userId)) {
          d.members.push(userId)
          const defaultRole = d.roles[d.defaultRoleId]
          if (defaultRole && !defaultRole.members.includes(userId)) {
            defaultRole.members.push(userId)
          }
        }
      })
    } else if (doc.metadata.visibility === 'application') {
      await this.federation.updateDocument<GroupDocument>(groupId, (d) => {
        if (!(userId in d.pendingApplications)) {
          d.pendingApplications[userId] = { appliedAt: Date.now() }
        }
      })
    } else {
      throw new Error('Cannot join a private group without an invite.')
    }
  }

  async inviteMember(groupId: DocumentId, targetUserId: PeerIdStr, targetPublicKey: Uint8Array): Promise<void> {
    const groupKey = this.#requireKey(groupId)
    const senderSk = await this.#getSenderPrivateKey()

    const encryptedKey = await GroupCrypto.encryptGroupKey(groupKey, targetPublicKey, senderSk)
    const token = uuidv4()
    const myId = this.identity.getPeerId()

    // Store invite token in the group document
    await this.federation.updateDocument<GroupDocument>(groupId, (doc) => {
      doc.pendingInvites[token] = { invitedBy: myId, invitedAt: Date.now(), forUserId: targetUserId }
    })

    // Publish the encrypted key + token to the invitee's DM topic
    const dmPayload = JSON.stringify({
      type: 'group_invite',
      groupId,
      token,
      encryptedGroupKey: Array.from(encryptedKey),
    })
    const pubsub = this.federation.getPubSub()
    await pubsub.publish(`${DM_TOPIC_PREFIX}${targetUserId}`, new TextEncoder().encode(dmPayload))
  }

  async acceptInvite(
    groupId: DocumentId,
    token: string,
    encryptedGroupKey: Uint8Array,
    senderPublicKey: Uint8Array,
  ): Promise<void> {
    const mySk = await this.#getSenderPrivateKey()
    const groupKey = await GroupCrypto.decryptGroupKey(encryptedGroupKey, senderPublicKey, mySk)
    this.groupKeys.set(groupId, groupKey)
    this.federation.getRepo().importKey(groupId, groupKey)

    const userId = this.identity.getPeerId()

    await this.federation.updateDocument<GroupDocument>(groupId, (doc) => {
      // Remove invite token
      delete doc.pendingInvites[token]
      // Add member
      if (!doc.members.includes(userId)) {
        doc.members.push(userId)
        const defaultRole = doc.roles[doc.defaultRoleId]
        if (defaultRole && !defaultRole.members.includes(userId)) {
          defaultRole.members.push(userId)
        }
      }
    })
  }

  async acceptApplication(groupId: DocumentId, applicantId: PeerIdStr): Promise<void> {
    await this.federation.updateDocument<GroupDocument>(groupId, (doc) => {
      delete doc.pendingApplications[applicantId]
      if (!doc.members.includes(applicantId)) {
        doc.members.push(applicantId)
        const defaultRole = doc.roles[doc.defaultRoleId]
        if (defaultRole && !defaultRole.members.includes(applicantId)) {
          defaultRole.members.push(applicantId)
        }
      }
    })
  }

  getGroupDocument(groupId: DocumentId): GroupDocument {
    return this.federation.getDocument<GroupDocument>(groupId)
  }

  listMyGroups(): DocumentId[] {
    const userId = this.identity.getPeerId()
    return this.federation.getRepo()
      .listDocumentIds()
      .filter((id) => {
        try {
          const doc = this.federation.getDocument<GroupDocument>(id)
          return Array.isArray(doc?.members) && doc.members.includes(userId)
        } catch {
          return false
        }
      })
  }

  getGroupKey(groupId: DocumentId): Uint8Array | undefined {
    return this.groupKeys.get(groupId)
  }

  importGroupKey(groupId: DocumentId, key: Uint8Array): void {
    this.groupKeys.set(groupId, key)
    this.federation.getRepo().importKey(groupId, key)
  }

  /** Update a role (requires permission check at call site). */
  async updateRole(groupId: DocumentId, roleId: RoleId, patch: Partial<Role>): Promise<void> {
    await this.federation.updateDocument<GroupDocument>(groupId, (doc) => {
      const role = doc.roles[roleId]
      if (!role) return
      Object.assign(role, patch)
    })
  }

  /** Create a new role (requires permission check at call site). */
  async createRole(groupId: DocumentId, role: Omit<Role, 'id'>): Promise<RoleId> {
    const roleId = uuidv4() as RoleId
    await this.federation.updateDocument<GroupDocument>(groupId, (doc) => {
      doc.roles[roleId] = { ...role, id: roleId }
    })
    return roleId
  }

  /** Delete a role (requires permission check at call site). */
  async deleteRole(groupId: DocumentId, roleId: RoleId): Promise<void> {
    await this.federation.updateDocument<GroupDocument>(groupId, (doc) => {
      delete doc.roles[roleId]
    })
  }

  /** Update a permission rule (requires canChangePermission check at call site). */
  async updatePermission(groupId: DocumentId, rule: PermissionRule): Promise<void> {
    await this.federation.updateDocument<GroupDocument>(groupId, (doc) => {
      doc.permissions[rule.action] = rule
    })
  }

  /** Kick a member from the group (requires kick_member permission check). */
  async kickMember(groupId: DocumentId, targetId: PeerIdStr): Promise<void> {
    await this.federation.updateDocument<GroupDocument>(groupId, (doc) => {
      doc.members = doc.members.filter((m) => m !== targetId)
      for (const role of Object.values(doc.roles)) {
        role.members = role.members.filter((m) => m !== targetId)
      }
    })
  }

  async #getSenderPrivateKey(): Promise<Uint8Array> {
    return this.identity.getPrivateKey()
  }

  #requireKey(groupId: DocumentId): Uint8Array {
    const key = this.groupKeys.get(groupId)
    if (!key) throw new Error(`No group key for ${groupId}`)
    return key
  }
}
