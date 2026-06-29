import { v4 as uuidv4 } from 'uuid'
import type { GroupManager } from '@federation/groups'
import type { PermissionEngine } from '@federation/permissions'
import type { LocalIdentity } from '@federation/auth'
import type {
  DocumentId,
  PeerIdStr,
  Channel,
  ChannelId,
  ChatMessage,
  ChannelMessages,
  GroupDocument,
} from '@federation/models'

// Minimal localStorage shape (avoids DOM lib dependency)
interface LocalStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

// Structural interface that FederatedWorkspace satisfies without a direct import
// (avoids the circular @federation/chat ↔ @federation/app dependency).
interface GroupAwareFederation {
  createDocument<T>(initialData: T, groupId?: DocumentId): Promise<DocumentId>
  getDocument<T>(docId: DocumentId): T
  updateDocument<T>(docId: DocumentId, updater: (doc: T) => void, groupId?: DocumentId): Promise<void>
  getPubSub(): {
    publish(topic: string, data: Uint8Array): Promise<void>
    subscribe(topic: string, handler: (msg: Uint8Array) => void): void
    unsubscribe(topic: string): void
  }
}

type MessageListener = (groupId: DocumentId, channelId: ChannelId, msg: ChatMessage) => void

export class ChatManager {
  private readonly listeners = new Set<MessageListener>()
  private readonly subscriptions = new Map<string, () => void>()
  // In-memory fallback for environments without localStorage (Node.js/tests)
  private readonly readStateCache = new Map<string, string>()

  constructor(
    private readonly federation: GroupAwareFederation,
    private readonly groupManager: GroupManager,
    private readonly permissions: PermissionEngine,
    private readonly identity: LocalIdentity,
  ) {}

