import { v4 as uuidv4 } from 'uuid'
import type { DocumentId, GroupDocument, GroupMetadata, PeerIdStr, Action, PermissionRule, Role, RoleId, RootDocument, IdentityDocument } from '@federation/models'
import type { LocalIdentity } from '@federation/auth'
import type { WorkspaceFederation } from '@federation/sync'
import { GroupCrypto } from './group-crypto.js'
import { getDefaultPermissions, ADMIN_ROLE_ID, MEMBER_ROLE_ID } from './default-permissions.js'

const DM_TOPIC_PREFIX = 'sync:dm:'
// Legacy localStorage key — used only for migrating existing installs
const LS_GROUP_REGISTRY_KEY = 'fed:group-registry'

// Minimal localStorage shape (avoids DOM lib dependency)
interface LS { getItem(k: string): string | null; setItem(k: string, v: string): void }
const _ls = (): LS | null => {
  const g = globalThis as Record<string, unknown>
  return typeof g['localStorage'] !== 'undefined' ? (g['localStorage'] as LS) : null
}

export class GroupManager {
  /** groupId → symmetric group key */
  private readonly groupKeys = new Map<DocumentId, Uint8Array>()
  private rootDocId: DocumentId | null = null

  constructor(
    private readonly federation: WorkspaceFederation,
    private readonly identity: LocalIdentity,
  ) {}

  /**
   * Initialise the personal root document and restore all groups.
   * If a root doc already exists (ID stored in identity), load it from
   * IndexedDB and sync from P2P. If not, create one — migrating any legacy
   * localStorage data in the process.
   */
  async restoreGroups(): Promise<void> {
    const rootDocKey = await this.identity.deriveRootDocKey()
    const existingId = this.identity.getRootDocId() as DocumentId | null
    const repo = this.federation.getRepo()

    if (existingId) {
      this.rootDocId = existingId
      repo.importKey(existingId, rootDocKey)
      const handle = repo.getHandle<RootDocument>(existingId)
      let rootDoc: RootDocument | undefined
      try {
        rootDoc = (await handle.doc()) ?? undefined
      } catch { /* not available yet; peers will sync it */ }

      if (rootDoc) {
        // Migrate any localStorage entries not yet in the root doc
        const lsData = this.#readLsRegistry()
        const toMerge = Object.entries(lsData).filter(([id]) => !rootDoc!.groupIds.includes(id))
        if (toMerge.length > 0) {
          await repo.updateDocument<RootDocument>(existingId, (d) => {
            for (const [id, keyArr] of toMerge) {
              if (!d.groupIds.includes(id)) d.groupIds.push(id)
              if (!d.groupKeys[id]) d.groupKeys[id] = keyArr
            }
          })
          rootDoc = handle.docSync() ?? rootDoc
        }

        // Restore group keys and eagerly load each group doc
        const loadPromises: Promise<unknown>[] = []
        for (const [id, keyArr] of Object.entries(rootDoc.groupKeys)) {
          const groupKey = new Uint8Array(keyArr as number[])
          this.groupKeys.set(id as DocumentId, groupKey)
          repo.importKey(id as DocumentId, groupKey)
          const h = repo.getHandle<GroupDocument>(id as DocumentId)
          loadPromises.push(h.doc().catch(() => {}))
        }
        await Promise.all(loadPromises)
      }
    } else {
      // First run — pull any legacy localStorage data, then create root doc
      const lsData = this.#readLsRegistry()

      const loadPromises: Promise<unknown>[] = []
      for (const [id, keyArr] of Object.entries(lsData)) {
        const groupKey = new Uint8Array(keyArr as number[])
        this.groupKeys.set(id as DocumentId, groupKey)
        repo.importKey(id as DocumentId, groupKey)
        const h = repo.getHandle<GroupDocument>(id as DocumentId)
        loadPromises.push(h.doc().catch(() => {}))
      }
      await Promise.all(loadPromises)

      const initialDoc: RootDocument = { groupIds: Object.keys(lsData), groupKeys: lsData }
      const rootDocId = await this.federation.createDocumentWithKey<RootDocument>(initialDoc, rootDocKey)
      this.rootDocId = rootDocId
      await this.identity.setRootDocId(rootDocId)
    }

    await this.#initIdentityDoc()
  }

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

    const defaultChannel = {
      id: 'general',
      name: 'General',
      description: 'General discussion',
      position: 0,
      createdAt: Date.now(),
      createdBy: creatorId,
      isDefault: true,
    }

    const groupDoc: GroupDocument = {
      id: '' as DocumentId,
      metadata: { name, visibility, isPubliclyViewable },
      createdAt: Date.now(),
      createdBy: creatorId,
      members: [creatorId],
      pendingApplications: {},
      pendingInvites: {},
      roles: { [ADMIN_ROLE_ID]: adminRole, [MEMBER_ROLE_ID]: memberRole },
      permissions,
      defaultRoleId: MEMBER_ROLE_ID,
      channels: { general: defaultChannel },
      channelMessageDocIds: {},
    }

