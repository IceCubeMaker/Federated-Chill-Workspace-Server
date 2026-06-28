import type { DocumentId } from '@federation/models'
import { WorkspaceFederation } from '@federation/sync'
import type { FederationConfig } from '@federation/sync'
import { LocalIdentity } from '@federation/auth'
import { GroupManager } from '@federation/groups'
import { PermissionEngine } from '@federation/permissions'
import { ChatManager } from '@federation/chat'

export type { FederationConfig } from '@federation/sync'
export type { DocumentId } from '@federation/models'
export { LocalIdentity } from '@federation/auth'
export { GroupManager } from '@federation/groups'
export { PermissionEngine } from '@federation/permissions'
export { ChatManager } from '@federation/chat'

export interface AppConfig extends FederationConfig {
  identity: LocalIdentity
}

/**
 * FederatedWorkspace extends WorkspaceFederation with identity, group
 * management, and the permission engine. This lives in @federation/app to
 * avoid the circular dependency that would arise from importing GroupManager
 * inside @federation/sync.
 */
export class FederatedWorkspace extends WorkspaceFederation {
  readonly groups: GroupManager
  readonly permissions: PermissionEngine
  readonly identity: LocalIdentity
  readonly chat: ChatManager

  private activeGroupId: DocumentId | null = null

  constructor(identity: LocalIdentity) {
    super()
    this.identity = identity
    this.groups = new GroupManager(this, identity)
    this.permissions = new PermissionEngine(this.groups, identity)
    this.chat = new ChatManager(this, this.groups, this.permissions, identity)
  }

  /** Initialize network + store, then wire up identity. */
  override async initialize(config: AppConfig | FederationConfig): Promise<void> {
    await super.initialize(config)
  }

  /** Set the active group context for subsequent operations. */
  switchGroup(groupId: DocumentId | null): void {
    this.activeGroupId = groupId
  }

  getActiveGroupId(): DocumentId | null {
    return this.activeGroupId
  }

  /**
   * Permission-gated document creation. Checks create_doc against the active
   * group before delegating to the base class.
   */
  override async createDocument<T>(initialData: T, groupId?: DocumentId): Promise<DocumentId> {
    const gid = groupId ?? this.activeGroupId
    if (gid) {
      const userId = this.identity.getPeerId()
      const allowed = await this.permissions.canPerform(userId, gid, 'create_doc')
      if (!allowed) throw new Error(`Permission denied: create_doc in group ${gid}`)
    }
    return super.createDocument(initialData)
  }

  /**
   * Permission-gated document update. Checks edit_doc against the active group.
   */
  override async updateDocument<T>(docId: DocumentId, updater: (doc: T) => void, groupId?: DocumentId): Promise<void> {
    const gid = groupId ?? this.activeGroupId
    if (gid) {
      const userId = this.identity.getPeerId()
      const allowed = await this.permissions.canPerform(userId, gid, 'edit_doc')
      if (!allowed) throw new Error(`Permission denied: edit_doc in group ${gid}`)
    }
    return super.updateDocument(docId, updater)
  }
}
