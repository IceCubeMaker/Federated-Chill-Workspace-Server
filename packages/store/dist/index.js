// src/crypto.ts
import _sodium from "libsodium-wrappers";
async function getSodium() {
  await _sodium.ready;
  return _sodium;
}
var DocumentCrypto = class {
  static async generateKey() {
    const sodium = await getSodium();
    return sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
  }
  static async encrypt(plaintext, key, additionalData) {
    const sodium = await getSodium();
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintext,
      additionalData ?? null,
      null,
      nonce,
      key
    );
    const result = new Uint8Array(nonce.length + ciphertext.length);
    result.set(nonce, 0);
    result.set(ciphertext, nonce.length);
    return result;
  }
  static async decrypt(payload, key, additionalData) {
    const sodium = await getSodium();
    const nonceLen = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
    const nonce = payload.slice(0, nonceLen);
    const ciphertext = payload.slice(nonceLen);
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      additionalData ?? null,
      nonce,
      key
    );
  }
  static async deriveKeyFromPassword(password, salt) {
    const sodium = await getSodium();
    return sodium.crypto_pwhash(
      sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
      password,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_MODERATE,
      sodium.crypto_pwhash_MEMLIMIT_MODERATE,
      sodium.crypto_pwhash_ALG_DEFAULT
    );
  }
};

// src/storage-adapter.ts
async function getStorageAdapter(platform, dataDir) {
  if (platform === "node") {
    const { NodeFSStorageAdapter } = await import(
      /* @vite-ignore */
      "@automerge/automerge-repo-storage-nodefs"
    );
    return new NodeFSStorageAdapter(dataDir ?? "./data");
  } else {
    const { IndexedDBStorageAdapter } = await import("@automerge/automerge-repo-storage-indexeddb");
    return new IndexedDBStorageAdapter("workspace-db");
  }
}

// src/repo-manager.ts
import { Repo } from "@automerge/automerge-repo";
var KeyNotFoundError = class extends Error {
  constructor(docId) {
    super(`No encryption key found for document: ${docId}`);
    this.name = "KeyNotFoundError";
  }
};
var MAX_DOC_BYTES = 10 * 1024 * 1024;
function toAutomergeUrl(docId) {
  return docId;
}
var RepoManager = class {
  repo;
  keys = /* @__PURE__ */ new Map();
  constructor(storageAdapter, _platform) {
    this.repo = new Repo({ storage: storageAdapter });
  }
  async createDocument(initialData) {
    const handle = this.repo.create(initialData);
    const key = await DocumentCrypto.generateKey();
    const docId = handle.url;
    this.keys.set(docId, key);
    return docId;
  }
  /** Create a document using a caller-supplied key instead of a random one. */
  async createDocumentWithKey(initialData, key) {
    const handle = this.repo.create(initialData);
    const docId = handle.url;
    this.keys.set(docId, key);
    return docId;
  }
  /**
   * Create a document without an encryption key — any peer can replicate it.
   * Use only for data that is already protected at the application layer
   * (e.g. an identity document whose private key is password-encrypted).
   */
  async createPublicDocument(initialData) {
    const handle = this.repo.create(initialData);
    return handle.url;
  }
  /** Get a handle for a public (unencrypted) document. */
  getPublicHandle(docId) {
    return this.repo.find(toAutomergeUrl(docId));
  }
  getDocument(docId) {
    const handle = this.repo.find(toAutomergeUrl(docId));
    return handle.docSync();
  }
  getHandle(docId) {
    return this.repo.find(toAutomergeUrl(docId));
  }
  async updateDocument(docId, callback) {
    const handle = this.repo.find(toAutomergeUrl(docId));
    handle.change(callback);
  }
  async getEncryptedSyncState(docId) {
    const key = this.#requireKey(docId);
    const handle = this.repo.find(toAutomergeUrl(docId));
    const doc = handle.docSync();
    if (doc) {
      const { save } = await import("@automerge/automerge");
      const bytes = save(doc);
      if (bytes.length > MAX_DOC_BYTES) {
        const amModule = await import("@automerge/automerge");
        if (typeof amModule.compact === "function") {
          amModule.compact(doc);
        }
      }
    }
    const syncState = JSON.stringify({ docId });
    const plaintext = new TextEncoder().encode(syncState);
    const additionalData = new TextEncoder().encode(docId);
    return DocumentCrypto.encrypt(plaintext, key, additionalData);
  }
  async receiveEncryptedSyncState(docId, encryptedData) {
    const key = this.#requireKey(docId);
    const additionalData = new TextEncoder().encode(docId);
    const plaintext = await DocumentCrypto.decrypt(encryptedData, key, additionalData);
    const _syncState = JSON.parse(new TextDecoder().decode(plaintext));
  }
  importKey(docId, key) {
    this.keys.set(docId, key);
  }
  getKey(docId) {
    return this.keys.get(docId);
  }
  listDocumentIds() {
    return Array.from(this.keys.keys());
  }
  async flush() {
    await this.repo.flush();
  }
  #requireKey(docId) {
    const key = this.keys.get(docId);
    if (!key) throw new KeyNotFoundError(docId);
    return key;
  }
};
export {
  DocumentCrypto,
  KeyNotFoundError,
  RepoManager,
  getStorageAdapter
};
