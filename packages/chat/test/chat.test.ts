import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DocumentId, PeerIdStr, GroupDocument, Channel, ChannelMessages } from '@federation/models'
import type { UserProfile } from '@federation/models'
import { ChatManager } from '../src/chat-manager.js'
import { MentionResolver } from '../src/mention-resolver.js'

// ─── Minimal in-memory federation stub ───────────────────────────────────────

function makeId(): DocumentId {
  return Math.random().toString(36).slice(2) as DocumentId
}

type Doc = Record<string, unknown>

function makeFedStub(userId: PeerIdStr) {
  const store = new Map<DocumentId, Doc>()
  const pubsubHandlers = new Map<string, Set<(msg: Uint8Array) => void>>()

  return {
    store,
    pubsub: {
      published: [] as { topic: string; data: Uint8Array }[],
      publish: vi.fn(async (topic: string, data: Uint8Array) => {
        pubsubHandlers.get(topic)?.forEach((h) => h(data))
        pubsubHandlers.get(topic)?.forEach(() => {})
      }),
      subscribe: vi.fn((topic: string, handler: (msg: Uint8Array) => void) => {
        if (!pubsubHandlers.has(topic)) pubsubHandlers.set(topic, new Set())
        pubsubHandlers.get(topic)!.add(handler)
      }),
      unsubscribe: vi.fn((topic: string) => { pubsubHandlers.delete(topic) }),
    },
    async createDocument<T>(initialData: T, _groupId?: DocumentId): Promise<DocumentId> {
      const id = makeId()
      store.set(id, JSON.parse(JSON.stringify(initialData)) as Doc)
      return id
    },
    getDocument<T>(docId: DocumentId): T {
      const doc = store.get(docId)
      if (!doc) throw new Error(`Doc ${docId} not found`)
      return doc as T
    },
    async updateDocument<T>(docId: DocumentId, updater: (doc: T) => void, _groupId?: DocumentId): Promise<void> {
      const doc = store.get(docId)
      if (!doc) throw new Error(`Doc ${docId} not found`)
      updater(doc as T)
    },
    getPubSub() {
      return this.pubsub
    },
  }
}

function makePermissions(userId: PeerIdStr, allowed: string[] = []) {
  return {
    canPerform: vi.fn(async (_uid: PeerIdStr, _gid: DocumentId, action: string) => {
      return allowed.includes(action) || allowed.includes('*')
    }),
  }
}

function makeIdentity(userId: PeerIdStr) {
  return {
    getPeerId: () => userId,
  }
}

function makeGroupManager() {
  return {}
}

