import { Repo, type Doc, type DocHandle } from '@automerge/automerge-repo'
import type { AutomergeUrl, StorageAdapter } from '@automerge/automerge-repo'
import type { DocumentId } from '@federation/types'
import { DocumentCrypto } from './crypto.js'

export class KeyNotFoundError extends Error {
  constructor(docId: DocumentId) {
    super(`No encryption key found for document: ${docId}`)
    this.name = 'KeyNotFoundError'
  }
}

const MAX_DOC_BYTES = 10 * 1024 * 1024 // 10 MB

// Our DocumentId is just string; automerge uses branded types.
// We store & expose AutomergeUrl strings (which are valid DocumentId values).
function toAutomergeUrl(docId: DocumentId): AutomergeUrl {
  return docId as unknown as AutomergeUrl
}

export class RepoManager {
  private readonly repo: Repo
  private readonly keys = new Map<DocumentId, Uint8Array>()

  constructor(storageAdapter: StorageAdapter, _platform: string) {
    this.repo = new Repo({ storage: storageAdapter })
  }

  async createDocument<T>(initialData: T): Promise<DocumentId> {
    const handle = this.repo.create<T>(initialData)
    const key = await DocumentCrypto.generateKey()
    // AutomergeUrl is string & branded, safe to treat as our plain-string DocumentId
    const docId = handle.url as unknown as DocumentId
    this.keys.set(docId, key)
    return docId
  }

  /** Create a document using a caller-supplied key instead of a random one. */
  async createDocumentWithKey<T>(initialData: T, key: Uint8Array): Promise<DocumentId> {
    const handle = this.repo.create<T>(initialData)
    const docId = handle.url as unknown as DocumentId
    this.keys.set(docId, key)
    return docId
  }

  /**
   * Create a document without an encryption key — any peer can replicate it.
   * Use only for data that is already protected at the application layer
   * (e.g. an identity document whose private key is password-encrypted).
   */
  async createPublicDocument<T>(initialData: T): Promise<DocumentId> {
    const handle = this.repo.create<T>(initialData)
    return handle.url as unknown as DocumentId
  }

  /** Get a handle for a public (unencrypted) document. */
  getPublicHandle<T>(docId: DocumentId): DocHandle<T> {
    return this.repo.find<T>(toAutomergeUrl(docId))
  }

  getDocument<T>(docId: DocumentId): Doc<T> {
    const handle = this.repo.find<T>(toAutomergeUrl(docId))
    return handle.docSync() as Doc<T>
  }

  getHandle<T>(docId: DocumentId): DocHandle<T> {
    return this.repo.find<T>(toAutomergeUrl(docId))
  }

  async updateDocument<T>(docId: DocumentId, callback: (doc: T) => void): Promise<void> {
    const handle = this.repo.find<T>(toAutomergeUrl(docId))
    handle.change(callback)
  }

  async getEncryptedSyncState(docId: DocumentId): Promise<Uint8Array> {
    const key = this.#requireKey(docId)
    const handle = this.repo.find(toAutomergeUrl(docId))

    const doc = handle.docSync()
    if (doc) {
      const { save } = await import('@automerge/automerge')
      const bytes = save(doc)
      if (bytes.length > MAX_DOC_BYTES) {
        const amModule = await import('@automerge/automerge') as Record<string, unknown>
        if (typeof amModule.compact === 'function') {
          amModule.compact(doc)
        }
      }
    }

    const syncState = JSON.stringify({ docId })
    const plaintext = new TextEncoder().encode(syncState)
    const additionalData = new TextEncoder().encode(docId)
    return DocumentCrypto.encrypt(plaintext, key, additionalData)
  }

  async receiveEncryptedSyncState(docId: DocumentId, encryptedData: Uint8Array): Promise<void> {
    const key = this.#requireKey(docId)
    const additionalData = new TextEncoder().encode(docId)
    const plaintext = await DocumentCrypto.decrypt(encryptedData, key, additionalData)
    const _syncState = JSON.parse(new TextDecoder().decode(plaintext))
    // Future: apply binary Automerge sync messages via handle.receiveSyncMessage
  }

  importKey(docId: DocumentId, key: Uint8Array): void {
    this.keys.set(docId, key)
  }

  getKey(docId: DocumentId): Uint8Array | undefined {
    return this.keys.get(docId)
  }

  listDocumentIds(): DocumentId[] {
    return Array.from(this.keys.keys())
  }

  async flush(): Promise<void> {
    await this.repo.flush()
  }

  #requireKey(docId: DocumentId): Uint8Array {
    const key = this.keys.get(docId)
    if (!key) throw new KeyNotFoundError(docId)
    return key
  }
}
