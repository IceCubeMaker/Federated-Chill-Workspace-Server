import { StorageAdapter, Doc, DocHandle } from '@automerge/automerge-repo';
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
