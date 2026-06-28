import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import _sodium from 'libsodium-wrappers'
import { v4 as uuidv4 } from 'uuid'
import type { UserProfile } from '@federation/models'
import type { PeerIdStr } from '@federation/models'

async function sodium() {
  await _sodium.ready
  return _sodium
}

function toHex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex')
}

function fromHex(h: string): Uint8Array {
  return new Uint8Array(Buffer.from(h, 'hex'))
}

interface StoredIdentity {
  peerId: PeerIdStr
  publicKeyHex: string
  /** PHASE 1: stored in plaintext. Phase 2 will encrypt with browser-passworder. */
  privateKeyHex: string
  profile: UserProfile
}

export class LocalIdentity {
  private stored!: StoredIdentity
  private readonly identityPath: string

  constructor(dataDir: string) {
    this.identityPath = join(dataDir, 'identity.json')
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.identityPath, 'utf8')
      this.stored = JSON.parse(raw) as StoredIdentity
    } catch {
      await this.#generate()
    }
  }

  getProfile(): UserProfile {
    return this.stored.profile
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
    // Convert Ed25519 keys to Curve25519 for box encryption
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
    // PHASE 1 warning
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

    await mkdir(this.identityPath.replace('/identity.json', ''), { recursive: true })
    await writeFile(this.identityPath, JSON.stringify(this.stored, null, 2), 'utf8')
  }
}
