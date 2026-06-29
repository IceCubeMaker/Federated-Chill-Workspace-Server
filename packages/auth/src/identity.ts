import _sodium from 'libsodium-wrappers'
import { v4 as uuidv4 } from 'uuid'
import type { UserProfile } from '@federation/models'
import type { PeerIdStr } from '@federation/models'

async function sodium() {
  await _sodium.ready
  return _sodium
}

function toHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}

function fromHex(h: string): Uint8Array {
  const arr = new Uint8Array(h.length / 2)
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return arr
}

interface EncryptedKey {
  ciphertextHex: string
  nonceHex: string
  saltHex: string
}

interface StoredIdentity {
  peerId: PeerIdStr
  publicKeyHex: string
  /** Present only when NOT password-protected. */
  privateKeyHex?: string
  /** Present only when password-protected (argon2id + secretbox). */
  encrypted?: EncryptedKey
  /** Automerge document ID of the personal root document (group registry). */
  rootDocId?: string
  /** Automerge document ID of the public identity document (connection code). */
  identityDocId?: string
  profile: UserProfile
}

// Use globalThis to access browser globals without depending on DOM lib types.
const _g = globalThis as Record<string, unknown>
const _ls = typeof _g['localStorage'] !== 'undefined'
  ? (_g['localStorage'] as { getItem(k: string): string | null; setItem(k: string, v: string): void })
  : null

// ─── Platform storage helpers ────────────────────────────────────────────────

async function storageRead(key: string): Promise<string | null> {
  if (_ls) return _ls.getItem(key)
  // Node.js / Tauri
  // vite-ignore: Node.js-only, never reached in browser
  const { readFile } = await import(/* @vite-ignore */ 'fs/promises')
  try {
    return await readFile(key, 'utf8')
  } catch {
    return null
  }
}

async function storageWrite(key: string, value: string): Promise<void> {
  if (_ls) { _ls.setItem(key, value); return }
  const { writeFile, mkdir } = await import(/* @vite-ignore */ 'fs/promises')
  const { dirname } = await import(/* @vite-ignore */ 'path')
  await mkdir(dirname(key), { recursive: true })
  await writeFile(key, value, 'utf8')
}

// ─── IdentityStorageProvider ─────────────────────────────────────────────────

/** Plug-in storage for LocalIdentity. Default: localStorage / Node.js fs. */
export interface IdentityStorageProvider {
  load(): Promise<string | null>
  save(value: string): Promise<void>
}

// ─── LocalIdentity ────────────────────────────────────────────────────────────

export class LocalIdentity {
  private stored!: StoredIdentity
  private readonly storageKey: string
  private unlockedKey: Uint8Array | null = null

  /**
   * @param dataDir   On Node.js: filesystem directory path.
   *                  In browser: localStorage namespace key (e.g. "federation-workspace").
   * @param provider  Optional custom storage (e.g. Capacitor Filesystem on Android).
   */
  constructor(dataDir: string, private readonly provider?: IdentityStorageProvider) {
    this.storageKey = _ls ? `${dataDir}:identity` : `${dataDir}/identity.json`
  }

  private async readIdentity(): Promise<string | null> {
    if (this.provider) return this.provider.load()
    return storageRead(this.storageKey)
  }

  private async writeIdentity(value: string): Promise<void> {
    if (this.provider) return this.provider.save(value)
    return storageWrite(this.storageKey, value)
  }

  /**
   * Load or generate identity from storage.
   * Returns true if a brand-new identity was generated (first launch).
   */
  async load(): Promise<boolean> {
    const raw = await this.readIdentity()
    if (raw) {
      this.stored = JSON.parse(raw) as StoredIdentity
      if (this.stored.privateKeyHex) {
        // Unprotected — unlock immediately
        this.unlockedKey = fromHex(this.stored.privateKeyHex)
      }
      return false
    } else {
      await this.#generate()
      return true
    }
  }

  /** True if the private key is encrypted with a password. */
  isProtected(): boolean {
    return !!this.stored?.encrypted && !this.stored.privateKeyHex
  }

  /** True if the private key is available in memory (unlocked or unprotected). */
  isUnlocked(): boolean {
    return this.unlockedKey !== null
  }

  /**
   * Decrypt the private key using the given password.
   * Throws 'Incorrect password' on failure.
   */
  async unlock(password: string): Promise<void> {
    if (!this.stored.encrypted) throw new Error('Identity is not password-protected')
    const s = await sodium()
    const salt = fromHex(this.stored.encrypted.saltHex)
    const nonce = fromHex(this.stored.encrypted.nonceHex)
    const ciphertext = fromHex(this.stored.encrypted.ciphertextHex)

    const key = s.crypto_pwhash(
      s.crypto_secretbox_KEYBYTES,
      password,
      salt,
      s.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      s.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      s.crypto_pwhash_ALG_DEFAULT,
    )

    try {
      this.unlockedKey = s.crypto_secretbox_open_easy(ciphertext, nonce, key)
    } catch {
      throw new Error('Incorrect password')
    }
  }

