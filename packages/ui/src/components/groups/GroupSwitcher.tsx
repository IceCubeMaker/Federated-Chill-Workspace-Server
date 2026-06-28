import React from 'react'
import type { DocumentId, GroupDocument } from '@federation/models'
import { color, space, radius, fontSize, fontWeight } from '../../tokens/index.js'
import { Avatar } from '../Avatar.js'
import { Tooltip } from '../Tooltip.js'
import { useGroupContext } from './GroupContext.js'

export interface GroupSwitcherProps {
  groups: Array<{ id: DocumentId; doc: GroupDocument }>
  onCreateGroup?: () => void
  onSwitchGroup?: (id: DocumentId) => void
  currentUser?: { name: string; isConnected: boolean }
  onProfileClick?: () => void
}

export function GroupSwitcher({ groups, onCreateGroup, onSwitchGroup, currentUser, onProfileClick }: GroupSwitcherProps) {
  const { activeGroupId, setActiveGroupId } = useGroupContext()

  return (
    <nav
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: color.surface0,
        borderRight: `1px solid ${color.border}`,
        width: 64,
        height: '100%',
        flexShrink: 0,
      }}
    >
      {/* Scrollable group list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: space[2],
        padding: `${space[3]} ${space[2]}`,
        width: '100%',
      }}>
        {groups.map(({ id, doc }) => {
          const isActive = activeGroupId === id
          return (
            <Tooltip key={id} content={doc.metadata.name} placement="bottom">
              <button
                onClick={() => { setActiveGroupId(id); onSwitchGroup?.(id) }}
                style={{
                  background: isActive ? color.brandPrimary : color.surface2,
                  border: `2px solid ${isActive ? color.brandPrimary : 'transparent'}`,
                  borderRadius: isActive ? radius.md : radius.full,
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'all 200ms ease',
                  outline: 'none',
                }}
              >
                <Avatar
                  name={doc.metadata.name}
                  src={doc.metadata.avatarUrl}
                  size={40}
                />
              </button>
            </Tooltip>
          )
        })}

        {groups.length > 0 && (
          <div style={{ width: 32, height: 1, background: color.border, margin: `${space[1]} 0` }} />
        )}

        <Tooltip content="Create group" placement="bottom">
          <button
            onClick={onCreateGroup}
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.full,
              background: color.surface2,
              border: `2px dashed ${color.border}`,
              color: color.textMuted,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: fontSize.xl,
              transition: 'all 150ms ease',
              outline: 'none',
            }}
          >
            +
          </button>
        </Tooltip>
      </div>

      {/* Pinned profile button */}
      {currentUser && (
        <div style={{
          padding: `${space[2]} 0 ${space[3]}`,
          display: 'flex',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Tooltip content={currentUser.isConnected ? 'Connected · Profile' : 'Offline · Profile'} placement="bottom">
            <button
              onClick={onProfileClick}
              style={{
                position: 'relative',
                padding: 0,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                borderRadius: radius.full,
                outline: 'none',
              }}
            >
              <Avatar name={currentUser.name} size={32} />
              <span style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: currentUser.isConnected ? color.success : color.textMuted,
                border: `2px solid ${color.surface0}`,
                display: 'block',
              }} />
            </button>
          </Tooltip>
        </div>
      )}
    </nav>
  )
}
