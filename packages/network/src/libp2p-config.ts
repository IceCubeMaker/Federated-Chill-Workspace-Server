import { createLibp2p, type Libp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { webTransport } from '@libp2p/webtransport'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { mdns } from '@libp2p/mdns'
import { bootstrap } from '@libp2p/bootstrap'

export interface LibP2PNodeOptions {
  bootstrapPeers?: string[]
  listenAddresses?: string[]
  announceAddresses?: string[]
}

export async function createLibp2pNode(options: LibP2PNodeOptions = {}): Promise<Libp2p> {
  const {
    bootstrapPeers = [],
    listenAddresses = ['/ip4/0.0.0.0/tcp/0', '/ip4/0.0.0.0/tcp/0/ws'],
    announceAddresses = [],
  } = options

  const isNode = typeof process !== 'undefined' && process.versions?.node != null

  const transports = isNode
    ? [tcp(), webSockets()]
    : [webSockets(), webTransport()]

  const peerDiscovery = []

  if (bootstrapPeers.length > 0) {
    peerDiscovery.push(bootstrap({ list: bootstrapPeers }))
  }

  // mDNS only available in Node.js
  if (isNode) {
    peerDiscovery.push(mdns({ interval: 20_000 }))
  }

  const node = await createLibp2p({
    addresses: {
      listen: listenAddresses,
      announce: announceAddresses,
      // Allow all addresses through the announce filter
      announceFilter: (addrs) => addrs,
    },
    transports,
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery,
    services: {
      dht: kadDHT({
        clientMode: false,
        kBucketSize: 20,
      }),
      pubsub: gossipsub({
        allowPublishToZeroTopicPeers: true,
        emitSelf: false,
        fallbackToFloodsub: true,
        floodPublish: true,
      }),
    },
  })

  return node
}