  /**
   * Encrypt the private key with a password and persist.
   * After this the raw privateKeyHex is removed from storage.
   */
  async protect(password: string): Promise<void> {
    if (!this.unlockedKey) throw new Error('No private key in memory')
    const s = await sodium()
    const salt = s.randombytes_buf(s.crypto_pwhash_SALTBYTES)
    const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES)
    const derivedKey = s.crypto_pwhash(
      s.crypto_secretbox_KEYBYTES,
      password,
      salt,
      s.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      s.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      s.crypto_pwhash_ALG_DEFAULT,
    )
    const ciphertext = s.crypto_secretbox_easy(this.unlockedKey, nonce, derivedKey)
    this.stored.encrypted = {
      ciphertextHex: toHex(ciphertext),
      nonceHex: toHex(nonce),
      saltHex: toHex(salt),
    }
    delete this.stored.privateKeyHex
    await this.writeIdentity(JSON.stringify(this.stored, null, 2))
  }

  /**
   * Export identity as a JSON string.
   * Safe to share between your own devices — the private key stays encrypted
   * if protect() was called. Treat this blob like a password-manager entry.
   */
  exportBlob(): string {
    return JSON.stringify(this.stored)
  }

  /**
   * Import an identity blob exported from another device.
   * Replaces the current identity in storage and memory.
   * If the imported identity is password-protected, call unlock() afterwards.
   */
  async importFromBlob(blob: string): Promise<void> {
    const parsed = JSON.parse(blob) as StoredIdentity
    this.stored = parsed
    if (this.stored.privateKeyHex) {
      this.unlockedKey = fromHex(this.stored.privateKeyHex)
    } else {
      this.unlockedKey = null
    }
    await this.writeIdentity(JSON.stringify(this.stored, null, 2))
  }

  getRootDocId(): string | null {
    return this.stored.rootDocId ?? null
  }

  getIdentityDocId(): string | null {
    return this.stored.identityDocId ?? null
  }

  async setIdentityDocId(id: string): Promise<void> {
    this.stored.identityDocId = id
    await this.writeIdentity(JSON.stringify(this.stored, null, 2))
  }

  /** Returns the password-encrypted private key fields, or null if unprotected. */
  getEncryptedFields(): { ciphertextHex: string; nonceHex: string; saltHex: string } | null {
    return this.stored.encrypted ?? null
  }

  async setRootDocId(id: string): Promise<void> {
    this.stored.rootDocId = id
    await this.writeIdentity(JSON.stringify(this.stored, null, 2))
  }

  /**
   * Derive a deterministic 32-byte symmetric key from the private key.
   * Used to encrypt the personal root document so it can be stored/replicated
   * on other peers without leaking group membership info.
   */
  async deriveRootDocKey(): Promise<Uint8Array> {
    const s = await sodium()
    const sk = this.#requireKey()
    // ed25519 private key = 64 bytes (seed || public key); first 32 bytes is the seed
    const seed = sk.slice(0, s.crypto_kdf_KEYBYTES)
    return s.crypto_kdf_derive_from_key(
      s.crypto_secretbox_KEYBYTES, // 32 bytes
      1,           // subkey index
      'rootdoc1',  // must be exactly 8 bytes
      seed,
    )
  }

  getProfile(): UserProfile {
    return this.stored.profile
  }

  async updateProfile(patch: { displayName?: string }): Promise<void> {
    this.stored.profile = { ...this.stored.profile, ...patch }
    await this.writeIdentity(JSON.stringify(this.stored, null, 2))
  }

  getPeerId(): PeerIdStr {
    return this.stored.peerId
  }

  getPublicKey(): Uint8Array {
    return fromHex(this.stored.publicKeyHex)
  }

  getPrivateKey(): Uint8Array {
    return this.#requireKey()
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    const s = await sodium()
    return s.crypto_sign_detached(data, this.#requireKey())
  }

  async encryptForUser(recipientPublicKey: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
    const s = await sodium()
    const senderCurveSk = s.crypto_sign_ed25519_sk_to_curve25519(this.#requireKey())
    const recipientCurvePk = s.crypto_sign_ed25519_pk_to_curve25519(recipientPublicKey)
    const nonce = s.randombytes_buf(s.crypto_box_NONCEBYTES)
    const ciphertext = s.crypto_box_easy(plaintext, nonce, recipientCurvePk, senderCurveSk)
    const out = new Uint8Array(nonce.length + ciphertext.length)
    out.set(nonce)
    out.set(ciphertext, nonce.length)
    return out
  }

  async decryptFromUser(senderPublicKey: Uint8Array, payload: Uint8Array): Promise<Uint8Array> {
    const s = await sodium()
    const myCurveSk = s.crypto_sign_ed25519_sk_to_curve25519(this.#requireKey())
    const senderCurvePk = s.crypto_sign_ed25519_pk_to_curve25519(senderPublicKey)
    const nonce = payload.slice(0, s.crypto_box_NONCEBYTES)
    const ciphertext = payload.slice(s.crypto_box_NONCEBYTES)
    return s.crypto_box_open_easy(ciphertext, nonce, senderCurvePk, myCurveSk)
  }

  async #generate(): Promise<void> {
    const s = await sodium()
    const keypair = s.crypto_sign_keypair()
    const peerId = uuidv4() as PeerIdStr

    this.stored = {
      peerId,
      publicKeyHex: toHex(keypair.publicKey),
      privateKeyHex: toHex(keypair.privateKey),
      profile: {
        userId: peerId,
        displayName: `User-${peerId.slice(0, 6)}`,
        publicKeyHex: toHex(keypair.publicKey),
        createdAt: Date.now(),
      },
    }

    this.unlockedKey = keypair.privateKey
    await this.writeIdentity(JSON.stringify(this.stored, null, 2))
  }

  #requireKey(): Uint8Array {
    if (this.unlockedKey) return this.unlockedKey
    throw new Error('Identity is locked. Call unlock(password) first.')
  }
}
