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

// Public IPFS bootstrap nodes — run the same kad-dht protocol we use.
// Joining their DHT gives us a global routing table for free.
export const IPFS_BOOTSTRAP_PEERS = [
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',
  '/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ',
]

export interface LibP2PNodeOptions {
  /** Override bootstrap peers. Defaults to IPFS_BOOTSTRAP_PEERS. Pass [] to disable. */
  bootstrapPeers?: string[]
  listenAddresses?: string[]
  announceAddresses?: string[]
}

export async function createLibp2pNode(options: LibP2PNodeOptions = {}): Promise<Libp2p> {
  const {
    bootstrapPeers = IPFS_BOOTSTRAP_PEERS,
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
        // Match IPFS's DHT protocol so we share their routing table.
        // Without this we'd be on an isolated /kad/1.0.0 island.
        protocol: '/ipfs/kad/1.0.0',
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