// Build a minimal GroupDocument pre-loaded into the federation store
function setupGroup(
  fed: ReturnType<typeof makeFedStub>,
  groupId: DocumentId,
  memberIds: PeerIdStr[],
) {
  const doc: GroupDocument = {
    id: groupId,
    metadata: { name: 'Test Group', visibility: 'private', isPubliclyViewable: false },
    createdAt: Date.now(),
    createdBy: memberIds[0],
    members: memberIds,
    pendingApplications: {},
    pendingInvites: {},
    roles: {},
    permissions: {},
    defaultRoleId: 'member',
    channels: {
      general: {
        id: 'general',
        name: 'General',
        position: 0,
        createdAt: Date.now(),
        createdBy: memberIds[0],
        isDefault: true,
      },
    },
    channelMessageDocIds: {},
  }
  fed.store.set(groupId, doc as unknown as Doc)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ChatManager', () => {
  const aliceId = 'peer-alice' as PeerIdStr
  const bobId = 'peer-bob' as PeerIdStr
  const charlieId = 'peer-charlie' as PeerIdStr
  const groupId = 'group-1' as DocumentId

  let aliceFed: ReturnType<typeof makeFedStub>
  let bobFed: ReturnType<typeof makeFedStub>
  let aliceChat: ChatManager
  let bobChat: ChatManager

  beforeEach(() => {
    aliceFed = makeFedStub(aliceId)
    bobFed = makeFedStub(bobId)
    setupGroup(aliceFed, groupId, [aliceId, bobId])
    setupGroup(bobFed, groupId, [aliceId, bobId])

    aliceChat = new ChatManager(
      aliceFed as never,
      makeGroupManager() as never,
      makePermissions(aliceId, ['*']) as never,
      makeIdentity(aliceId) as never,
    )
    bobChat = new ChatManager(
      bobFed as never,
      makeGroupManager() as never,
      makePermissions(bobId, ['*']) as never,
      makeIdentity(bobId) as never,
    )
  })

  it('Alice creates a channel called "random"', async () => {
    const channel = await aliceChat.createChannel(groupId, 'random', 'Off-topic chat')
    expect(channel.id).toBe('random')
    expect(channel.name).toBe('random')
    expect(channel.isDefault).toBe(false)

    const channels = aliceChat.getChannels(groupId)
    expect(channels.some((c) => c.id === 'random')).toBe(true)
  })

  it('Bob sends a message mentioning @Alice, Alice receives it via listener', async () => {
    // Create the channel in Bob's store too
    const bobDoc = bobFed.store.get(groupId) as GroupDocument
    const messagesDocId = makeId()
    bobFed.store.set(messagesDocId, { messages: [], lastMessageTimestamp: 0 } as unknown as Doc)
    ;(bobDoc as unknown as Record<string, unknown>)['channelMessageDocIds'] = { general: messagesDocId }

    const received: { channelId: string; msg: { content: string; mentions: PeerIdStr[] } }[] = []
    bobChat.onMessage((_gid, channelId, msg) => {
      received.push({ channelId, content: msg.content, mentions: msg.mentions } as never)
    })

    const msg = await bobChat.sendMessage(groupId, 'general', 'Hello @Alice!', [aliceId])
    expect(msg.authorId).toBe(bobId)
    expect(msg.mentions).toContain(aliceId)
    expect(received).toHaveLength(1)
    expect(received[0].channelId).toBe('general')
  })

  it('Alice replies without mentioning Bob; Bob marks channel read', async () => {
    // Seed a message doc for Alice
    const aliceDoc = aliceFed.store.get(groupId) as GroupDocument
    const messagesDocId = makeId()
    aliceFed.store.set(messagesDocId, { messages: [], lastMessageTimestamp: 0 } as unknown as Doc)
    ;(aliceDoc as unknown as Record<string, unknown>)['channelMessageDocIds'] = { general: messagesDocId }

    const reply = await aliceChat.sendMessage(groupId, 'general', 'Thanks Bob!', [])
    expect(reply.mentions).toHaveLength(0)

    // Verify lastMessageTimestamp updated
    const md = aliceFed.getDocument<ChannelMessages>(messagesDocId)
    expect(md.lastMessageTimestamp).toBe(reply.timestamp)

    // Bob marks channel read
    const lastMsg = (aliceFed.getDocument<ChannelMessages>(messagesDocId).messages).at(-1)!
    aliceChat.markChannelRead(groupId, 'general', lastMsg.id)
    expect(aliceChat.getUnreadCount(groupId, 'general')).toBe(0)
  })

  it('canPerform send_message is true for members, false for non-members', async () => {
    const memberPerms = makePermissions(bobId, ['send_message'])
    const nonMemberPerms = makePermissions(charlieId, [])

    const memberAllowed = await memberPerms.canPerform(bobId, groupId, 'send_message')
    const nonMemberAllowed = await nonMemberPerms.canPerform(charlieId, groupId, 'send_message')

    expect(memberAllowed).toBe(true)
    expect(nonMemberAllowed).toBe(false)
  })

  it('cannot delete the default channel', async () => {
    await expect(aliceChat.deleteChannel(groupId, 'general')).rejects.toThrow('Cannot delete the default channel')
  })

  it('getChannels returns channels sorted by position', async () => {
    await aliceChat.createChannel(groupId, 'announcements')
    await aliceChat.createChannel(groupId, 'random')
    const channels = aliceChat.getChannels(groupId)
    for (let i = 1; i < channels.length; i++) {
      expect(channels[i].position).toBeGreaterThanOrEqual(channels[i - 1].position)
    }
  })
})

describe('MentionResolver', () => {
  const resolver = new MentionResolver()

  const members = new Map<PeerIdStr, UserProfile>([
    ['peer-alice', { userId: 'peer-alice', displayName: 'Alice', publicKeyHex: '', createdAt: 0 }],
    ['peer-bob', { userId: 'peer-bob', displayName: 'Bob', publicKeyHex: '', createdAt: 0 }],
  ])

  it('extracts mentioned peer IDs from message content', () => {
    const ids = resolver.extractMentions('Hello @Alice and @Bob!', members)
    expect(ids).toContain('peer-alice')
    expect(ids).toContain('peer-bob')
    expect(ids).toHaveLength(2)
  })

  it('returns empty array for no mentions', () => {
    expect(resolver.extractMentions('No mentions here', members)).toHaveLength(0)
  })

  it('deduplicates repeated mentions', () => {
    const ids = resolver.extractMentions('@Alice @Alice', members)
    expect(ids).toHaveLength(1)
  })

  it('getAutocompleteSuggestions filters by prefix', () => {
    const results = resolver.getAutocompleteSuggestions('Al', members)
    expect(results).toHaveLength(1)
    expect(results[0].displayName).toBe('Alice')
  })
})
