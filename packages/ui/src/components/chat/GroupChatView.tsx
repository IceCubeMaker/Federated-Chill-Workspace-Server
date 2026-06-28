import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { ChatManager } from '@federation/chat'
import type { DocumentId, PeerIdStr, UserProfile, Channel, ChatMessage, GroupDocument } from '@federation/models'
import { color, space, fontSize, fontWeight, radius } from '../../tokens/index.js'
import { ChannelSidebar } from './ChannelSidebar.js'
import { MessageList } from './MessageList.js'
import { MessageInput } from './MessageInput.js'
import { Button } from '../Button.js'
import { Input } from '../Input.js'
import { Modal } from '../Modal.js'

export interface GroupChatViewProps {
  groupId: DocumentId
  doc: GroupDocument
  chat: ChatManager
  currentUserId: PeerIdStr
  /** Map of all known user profiles for @mention resolution and display names. */
  members: Map<PeerIdStr, UserProfile>
  /** Whether the current user can create new channels. */
  canCreateChannel?: boolean
  /** Whether the current user can send messages. */
  canSendMessage?: boolean
}

export function GroupChatView({
  groupId,
  doc,
  chat,
  currentUserId,
  members,
  canCreateChannel = false,
  canSendMessage = true,
}: GroupChatViewProps) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [creating, setCreating] = useState(false)
  const activeIdRef = useRef(activeChannelId)
  activeIdRef.current = activeChannelId

  // Load channels whenever the group doc changes
  const channelCount = Object.keys(doc.channels ?? {}).length
  useEffect(() => {
    const chs = chat.getChannels(groupId)
    setChannels(chs)
    if (chs.length > 0 && !activeChannelId) {
      const defaultCh = chs.find((c) => c.isDefault) ?? chs[0]
      setActiveChannelId(defaultCh.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat, groupId, channelCount])

  // Load messages when active channel changes
  const loadMessages = useCallback(async () => {
    if (!activeChannelId) { setMessages([]); return }
    const msgs = await chat.getMessages(groupId, activeChannelId)
    setMessages(msgs)
  }, [chat, groupId, activeChannelId])

  useEffect(() => { void loadMessages() }, [loadMessages])

  // Refresh unread counts on mount and after switching channels
  useEffect(() => {
    const chs = chat.getChannels(groupId)
    const counts: Record<string, number> = {}
    for (const ch of chs) counts[ch.id] = chat.getUnreadCount(groupId, ch.id)
    setUnreadCounts(counts)
  }, [chat, groupId, messages])

  // Subscribe to incoming messages
  useEffect(() => {
    chat.subscribeGroup(groupId)
    const unsub = chat.onMessage((gid, channelId, msg) => {
      if (gid !== groupId) return
      if (channelId === activeIdRef.current) {
        setMessages((prev) => {
          // Avoid duplicates (local send already added via state refresh)
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      }
      // Update unread for non-active channels
      if (channelId !== activeIdRef.current) {
        setUnreadCounts((prev) => ({
          ...prev,
          [channelId]: (prev[channelId] ?? 0) + 1,
        }))
      }
    })
    return () => {
      unsub()
      chat.unsubscribeGroup(groupId)
    }
  }, [chat, groupId])

  const handleSelectChannel = useCallback((channelId: string) => {
    setActiveChannelId(channelId)
    // Mark as read and clear badge
    const msgs = messages
    const last = msgs[msgs.length - 1]
    if (last) chat.markChannelRead(groupId, channelId, last.id)
    setUnreadCounts((prev) => ({ ...prev, [channelId]: 0 }))
  }, [chat, groupId, messages])

  const handleSend = useCallback(async (content: string, mentions: PeerIdStr[]) => {
    if (!activeChannelId) return
    const msg = await chat.sendMessage(groupId, activeChannelId, content, mentions)
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    chat.markChannelRead(groupId, activeChannelId, msg.id)
    setUnreadCounts((prev) => ({ ...prev, [activeChannelId]: 0 }))
  }, [chat, groupId, activeChannelId])

  const handleCreateChannel = async () => {
    const name = newChannelName.trim()
    if (!name) return
    setCreating(true)
    try {
      const ch = await chat.createChannel(groupId, name)
      setChannels(chat.getChannels(groupId))
      setActiveChannelId(ch.id)
      setCreateOpen(false)
      setNewChannelName('')
    } finally {
      setCreating(false)
    }
  }

  const activeChannel = channels.find((c) => c.id === activeChannelId)

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Channel sidebar */}
      <ChannelSidebar
        channels={channels}
        activeChannelId={activeChannelId}
        unreadCounts={unreadCounts}
        onSelectChannel={handleSelectChannel}
        onCreateChannel={() => setCreateOpen(true)}
        canCreateChannel={canCreateChannel}
      />

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Channel header */}
        {activeChannel && (
          <div style={{
            padding: `${space[2]} ${space[4]}`,
            borderBottom: `1px solid ${color.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
            background: color.surface1,
            flexShrink: 0,
          }}>
            <span style={{ color: color.textMuted, fontSize: fontSize.md }}>#</span>
            <span style={{ fontWeight: fontWeight.semibold, color: color.textPrimary, fontSize: fontSize.sm }}>
              {activeChannel.name}
            </span>
            {activeChannel.description && (
              <>
                <span style={{ color: color.border }}>|</span>
                <span style={{ fontSize: fontSize.sm, color: color.textSecondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeChannel.description}
                </span>
              </>
            )}
          </div>
        )}

        {/* No channel selected */}
        {!activeChannelId && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.textMuted, fontSize: fontSize.sm }}>
            Select a channel to start chatting
          </div>
        )}

        {/* Messages */}
        {activeChannelId && (
          <>
            <MessageList
              messages={messages}
              currentUserId={currentUserId}
              members={members}
            />
            <MessageInput
              onSend={handleSend}
              members={members}
              disabled={!canSendMessage}
              disabledReason="You don't have permission to send messages here"
              placeholder={activeChannel ? `Message #${activeChannel.name}` : undefined}
            />
          </>
        )}
      </div>

      {/* Create channel modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create a channel">
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
          <Input
            label="Channel name"
            value={newChannelName}
            onChange={(e) => setNewChannelName(e.target.value)}
            placeholder="e.g. announcements"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateChannel() }}
          />
          <div style={{ display: 'flex', gap: space[3], justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreateChannel()} loading={creating} disabled={!newChannelName.trim()}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
