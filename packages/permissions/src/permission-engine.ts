import type { Action, DocumentId, GroupDocument, Holder, PeerIdStr, PermissionRule } from '@federation/models'
import type { LocalIdentity } from '@federation/auth'
import type { GroupManager } from '@federation/groups'

export class PermissionEngine {
  constructor(
    private readonly groupManager: GroupManager,
    private readonly identity: LocalIdentity,
  ) {}

  async canPerform(
    userId: PeerIdStr,
    groupId: DocumentId,
    action: Action,
    _context?: unknown,
  ): Promise<boolean> {
    const doc = this.groupManager.getGroupDocument(groupId)
    if (!doc) return false

    // Administrator bypass
    if (this.#isAdministrator(userId, doc)) return true

    const rule = doc.permissions[action]
    // No rule defined: only admins can perform unknown actions
    if (!rule) return false

    return this.#evaluateHolders(userId, doc, rule.holders)
  }

  async canChangePermission(
    userId: PeerIdStr,
    groupId: DocumentId,
    action: Action,
  ): Promise<boolean> {
    const doc = this.groupManager.getGroupDocument(groupId)
    if (!doc) return false

    if (this.#isAdministrator(userId, doc)) return true

    const rule = doc.permissions[action]
    if (!rule) return false

    // Empty changeRule → only administrators (already checked above)
    if (rule.changeRule.length === 0) return false

    return this.#evaluateHolders(userId, doc, rule.changeRule)
  }

  async updatePermission(
    groupId: DocumentId,
    action: Action,
    newHolders: Holder[],
    newChangeRule: Holder[],
  ): Promise<void> {
    const userId = this.identity.getPeerId()
    const allowed = await this.canChangePermission(userId, groupId, action)
    if (!allowed) throw new Error(`Permission denied: cannot change rule for action '${action}'`)

    const doc = this.groupManager.getGroupDocument(groupId)
    const existing = doc.permissions[action]

    await this.groupManager.updatePermission(groupId, {
      action,
      holders: newHolders,
      changeRule: newChangeRule,
      description: existing?.description,
    })
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  #isAdministrator(userId: PeerIdStr, doc: GroupDocument): boolean {
    return Object.values(doc.roles).some(
      (r) => r.isAdministrator && r.members.includes(userId),
    )
  }

  #evaluateHolders(userId: PeerIdStr, doc: GroupDocument, holders: Holder[]): boolean {
    for (const holder of holders) {
      switch (holder.type) {
        case 'user':
          if (holder.userId === userId) return true
          break
        case 'role': {
          const role = doc.roles[holder.roleId]
          if (role?.members.includes(userId)) return true
          break
        }
        case 'vote':
          // Step 3 will evaluate VotingCondition; for now always false.
          // The condition is stored so the UI can render it.
          break
      }
    }
    return false
  }
}
