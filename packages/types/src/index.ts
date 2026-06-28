/** Unique CRDT document identifier */
export type DocumentId = string;

/** Base58-encoded libp2p peer ID */
export type PeerIdStr = string;

/** Encrypted payload transmitted between peers */
export interface EncryptedPayload {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  senderId: PeerIdStr;
}

/** Checkpoint message used for majority-consensus verification */
export interface CheckpointMessage {
  docId: DocumentId;
  version: number;
  hash: string;
  signatures: Record<PeerIdStr, string>;
}

/** Lifecycle state of the sync engine */
export type SyncState = 'offline' | 'connecting' | 'syncing' | 'idle' | 'error';
