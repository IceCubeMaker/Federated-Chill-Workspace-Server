// src/libp2p-config.ts
import { createLibp2p } from "libp2p";
import { webSockets } from "@libp2p/websockets";
import { webTransport } from "@libp2p/webtransport";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { kadDHT } from "@libp2p/kad-dht";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { bootstrap } from "@libp2p/bootstrap";
var IPFS_BOOTSTRAP_PEERS = [
  "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
  "/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa",
  "/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb",
  "/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt",
  "/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ"
];
async function createLibp2pNode(options = {}) {
  const {
    bootstrapPeers = IPFS_BOOTSTRAP_PEERS,
    listenAddresses,
    announceAddresses = [],
    nodeRole = "auto"
  } = options;
  const isNode = typeof process !== "undefined" && process.versions?.node != null;
  const isServer = nodeRole === "server" || nodeRole === "auto" && isNode;
  const defaultListenAddresses = isServer ? ["/ip4/0.0.0.0/tcp/0", "/ip4/0.0.0.0/tcp/0/ws"] : [];
  const resolvedListenAddresses = listenAddresses ?? defaultListenAddresses;
  let transports;
  if (isServer) {
    const { tcp } = await import(
      /* @vite-ignore */
      "@libp2p/tcp"
    );
    transports = [tcp(), webSockets()];
  } else {
    transports = [webSockets(), webTransport()];
  }
  const peerDiscovery = [];
  if (bootstrapPeers.length > 0) {
    peerDiscovery.push(bootstrap({ list: bootstrapPeers }));
  }
  if (isNode) {
    const { mdns } = await import(
      /* @vite-ignore */
      "@libp2p/mdns"
    );
    peerDiscovery.push(mdns({ interval: 2e4 }));
  }
  const node = await createLibp2p({
    addresses: {
      listen: resolvedListenAddresses,
      announce: announceAddresses,
      announceFilter: (addrs) => addrs
    },
    transports,
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery,
    services: {
      // Server nodes route for others + store DHT values (clientMode: false).
      // Client nodes only query the DHT, reducing load on browser tabs.
      dht: kadDHT({
        clientMode: !isServer,
        kBucketSize: 20,
        // Match IPFS's DHT protocol so we share their routing table.
        protocol: "/ipfs/kad/1.0.0"
      }),
      pubsub: gossipsub({
        allowPublishToZeroTopicPeers: true,
        emitSelf: false,
        fallbackToFloodsub: true,
        floodPublish: true
      })
    }
  });
  return node;
}

// src/peer-routing.ts
var PeerRouting = class {
  constructor(node) {
    this.node = node;
  }
  node;
  async findClosestPeers(docId, count = 5) {
    const key = new TextEncoder().encode(docId);
    const peers = [];
    try {
      const dht = this.node.services.dht;
      for await (const event of dht.getClosestPeers(key)) {
        peers.push(event.id);
        if (peers.length >= count) break;
      }
    } catch (err) {
    }
    return peers;
  }
  async advertiseSelf() {
    try {
      const dht = this.node.services.dht;
      const key = this.node.peerId.toBytes();
      for await (const _event of dht.provide(key)) {
      }
    } catch {
    }
  }
  async storePeerAddress(peerId, multiaddrs) {
    await this.node.peerStore.patch(peerId, { multiaddrs });
  }
  getPeersForTopic(topic) {
    try {
      const pubsub = this.node.services.pubsub;
      return pubsub.getSubscribers(topic);
    } catch {
      return [];
    }
  }
};

// src/pubsub.ts
var PubSubManager = class {
  handlers = /* @__PURE__ */ new Map();
  pubsub;
  constructor(node) {
    this.pubsub = node.services.pubsub;
  }
  async publish(topic, data) {
    await this.pubsub.publish(topic, data);
  }
  subscribe(topic, handler) {
    this.pubsub.subscribe(topic);
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, /* @__PURE__ */ new Set());
    }
    const raw = (evt) => {
      if (evt.detail.topic !== topic) return;
      const fromPeerId = evt.detail.from;
      handler(evt.detail.data, fromPeerId);
    };
    this.handlers.get(topic).add({ raw, user: handler });
    this.pubsub.addEventListener("message", raw);
  }
  unsubscribe(topic) {
    const set = this.handlers.get(topic);
    if (set) {
      for (const { raw } of set) {
        this.pubsub.removeEventListener("message", raw);
      }
      this.handlers.delete(topic);
    }
    this.pubsub.unsubscribe(topic);
  }
};
export {
  IPFS_BOOTSTRAP_PEERS,
  PeerRouting,
  PubSubManager,
  createLibp2pNode
};
