/** Unique CRDT document identifier */
type DocumentId = string;
/** Base58-encoded libp2p peer ID */
type PeerIdStr = string;
/** Encrypted payload transmitted between peers */
interface EncryptedPayload {
    ciphertext: Uint8Array;
    nonce: Uint8Array;
    senderId: PeerIdStr;
}
/** Checkpoint message used for majority-consensus verification */
interface CheckpointMessage {
    docId: DocumentId;
    version: number;
    hash: string;
    signatures: Record<PeerIdStr, string>;
}
/** Lifecycle state of the sync engine */
type SyncState = 'offline' | 'connecting' | 'syncing' | 'idle' | 'error';

export type { CheckpointMessage, DocumentId, EncryptedPayload, PeerIdStr, SyncState };
