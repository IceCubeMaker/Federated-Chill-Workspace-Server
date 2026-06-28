import type { PeerId } from '@libp2p/interface'
import type { DocumentId, PeerIdStr } from '@federation/types'
import type { RepoManager } from '@federation/store'
import { KeyNotFoundError } from '@federation/store'
import type { PubSubManager, PeerRouting } from '@federation/network'
import type { VerificationService } from './verification-service.js'
import type { ReplicationStrategy } from './replication-strategy.js'

const ANNOUNCE_TOPIC = 'sync:announce'
const DATA_TOPIC = 'sync:data'
const DOC_ID_PREFIX_LEN = 64 // Fixed-length docId prefix (padded/truncated)

function encodeDocIdPrefix(docId: DocumentId): Uint8Array {
  const padded = docId.padEnd(DOC_ID_PREFIX_LEN, '\0').slice(0, DOC_ID_PREFIX_LEN)
  return new TextEncoder().encode(padded)
}

function decodeDocIdPrefix(bytes: Uint8Array): DocumentId {
  return new TextDecoder().decode(bytes.slice(0, DOC_ID_PREFIX_LEN)).replace(/\0+$/, '')
}

function buildDataMessage(docId: DocumentId, payload: Uint8Array): Uint8Array {
  const prefix = encodeDocIdPrefix(docId)
  const msg = new Uint8Array(prefix.length + payload.length)
  msg.set(prefix, 0)
  msg.set(payload, prefix.length)
  return msg
}

export class SyncEngine {
  private readonly inFlight = new Set<DocumentId>()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly repo: RepoManager,
    private readonly pubsub: PubSubManager,
    private readonly routing: PeerRouting,
    private readonly verification: VerificationService,
    private readonly replication: ReplicationStrategy,
    private readonly localPeerId: PeerIdStr,
  ) {}

  start(): void {
    this.pubsub.subscribe(ANNOUNCE_TOPIC, (msg, _from) => {
      void this.#handleAnnounce(msg)
    })

    this.pubsub.subscribe(DATA_TOPIC, (msg, _from) => {
      void this.#handleData(msg)
    })

    this.heartbeatTimer = setInterval(() => {
      void this.announceAllInterests()
    }, 30_000)
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.pubsub.unsubscribe(ANNOUNCE_TOPIC)
    this.pubsub.unsubscribe(DATA_TOPIC)
  }

  async syncDocument(docId: DocumentId, targetPeers?: PeerId[]): Promise<void> {
    if (this.inFlight.has(docId)) return
    this.inFlight.add(docId)

    try {
      const peers = targetPeers ?? await this.routing.findClosestPeers(docId, 5)

      let encryptedState: Uint8Array
      try {
        encryptedState = await this.repo.getEncryptedSyncState(docId)
      } catch (err) {
        if (err instanceof KeyNotFoundError) {
          console.warn(`[SyncEngine] No key for doc ${docId}, skipping sync`)
          return
        }
        throw err
      }

      const message = buildDataMessage(docId, encryptedState)

      // Publish to global data topic (Gossipsub propagates to mesh)
      await this.pubsub.publish(DATA_TOPIC, message)

      // Also publish to peer-specific topics for directness
      for (const peer of peers) {
        try {
          await this.pubsub.publish(`sync:data:${peer.toString()}`, message)
        } catch {
          // Peer-specific topic may have zero subscribers — that's fine
        }
      }

      // Announce we hold this doc
      const announceMsg = new TextEncoder().encode(
        JSON.stringify({ docId, peerId: this.localPeerId }),
      )
      await this.pubsub.publish(ANNOUNCE_TOPIC, announceMsg)
    } finally {
      this.inFlight.delete(docId)
    }
  }

  async announceAllInterests(): Promise<void> {
    await this.routing.advertiseSelf()

    const docIds = this.repo.listDocumentIds()
    for (const docId of docIds) {
      const announceMsg = new TextEncoder().encode(
        JSON.stringify({ docId, peerId: this.localPeerId }),
      )
      try {
        await this.pubsub.publish(ANNOUNCE_TOPIC, announceMsg)
      } catch {
        // Non-fatal
      }
    }
  }

  async #handleAnnounce(msg: Uint8Array): Promise<void> {
    try {
      const { docId } = JSON.parse(new TextDecoder().decode(msg)) as { docId: DocumentId; peerId: PeerIdStr }
      // If we hold this doc, sync back
      const localDocIds = this.repo.listDocumentIds()
      if (localDocIds.includes(docId)) {
        await this.syncDocument(docId)
      }
    } catch {
      // Malformed announce
    }
  }

  async #handleData(msg: Uint8Array): Promise<void> {
    if (msg.length <= DOC_ID_PREFIX_LEN) return

    const docId = decodeDocIdPrefix(msg)
    const encryptedPayload = msg.slice(DOC_ID_PREFIX_LEN)

    try {
      await this.repo.receiveEncryptedSyncState(docId, encryptedPayload)
    } catch (err) {
      if (err instanceof KeyNotFoundError) {
        // We don't hold this doc — ignore
        return
      }
      // Decryption error: log and skip
      console.warn(`[SyncEngine] Failed to decrypt sync payload for doc ${docId}:`, err)
    }
  }
}
