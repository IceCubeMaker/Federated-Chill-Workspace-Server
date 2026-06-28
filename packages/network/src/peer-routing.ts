import type { Libp2p, PeerId } from '@libp2p/interface'
import type { DocumentId } from '@federation/types'

export class PeerRouting {
  constructor(private readonly node: Libp2p) {}

  async findClosestPeers(docId: DocumentId, count = 5): Promise<PeerId[]> {
    const key = new TextEncoder().encode(docId)
    const peers: PeerId[] = []

    try {
      // @ts-ignore – dht service accessed via node.services
      const dht = (this.node.services as Record<string, unknown>).dht as {
        getClosestPeers(key: Uint8Array): AsyncIterable<{ id: PeerId }>
      }

      for await (const event of dht.getClosestPeers(key)) {
        peers.push(event.id)
        if (peers.length >= count) break
      }
    } catch (err) {
      // DHT may not have enough peers yet — return what we have
    }

    return peers
  }

  async advertiseSelf(): Promise<void> {
    try {
      const dht = (this.node.services as Record<string, unknown>).dht as {
        provide(cid: Uint8Array): AsyncIterable<unknown>
      }
      // Use peerId bytes as the CID-like key
      const key = this.node.peerId.toBytes()
      // Consume the async iterable to drive the provide operation
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _event of dht.provide(key)) {
        // drain
      }
    } catch {
      // Non-fatal: peer may be isolated
    }
  }

  async storePeerAddress(peerId: PeerId, multiaddrs: import('@multiformats/multiaddr').Multiaddr[]): Promise<void> {
    await this.node.peerStore.patch(peerId, { multiaddrs })
  }

  getPeersForTopic(topic: string): PeerId[] {
    try {
      const pubsub = (this.node.services as Record<string, unknown>).pubsub as {
        getSubscribers(topic: string): PeerId[]
      }
      return pubsub.getSubscribers(topic)
    } catch {
      return []
    }
  }
}
