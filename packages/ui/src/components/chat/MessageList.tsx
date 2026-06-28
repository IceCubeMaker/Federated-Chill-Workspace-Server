import React, { useEffect, useRef } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { ChatMessage, PeerIdStr, UserProfile } from '@federation/models'
import { color, space, fontSize, fontWeight, radius } from '../../tokens/index.js'
import { Avatar } from '../Avatar.js'

const ALLOWED_TAGS = ['p', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'br', 'span']
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class']

// Highlight @mentions in already-rendered HTML
function highlightMentions(html: string, mentions: PeerIdStr[], members: Map<PeerIdStr, UserProfile>): string {
  let out = html
  for (const peerId of mentions) {
    const profile = members.get(peerId)
    if (!profile) continue
    const safe = profile.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(
      new RegExp(`@${safe}`, 'g'),
      `<span class="mention">@${profile.displayName}</span>`,
    )
  }
  return out
}

function renderMarkdown(content: string, mentions: PeerIdStr[], members: Map<PeerIdStr, UserProfile>): string {
  const raw = marked.parse(content, { async: false }) as string
  let sanitized = DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR })
  if (mentions.length > 0) sanitized = highlightMentions(sanitized, mentions, members)
  return sanitized
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

function sameDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

export interface MessageListProps {
  messages: ChatMessage[]
  currentUserId: PeerIdStr
  members: Map<PeerIdStr, UserProfile>
  onLoadMore?: () => void
  hasMore?: boolean
}

export function MessageList({ messages, currentUserId, members, onLoadMore, hasMore }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const wasAtBottomRef = useRef(true)

  // Track scroll position before render
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  })

  // Auto-scroll to bottom when new messages arrive (only if already at bottom)
  useEffect(() => {
    if (wasAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: color.textMuted,
        fontSize: fontSize.sm,
      }}>
        No messages yet. Say hello!
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: `${space[3]} 0`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Load more */}
      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: space[2] }}>
          <button
            onClick={onLoadMore}
            style={{
              background: color.surface2,
              border: `1px solid ${color.border}`,
              borderRadius: radius.md,
              color: color.textSecondary,
              cursor: 'pointer',
              fontSize: fontSize.xs,
              padding: `${space[1]} ${space[3]}`,
            }}
          >
            Load earlier messages
          </button>
        </div>
      )}

      {messages.map((msg, i) => {
        const prev = messages[i - 1]
        const isOwn = msg.authorId === currentUserId
        const author = members.get(msg.authorId)
        const displayName = author?.displayName ?? msg.authorId.slice(0, 10) + '…'
        const showDateDivider = !prev || !sameDay(prev.timestamp, msg.timestamp)
        const showHeader = !prev || prev.authorId !== msg.authorId || showDateDivider || msg.timestamp - prev.timestamp > 5 * 60_000

        return (
          <React.Fragment key={msg.id}>
            {showDateDivider && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: space[3],
                padding: `${space[2]} ${space[4]}`,
                color: color.textMuted,
                fontSize: fontSize.xs,
              }}>
                <div style={{ flex: 1, height: 1, background: color.border }} />
                <span>{formatDate(msg.timestamp)}</span>
                <div style={{ flex: 1, height: 1, background: color.border }} />
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: space[3],
                padding: showHeader ? `${space[2]} ${space[4]} 2px` : `2px ${space[4]} 2px`,
                background: msg.mentions.includes(currentUserId) ? 'rgba(99,102,241,0.08)' : 'transparent',
              }}
            >
              {/* Avatar column */}
              <div style={{ width: 36, flexShrink: 0, paddingTop: showHeader ? 2 : 0 }}>
                {showHeader ? (
                  <Avatar name={displayName} size={36} />
                ) : (
                  <span style={{ fontSize: 10, color: color.textMuted, display: 'block', textAlign: 'center', marginTop: 4 }}>
                    {formatTime(msg.timestamp)}
                  </span>
                )}
              </div>

              {/* Message body */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {showHeader && (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: 2 }}>
                    <span style={{
                      fontSize: fontSize.sm,
                      fontWeight: fontWeight.semibold,
                      color: isOwn ? color.brandPrimary : color.textPrimary,
                    }}>
                      {displayName}
                    </span>
                    <span style={{ fontSize: fontSize.xs, color: color.textMuted }}>
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                )}

                <div
                  className="md-content"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(msg.content, msg.mentions, members),
                  }}
                  style={{ color: color.textPrimary, fontSize: fontSize.sm, lineHeight: 1.5 }}
                />
              </div>
            </div>
          </React.Fragment>
        )
      })}

      <div ref={bottomRef} />

      {/* Inline Markdown + mention styles */}
      <style>{`
        .md-content p { margin: 0 0 2px; }
        .md-content p:last-child { margin-bottom: 0; }
        .md-content code { background: ${color.surface3}; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
        .md-content pre { background: ${color.surface3}; padding: ${space[2]}; border-radius: ${radius.md}; overflow-x: auto; }
        .md-content pre code { background: none; padding: 0; }
        .md-content blockquote { border-left: 3px solid ${color.brandPrimary}; padding-left: ${space[2]}; margin: 0; color: ${color.textSecondary}; }
        .md-content a { color: ${color.brandPrimary}; }
        .md-content ul, .md-content ol { padding-left: ${space[5]}; margin: 0; }
        .mention { background: rgba(99,102,241,0.2); color: ${color.brandPrimary}; border-radius: 3px; padding: 0 2px; }
      `}</style>
    </div>
  )
}