    const docId = await this.federation.createDocument<GroupDocument>(groupDoc)

    await this.federation.updateDocument<GroupDocument>(docId, (doc) => {
      doc.id = docId
    })

    this.groupKeys.set(docId, groupKey)
    this.federation.getRepo().importKey(docId, groupKey)
    await this.#saveGroupEntry(docId, groupKey)

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

    await this.federation.updateDocument<GroupDocument>(groupId, (doc) => {
      doc.pendingInvites[token] = { invitedBy: myId, invitedAt: Date.now(), forUserId: targetUserId }
    })

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
      delete doc.pendingInvites[token]
      if (!doc.members.includes(userId)) {
        doc.members.push(userId)
        const defaultRole = doc.roles[doc.defaultRoleId]
        if (defaultRole && !defaultRole.members.includes(userId)) {
          defaultRole.members.push(userId)
        }
      }
    })

    await this.#saveGroupEntry(groupId, groupKey)
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

  async updateRole(groupId: DocumentId, roleId: RoleId, patch: Partial<Role>): Promise<void> {
    await this.federation.updateDocument<GroupDocument>(groupId, (doc) => {
      const role = doc.roles[roleId]
      if (!role) return
      Object.assign(role, patch)
    })
  }

  async createRole(groupId: DocumentId, role: Omit<Role, 'id'>): Promise<RoleId> {
    const roleId = uuidv4() as RoleId
    await this.federation.updateDocument<GroupDocument>(groupId, (doc) => {
      doc.roles[roleId] = { ...role, id: roleId }
    })
    return roleId
  }

  async deleteRole(groupId: DocumentId, roleId: RoleId): Promise<void> {
    await this.federation.updateDocument<GroupDocument>(groupId, (doc) => {
      delete doc.roles[roleId]
    })
  }

  async updatePermission(groupId: DocumentId, rule: PermissionRule): Promise<void> {
    await this.federation.updateDocument<GroupDocument>(groupId, (doc) => {
      doc.permissions[rule.action] = rule
    })
  }

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

  /** Persist a group entry to both the root doc (P2P-replicatable) and localStorage (local fallback). */
  async #saveGroupEntry(groupId: DocumentId, groupKey: Uint8Array): Promise<void> {
    const keyArr = Array.from(groupKey)

    if (this.rootDocId) {
      await this.federation.getRepo().updateDocument<RootDocument>(this.rootDocId, (doc) => {
        if (!doc.groupIds.includes(groupId)) doc.groupIds.push(groupId)
        doc.groupKeys[groupId] = keyArr
      })
    }

    const ls = _ls()
    if (ls) {
      try {
        const existing = JSON.parse(ls.getItem(LS_GROUP_REGISTRY_KEY) ?? '{}') as Record<string, number[]>
        existing[groupId] = keyArr
        ls.setItem(LS_GROUP_REGISTRY_KEY, JSON.stringify(existing))
      } catch { /* ignore */ }
    }
  }

  /**
   * Create or load the public identity document.
   * This document is replicated to all connected peers so the encrypted
   * private key survives even if this device is wiped — any peer who synced
   * with us holds a copy.
   */
  async #initIdentityDoc(): Promise<void> {
    const enc = this.identity.getEncryptedFields()
    if (!enc) return // identity not yet protected with a password

    const existingId = this.identity.getIdentityDocId()

    if (!existingId) {
      const identityDoc: IdentityDocument = {
        publicKeyHex: Array.from(this.identity.getPublicKey()).map((b) => b.toString(16).padStart(2, '0')).join(''),
        profile: this.identity.getProfile(),
        encryptedCiphertextHex: enc.ciphertextHex,
        encryptedNonceHex: enc.nonceHex,
        encryptedSaltHex: enc.saltHex,
        rootDocId: this.rootDocId ?? '',
      }
      const docId = await this.federation.createPublicDocument<IdentityDocument>(identityDoc)
      await this.identity.setIdentityDocId(docId)
    } else {
      // Ensure the identity doc is tracked for P2P sync and update rootDocId if needed
      const handle = this.federation.getPublicHandle<IdentityDocument>(existingId as DocumentId)
      handle.doc().catch(() => {})
      if (this.rootDocId) {
        const current = handle.docSync()
        if (current && current.rootDocId !== this.rootDocId) {
          handle.change((d: IdentityDocument) => { d.rootDocId = this.rootDocId! })
        }
      }
    }
  }

  #readLsRegistry(): Record<string, number[]> {
    const ls = _ls()
    if (!ls) return {}
    try {
      return JSON.parse(ls.getItem(LS_GROUP_REGISTRY_KEY) ?? '{}') as Record<string, number[]>
    } catch { return {} }
  }
}
