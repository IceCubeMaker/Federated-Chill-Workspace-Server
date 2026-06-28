import { Libp2p } from 'libp2p';
import * as _multiformats_multiaddr from '@multiformats/multiaddr';
import { Libp2p as Libp2p$1, PeerId } from '@libp2p/interface';
import { DocumentId } from '@federation/types';

declare const IPFS_BOOTSTRAP_PEERS: string[];
interface LibP2PNodeOptions {
    /** Override bootstrap peers. Defaults to IPFS_BOOTSTRAP_PEERS. Pass [] to disable. */
    bootstrapPeers?: string[];
    listenAddresses?: string[];
    announceAddresses?: string[];
}
declare function createLibp2pNode(options?: LibP2PNodeOptions): Promise<Libp2p>;

declare class PeerRouting {
    private readonly node;
    constructor(node: Libp2p$1);
    findClosestPeers(docId: DocumentId, count?: number): Promise<PeerId[]>;
    advertiseSelf(): Promise<void>;
    storePeerAddress(peerId: PeerId, multiaddrs: _multiformats_multiaddr.Multiaddr[]): Promise<void>;
    getPeersForTopic(topic: string): PeerId[];
}

type MessageHandler = (msg: Uint8Array, from: PeerId) => void;
declare class PubSubManager {
    private readonly handlers;
    private readonly pubsub;
    constructor(node: Libp2p$1);
    publish(topic: string, data: Uint8Array): Promise<void>;
    subscribe(topic: string, handler: MessageHandler): void;
    unsubscribe(topic: string): void;
}

export { IPFS_BOOTSTRAP_PEERS, type LibP2PNodeOptions, PeerRouting, PubSubManager, createLibp2pNode };
