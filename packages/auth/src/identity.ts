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

interface StoredIdentity {
  peerId: PeerIdStr
  publicKeyHex: string
  /** PHASE 1: stored in plaintext. Phase 2 will encrypt with browser-passworder. */
  privateKeyHex: string
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

// ─── LocalIdentity ────────────────────────────────────────────────────────────

export class LocalIdentity {
  private stored!: StoredIdentity
  private readonly storageKey: string

  /**
   * @param dataDir  On Node.js: filesystem directory path.
   *                 In browser: localStorage namespace key (e.g. "federation-workspace").
   */
  constructor(dataDir: string) {
    this.storageKey = _ls ? `${dataDir}:identity` : `${dataDir}/identity.json`
  }

  async load(): Promise<void> {
    const raw = await storageRead(this.storageKey)
    if (raw) {
      this.stored = JSON.parse(raw) as StoredIdentity
    } else {
      await this.#generate()
    }
  }

  getProfile(): UserProfile {
    return this.stored.profile
  }

  async updateProfile(patch: { displayName?: string }): Promise<void> {
    this.stored.profile = { ...this.stored.profile, ...patch }
    await storageWrite(this.storageKey, JSON.stringify(this.stored, null, 2))
  }

  getPeerId(): PeerIdStr {
    return this.stored.peerId
  }

  getPublicKey(): Uint8Array {
    return fromHex(this.stored.publicKeyHex)
  }

  getPrivateKey(): Uint8Array {
    return fromHex(this.stored.privateKeyHex)
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    const s = await sodium()
    const sk = fromHex(this.stored.privateKeyHex)
    return s.crypto_sign_detached(data, sk)
  }

  async encryptForUser(recipientPublicKey: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
    const s = await sodium()
    const senderSk = fromHex(this.stored.privateKeyHex)
    const senderCurveSk = s.crypto_sign_ed25519_sk_to_curve25519(senderSk)
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
    const mySk = fromHex(this.stored.privateKeyHex)
    const myCurveSk = s.crypto_sign_ed25519_sk_to_curve25519(mySk)
    const senderCurvePk = s.crypto_sign_ed25519_pk_to_curve25519(senderPublicKey)
    const nonce = payload.slice(0, s.crypto_box_NONCEBYTES)
    const ciphertext = payload.slice(s.crypto_box_NONCEBYTES)
    return s.crypto_box_open_easy(ciphertext, nonce, senderCurvePk, myCurveSk)
  }

  async #generate(): Promise<void> {
    const s = await sodium()
    console.warn('[LocalIdentity] Private key stored in plaintext. Encrypt in production.')

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

    await storageWrite(this.storageKey, JSON.stringify(this.stored, null, 2))
  }
}
