import { StorageAdapter, DocHandle, Doc } from '@automerge/automerge-repo';
export { Chunk, StorageAdapter, StorageAdapterInterface } from '@automerge/automerge-repo';
import { DocumentId } from '@federation/types';

declare class DocumentCrypto {
    static generateKey(): Promise<Uint8Array>;
    static encrypt(plaintext: Uint8Array, key: Uint8Array, additionalData?: Uint8Array): Promise<Uint8Array>;
    static decrypt(payload: Uint8Array, key: Uint8Array, additionalData?: Uint8Array): Promise<Uint8Array>;
    static deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<Uint8Array>;
}

type Platform = 'node' | 'browser';
declare function getStorageAdapter(platform: Platform, dataDir?: string): Promise<StorageAdapter>;

declare class KeyNotFoundError extends Error {
    constructor(docId: DocumentId);
}
declare class RepoManager {
    #private;
    private readonly repo;
    private readonly keys;
    constructor(storageAdapter: StorageAdapter, _platform: string);
    createDocument<T>(initialData: T): Promise<DocumentId>;
    /** Create a document using a caller-supplied key instead of a random one. */
    createDocumentWithKey<T>(initialData: T, key: Uint8Array): Promise<DocumentId>;
    /**
     * Create a document without an encryption key — any peer can replicate it.
     * Use only for data that is already protected at the application layer
     * (e.g. an identity document whose private key is password-encrypted).
     */
    createPublicDocument<T>(initialData: T): Promise<DocumentId>;
    /** Get a handle for a public (unencrypted) document. */
    getPublicHandle<T>(docId: DocumentId): DocHandle<T>;
    getDocument<T>(docId: DocumentId): Doc<T>;
    getHandle<T>(docId: DocumentId): DocHandle<T>;
    updateDocument<T>(docId: DocumentId, callback: (doc: T) => void): Promise<void>;
    getEncryptedSyncState(docId: DocumentId): Promise<Uint8Array>;
    receiveEncryptedSyncState(docId: DocumentId, encryptedData: Uint8Array): Promise<void>;
    importKey(docId: DocumentId, key: Uint8Array): void;
    getKey(docId: DocumentId): Uint8Array | undefined;
    listDocumentIds(): DocumentId[];
    flush(): Promise<void>;
}

export { DocumentCrypto, KeyNotFoundError, type Platform, RepoManager, getStorageAdapter };
