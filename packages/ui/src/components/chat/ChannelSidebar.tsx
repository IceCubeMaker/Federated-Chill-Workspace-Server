import React from 'react'
import type { Channel } from '@federation/models'
import { color, space, fontSize, fontWeight, radius } from '../../tokens/index.js'
import { Badge } from '../Badge.js'

export interface ChannelSidebarProps {
  channels: Channel[]
  activeChannelId: string | null
  unreadCounts: Record<string, number>
  onSelectChannel: (channelId: string) => void
  onCreateChannel?: () => void
  canCreateChannel?: boolean
}

export function ChannelSidebar({
  channels,
  activeChannelId,
  unreadCounts,
  onSelectChannel,
  onCreateChannel,
  canCreateChannel = false,
}: ChannelSidebarProps) {
  return (
    <div style={{
      width: 200,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: color.surface1,
      borderRight: `1px solid ${color.border}`,
      overflowY: 'auto',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${space[3]} ${space[3]} ${space[2]}`,
      }}>
        <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: color.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Channels
        </span>
        {canCreateChannel && onCreateChannel && (
          <button
            onClick={onCreateChannel}
            title="Create channel"
            style={{
              background: 'none',
              border: 'none',
              color: color.textMuted,
              cursor: 'pointer',
              fontSize: fontSize.md,
              lineHeight: 1,
              padding: `0 ${space[1]}`,
              borderRadius: radius.sm,
            }}
          >
            +
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: space[3] }}>
        {channels.map((ch) => {
          const isActive = ch.id === activeChannelId
          const unread = unreadCounts[ch.id] ?? 0

          return (
            <button
              key={ch.id}
              onClick={() => onSelectChannel(ch.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: space[2],
                padding: `${space[1]} ${space[3]}`,
                background: isActive ? color.surface3 : 'transparent',
                border: 'none',
                borderRadius: 0,
                cursor: 'pointer',
                textAlign: 'left',
                color: isActive ? color.textPrimary : unread > 0 ? color.textPrimary : color.textSecondary,
                fontWeight: unread > 0 ? fontWeight.semibold : fontWeight.normal,
                fontSize: fontSize.sm,
                transition: 'background 100ms ease',
                width: '100%',
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = color.surface2
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              }}
            >
              <span style={{ color: color.textMuted, flexShrink: 0 }}>#</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ch.name}
              </span>
              {unread > 0 && (
                <Badge variant="brand">
                  {unread > 99 ? '99+' : unread}
                </Badge>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
