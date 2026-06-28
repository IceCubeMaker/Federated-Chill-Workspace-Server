import type { Action, PermissionRule, RoleId, PeerIdStr } from '@federation/models'

export const ADMIN_ROLE_ID: RoleId = 'admin'
export const MEMBER_ROLE_ID: RoleId = 'member'

const adminOnly: (action: Action) => PermissionRule = (action) => ({
  action,
  holders: [{ type: 'role', roleId: ADMIN_ROLE_ID }],
  changeRule: [], // empty = administrator role only
})

const memberAndAdmin: (action: Action) => PermissionRule = (action) => ({
  action,
  holders: [
    { type: 'role', roleId: ADMIN_ROLE_ID },
    { type: 'role', roleId: MEMBER_ROLE_ID },
  ],
  changeRule: [],
})

export function getDefaultPermissions(_creatorId: PeerIdStr): Record<Action, PermissionRule> {
  return {
    create_doc:          memberAndAdmin('create_doc'),
    edit_doc:            memberAndAdmin('edit_doc'),
    delete_doc:          adminOnly('delete_doc'),
    view_doc:            memberAndAdmin('view_doc'),
    invite_member:       adminOnly('invite_member'),
    accept_application:  adminOnly('accept_application'),
    kick_member:         adminOnly('kick_member'),
    create_role:         adminOnly('create_role'),
    delete_role:         adminOnly('delete_role'),
    edit_role:           adminOnly('edit_role'),
    change_permission:   adminOnly('change_permission'),
    edit_group_metadata: adminOnly('edit_group_metadata'),
    delete_group:        adminOnly('delete_group'),
  }
}
