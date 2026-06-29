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
  collapsed?: boolean
  onToggle?: () => void
}

export function ChannelSidebar({
  channels,
  activeChannelId,
  unreadCounts,
  onSelectChannel,
  onCreateChannel,
  canCreateChannel = false,
  collapsed = false,
  onToggle,
}: ChannelSidebarProps) {
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)
  const activeChannel = channels.find((c) => c.id === activeChannelId)

  if (collapsed) {
    return (
      <div style={{
        width: 44,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: color.surface1,
        borderRight: `1px solid ${color.border}`,
        paddingTop: space[1],
        gap: space[1],
      }}>
        <button
          onClick={onToggle}
          title="Show channels"
          style={{
            background: 'none',
            border: 'none',
            color: color.textSecondary,
            cursor: 'pointer',
            fontSize: '20px',
            lineHeight: 1,
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.sm,
            position: 'relative',
            outline: 'none',
          }}
        >
          ≡
          {totalUnread > 0 && (
            <span style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: color.brandPrimary,
              display: 'block',
            }} />
          )}
        </button>
        {activeChannel && (
          <span style={{
            fontSize: 9,
            color: color.textMuted,
            writingMode: 'vertical-rl',
            overflow: 'hidden',
            maxHeight: 100,
            whiteSpace: 'nowrap',
            padding: `${space[1]} 0`,
          }}>
            #{activeChannel.name}
          </span>
        )}
      </div>
    )
  }

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
        flexShrink: 0,
      }}>
        <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: color.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Channels
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
          {onToggle && (
            <button
              onClick={onToggle}
              title="Collapse"
              style={{
                background: 'none',
                border: 'none',
                color: color.textMuted,
                cursor: 'pointer',
                fontSize: fontSize.base,
                lineHeight: 1,
                padding: `0 ${space[1]}`,
                borderRadius: radius.sm,
                outline: 'none',
              }}
            >
              ‹
            </button>
          )}
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
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.sm,
                outline: 'none',
              }}
            >
              +
            </button>
          )}
        </div>
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
                padding: `${space[2]} ${space[3]}`,
                minHeight: 40,
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
                outline: 'none',
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
