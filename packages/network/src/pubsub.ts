import type { Libp2p, PeerId } from '@libp2p/interface'

type MessageHandler = (msg: Uint8Array, from: PeerId) => void

interface GossipsubService {
  publish(topic: string, data: Uint8Array): Promise<unknown>
  subscribe(topic: string): void
  unsubscribe(topic: string): void
  addEventListener(event: 'message', handler: (evt: CustomEvent<{ topic: string; data: Uint8Array; from: string }>) => void): void
  removeEventListener(event: 'message', handler: (evt: CustomEvent<{ topic: string; data: Uint8Array; from: string }>) => void): void
}

export class PubSubManager {
  private readonly handlers = new Map<string, Set<{ raw: (evt: CustomEvent<{ topic: string; data: Uint8Array; from: string }>) => void; user: MessageHandler }>>()
  private readonly pubsub: GossipsubService

  constructor(node: Libp2p) {
    this.pubsub = (node.services as Record<string, unknown>).pubsub as GossipsubService
  }

  async publish(topic: string, data: Uint8Array): Promise<void> {
    await this.pubsub.publish(topic, data)
  }

  subscribe(topic: string, handler: MessageHandler): void {
    this.pubsub.subscribe(topic)

    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, new Set())
    }

    const raw = (evt: CustomEvent<{ topic: string; data: Uint8Array; from: string }>) => {
      if (evt.detail.topic !== topic) return
      // Reconstruct a PeerId-like object; full resolution happens at SyncEngine layer
      const fromPeerId = evt.detail.from as unknown as PeerId
      handler(evt.detail.data, fromPeerId)
    }

    this.handlers.get(topic)!.add({ raw, user: handler })
    this.pubsub.addEventListener('message', raw)
  }

  unsubscribe(topic: string): void {
    const set = this.handlers.get(topic)
    if (set) {
      for (const { raw } of set) {
        this.pubsub.removeEventListener('message', raw)
      }
      this.handlers.delete(topic)
    }
    this.pubsub.unsubscribe(topic)
  }
}
