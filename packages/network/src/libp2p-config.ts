import { createLibp2p, type Libp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { webTransport } from '@libp2p/webtransport'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { bootstrap } from '@libp2p/bootstrap'
import { identify } from '@libp2p/identify'

// Public IPFS bootstrap nodes — run the same kad-dht protocol we use.
// Joining their DHT gives us a global routing table for free.
export const IPFS_BOOTSTRAP_PEERS = [
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',
  '/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ',
]

/**
 * Every node in the network is simultaneously a client AND a server:
 *
 *  'server' (desktop / Node.js):
 *    - Binds TCP + WebSocket ports so other peers can connect IN.
 *    - Runs the DHT in server mode (routes for other peers, stores values).
 *    - Discovers peers via mDNS (LAN) + DHT (internet).
 *
 *  'client' (browser / PWA):
 *    - Initiates outbound connections via WebSocket + WebTransport.
 *    - Runs DHT in client mode (queries but doesn't route).
 *    - Receives inbound connections through peers that already know its
 *      multiaddr (published via DHT + Gossipsub).
 *
 *  'auto' (default): detect from environment — Node.js → server, browser → client.
 *
 * Even browser nodes are "servers" in the P2P sense: once connected to a relay
 * or directly reachable peer, they accept sync streams and DHT lookups from
 * any peer that knows their PeerId.
 */
export type NodeRole = 'server' | 'client' | 'auto'

export interface LibP2PNodeOptions {
  /** Override bootstrap peers. Defaults to IPFS_BOOTSTRAP_PEERS. Pass [] to disable. */
  bootstrapPeers?: string[]
  listenAddresses?: string[]
  announceAddresses?: string[]
  nodeRole?: NodeRole
}

export async function createLibp2pNode(options: LibP2PNodeOptions = {}): Promise<Libp2p> {
  const {
    bootstrapPeers = IPFS_BOOTSTRAP_PEERS,
    listenAddresses,
    announceAddresses = [],
    nodeRole = 'auto',
  } = options

  const isNode = typeof process !== 'undefined' && process.versions?.node != null
  const isServer = nodeRole === 'server' || (nodeRole === 'auto' && isNode)

  // Servers bind TCP + WebSocket so other peers can connect IN.
  // Browsers only connect out; they become reachable once their multiaddr
  // is published to the DHT by a connected peer.
  const defaultListenAddresses = isServer
    ? ['/ip4/0.0.0.0/tcp/0', '/ip4/0.0.0.0/tcp/0/ws']
    : []

  const resolvedListenAddresses = listenAddresses ?? defaultListenAddresses

  // Node-only transports are dynamically imported so they are never bundled
  // into the browser build. Vite ignores them via /* @vite-ignore */.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let transports: any[]
  if (isServer) {
    const { tcp } = await import(/* @vite-ignore */ '@libp2p/tcp')
    transports = [tcp(), webSockets()]
  } else {
    transports = [webSockets(), webTransport()]
  }

  const peerDiscovery = []
  if (bootstrapPeers.length > 0) {
    peerDiscovery.push(bootstrap({ list: bootstrapPeers }))
  }
  // mDNS: zero-config LAN discovery. Node.js only — dynamic import keeps it
  // out of the browser bundle.
  if (isNode) {
    const { mdns } = await import(/* @vite-ignore */ '@libp2p/mdns')
    peerDiscovery.push(mdns({ interval: 20_000 }))
  }

  const node = await createLibp2p({
    addresses: {
      listen: resolvedListenAddresses,
      announce: announceAddresses,
      announceFilter: (addrs) => addrs,
    },
    transports,
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery,
    services: {
      identify: identify(),
      // Server nodes route for others + store DHT values (clientMode: false).
      // Client nodes only query the DHT, reducing load on browser tabs.
      dht: kadDHT({
        clientMode: !isServer,
        kBucketSize: 20,
        // Match IPFS's DHT protocol so we share their routing table.
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
