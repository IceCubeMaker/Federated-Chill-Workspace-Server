import { PeerId, Libp2p } from '@libp2p/interface';
import { DocumentId, PeerIdStr, CheckpointMessage, SyncState } from '@federation/types';
import { RepoManager, Platform } from '@federation/store';
import { PubSubManager, PeerRouting, NodeRole } from '@federation/network';

declare class ReplicationStrategy {
    selectReplicaPeers(available: PeerId[], exclude: PeerId[], count?: number): PeerId[];
    needsReplication(currentHolders: PeerId[]): boolean;
}

declare class VerificationService {
    private readonly repo;
    private readonly checkpoints;
    constructor(repo: RepoManager);
    computeCheckpoint(docId: DocumentId): Promise<string>;
    signCheckpoint(hash: string, privateKey: Uint8Array): Promise<string>;
    verifyCheckpoint(_docId: DocumentId, hash: string, signature: string, publicKey: Uint8Array): Promise<boolean>;
    recordCheckpoint(docId: DocumentId, fromPeerId: PeerIdStr, checkpointMessage: CheckpointMessage): void;
    runConsensusCheck(docId: DocumentId): Promise<{
        valid: boolean;
        currentHash?: string;
    }>;
}

declare class SyncEngine {
    #private;
    private readonly repo;
    private readonly pubsub;
    private readonly routing;
    private readonly verification;
    private readonly replication;
    private readonly localPeerId;
    private readonly inFlight;
    private heartbeatTimer;
    constructor(repo: RepoManager, pubsub: PubSubManager, routing: PeerRouting, verification: VerificationService, replication: ReplicationStrategy, localPeerId: PeerIdStr);
    start(): void;
    stop(): Promise<void>;
    syncDocument(docId: DocumentId, targetPeers?: PeerId[]): Promise<void>;
    announceAllInterests(): Promise<void>;
}

declare class StateMachine {
    private readonly syncEngine;
    private state;
    private readonly pendingDocs;
    constructor(syncEngine: SyncEngine);
    getState(): SyncState;
    goOnline(): Promise<void>;
    goOffline(): Promise<void>;
    queueSync(docId: DocumentId): void;
    processQueue(): Promise<void>;
}

interface FederationConfig {
    dataDir?: string;
    platform: Platform;
    bootstrapPeers?: string[];
    listenAddresses?: string[];
    /**
     * 'server': Full relay + DHT server (desktop / Node.js).
     * 'client': Browser mode — uses relay for inbound reachability.
     * 'auto' (default): Detect from environment.
     */
    nodeRole?: NodeRole;
}
declare class WorkspaceFederation {
    #private;
    private node;
    private repo;
    private pubsub;
    private routing;
    private verification;
    private replication;
    private syncEngine;
    private stateMachine;
    private initialized;
    initialize(config: FederationConfig): Promise<void>;
    createDocument<T>(initialData: T): Promise<DocumentId>;
    createDocumentWithKey<T>(initialData: T, key: Uint8Array): Promise<DocumentId>;
    getDocument<T>(docId: DocumentId): T;
    updateDocument<T>(docId: DocumentId, updater: (doc: T) => void): Promise<void>;
    startSync(): Promise<void>;
    stopSync(): Promise<void>;
    getSyncState(): SyncState;
    getPeersForDocument(docId: DocumentId): string[];
    verifyDocument(docId: DocumentId): Promise<{
        valid: boolean;
        currentHash?: string;
    }>;
    shutdown(): Promise<void>;
    /** Expose repo for advanced use (e.g. tests) */
    getRepo(): RepoManager;
    /** Expose the libp2p node (e.g. for multiaddr inspection in tests) */
    getNode(): Libp2p;
    /** Expose pubsub manager for group DM topics */
    getPubSub(): PubSubManager;
    /**
     * Returns the multiaddrs this node is listening on.
     * Desktop/server nodes include TCP and WebSocket addresses that browser clients
     * can use to connect directly. Browsers get /webrtc circuit-relay addresses.
     */
    getListenAddresses(): string[];
    /** Local peer ID string */
    getPeerId(): string;
    /** Number of currently connected peers. */
    getPeerCount(): number;
    /**
     * Subscribe to peer connect/disconnect events.
     * Returns an unsubscribe function.
     */
    onPeerCountChange(callback: (count: number) => void): () => void;
}

export { type FederationConfig, ReplicationStrategy, StateMachine, SyncEngine, VerificationService, WorkspaceFederation };