  /** Subscribe to new message events across all subscribed channels. Returns unsubscribe fn. */
  onMessage(listener: MessageListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async createChannel(groupId: DocumentId, name: string, description?: string): Promise<Channel> {
    const userId = this.identity.getPeerId()
    const allowed = await this.permissions.canPerform(userId, groupId, 'create_channel')
    if (!allowed) throw new Error('Permission denied: create_channel')

    const channelId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') as ChannelId
    const doc = this.federation.getDocument<GroupDocument>(groupId)
    const position = Object.keys(doc?.channels ?? {}).length

    const channel: Channel = {
      id: channelId,
      name,
      description,
      position,
      createdAt: Date.now(),
      createdBy: userId,
      isDefault: false,
    }

    const messagesDocId = await this.federation.createDocument<ChannelMessages>(
      { messages: [], lastMessageTimestamp: 0 },
      groupId,
    )

    await this.federation.updateDocument<GroupDocument>(groupId, (d) => {
      if (!d.channels) d.channels = {} as Record<ChannelId, Channel>
      if (!d.channelMessageDocIds) d.channelMessageDocIds = {} as Record<ChannelId, DocumentId>
      d.channels[channelId] = channel
      d.channelMessageDocIds[channelId] = messagesDocId
    }, groupId)

    this.#subscribeChannel(groupId, channelId)
    return channel
  }

  async deleteChannel(groupId: DocumentId, channelId: ChannelId): Promise<void> {
    const userId = this.identity.getPeerId()
    const allowed = await this.permissions.canPerform(userId, groupId, 'delete_channel')
    if (!allowed) throw new Error('Permission denied: delete_channel')

    const doc = this.federation.getDocument<GroupDocument>(groupId)
    const channel = doc.channels?.[channelId]
    if (!channel) throw new Error(`Channel ${channelId} not found`)
    if (channel.isDefault) throw new Error('Cannot delete the default channel')

    const topic = `chat:${groupId}:${channelId}`
    this.subscriptions.get(topic)?.()
    this.subscriptions.delete(topic)

    await this.federation.updateDocument<GroupDocument>(groupId, (d) => {
      delete d.channels?.[channelId]
      delete d.channelMessageDocIds?.[channelId]
    }, groupId)
  }

  async renameChannel(groupId: DocumentId, channelId: ChannelId, newName: string): Promise<void> {
    const userId = this.identity.getPeerId()
    const allowed = await this.permissions.canPerform(userId, groupId, 'edit_channel')
    if (!allowed) throw new Error('Permission denied: edit_channel')

    await this.federation.updateDocument<GroupDocument>(groupId, (d) => {
      if (d.channels?.[channelId]) d.channels[channelId].name = newName
    }, groupId)
  }

  async sendMessage(
    groupId: DocumentId,
    channelId: ChannelId,
    content: string,
    mentions: PeerIdStr[] = [],
    replyTo?: string,
  ): Promise<ChatMessage> {
    const userId = this.identity.getPeerId()
    const allowed = await this.permissions.canPerform(userId, groupId, 'send_message')
    if (!allowed) throw new Error('Permission denied: send_message')

    const msg: ChatMessage = {
      id: uuidv4(),
      authorId: userId,
      content,
      timestamp: Date.now(),
      mentions,
      ...(replyTo ? { replyTo } : {}),
    }

    const messagesDocId = await this.#ensureMessagesDoc(groupId, channelId)

    await this.federation.updateDocument<ChannelMessages>(messagesDocId, (d) => {
      d.messages.push(msg)
      d.lastMessageTimestamp = msg.timestamp
    }, groupId)

    const pubsub = this.federation.getPubSub()
    const topic = `chat:${groupId}:${channelId}`
    await pubsub.publish(topic, new TextEncoder().encode(JSON.stringify({ type: 'new_message', messageId: msg.id })))

    this.listeners.forEach((l) => l(groupId, channelId, msg))
    return msg
  }

  async getMessages(
    groupId: DocumentId,
    channelId: ChannelId,
    limit?: number,
    before?: string,
  ): Promise<ChatMessage[]> {
    const doc = this.federation.getDocument<GroupDocument>(groupId)
    const messagesDocId = doc.channelMessageDocIds?.[channelId]
    if (!messagesDocId) return []

    let messages: ChatMessage[]
    try {
      const md = this.federation.getDocument<ChannelMessages>(messagesDocId)
      messages = [...(md.messages ?? [])]
    } catch {
      return []
    }

    if (before) {
      const idx = messages.findIndex((m) => m.id === before)
      if (idx > 0) messages = messages.slice(0, idx)
    }

    if (limit && limit > 0) messages = messages.slice(-limit)
    return messages
  }

  getChannels(groupId: DocumentId): Channel[] {
    try {
      const doc = this.federation.getDocument<GroupDocument>(groupId)
      if (!doc.channels) return []
      return Object.values(doc.channels).sort((a, b) => a.position - b.position)
    } catch {
      return []
    }
  }

  markChannelRead(groupId: DocumentId, channelId: ChannelId, messageId: string): void {
    const key = `chat:read:${groupId}:${channelId}`
    this.readStateCache.set(key, messageId)
    try {
      const ls = (globalThis as Record<string, unknown>)['localStorage'] as LocalStorage | undefined
      ls?.setItem(key, JSON.stringify({ messageId, readAt: Date.now() }))
    } catch { /* ignore */ }
  }

  getLastRead(groupId: DocumentId, channelId: ChannelId): string | null {
    const key = `chat:read:${groupId}:${channelId}`
    const cached = this.readStateCache.get(key)
    if (cached) return cached
    try {
      const ls = (globalThis as Record<string, unknown>)['localStorage'] as LocalStorage | undefined
      const raw = ls?.getItem(key)
      if (!raw) return null
      return (JSON.parse(raw) as { messageId: string }).messageId
    } catch { return null }
  }

  getUnreadCount(groupId: DocumentId, channelId: ChannelId): number {
    try {
      const doc = this.federation.getDocument<GroupDocument>(groupId)
      const messagesDocId = doc.channelMessageDocIds?.[channelId]
      if (!messagesDocId) return 0
      const md = this.federation.getDocument<ChannelMessages>(messagesDocId)
      const messages = md.messages ?? []
      const lastRead = this.getLastRead(groupId, channelId)
      if (!lastRead) return messages.length
      const idx = messages.findIndex((m) => m.id === lastRead)
      return idx === -1 ? messages.length : messages.length - idx - 1
    } catch { return 0 }
  }

  /** Subscribe to pubsub for all channels in a group. Call after switching groups. */
  subscribeGroup(groupId: DocumentId): void {
    const channels = this.getChannels(groupId)
    for (const ch of channels) this.#subscribeChannel(groupId, ch.id)
  }

  /** Unsubscribe from all channels in a group. Call before switching groups. */
  unsubscribeGroup(groupId: DocumentId): void {
    const prefix = `chat:${groupId}:`
    for (const [topic, unsub] of this.subscriptions) {
      if (topic.startsWith(prefix)) {
        unsub()
        this.subscriptions.delete(topic)
      }
    }
  }

  #subscribeChannel(groupId: DocumentId, channelId: ChannelId): void {
    const topic = `chat:${groupId}:${channelId}`
    if (this.subscriptions.has(topic)) return

    const pubsub = this.federation.getPubSub()
    const handler = () => {
      try {
        const doc = this.federation.getDocument<GroupDocument>(groupId)
        const messagesDocId = doc.channelMessageDocIds?.[channelId]
        if (!messagesDocId) return
        const md = this.federation.getDocument<ChannelMessages>(messagesDocId)
        const messages = md.messages ?? []
        const lastMsg = messages[messages.length - 1]
        if (lastMsg) this.listeners.forEach((l) => l(groupId, channelId, lastMsg))
      } catch { /* ignore stale subscriptions */ }
    }

    pubsub.subscribe(topic, handler)
    this.subscriptions.set(topic, () => pubsub.unsubscribe(topic))
  }

  async #ensureMessagesDoc(groupId: DocumentId, channelId: ChannelId): Promise<DocumentId> {
    const doc = this.federation.getDocument<GroupDocument>(groupId)
    const existing = doc.channelMessageDocIds?.[channelId]
    if (existing) return existing

    const newDocId = await this.federation.createDocument<ChannelMessages>(
      { messages: [], lastMessageTimestamp: 0 },
      groupId,
    )
    await this.federation.updateDocument<GroupDocument>(groupId, (d) => {
      if (!d.channelMessageDocIds) d.channelMessageDocIds = {} as Record<ChannelId, DocumentId>
      d.channelMessageDocIds[channelId] = newDocId
    }, groupId)
    return newDocId
  }
}
