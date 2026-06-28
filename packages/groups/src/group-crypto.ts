import _sodium from 'libsodium-wrappers'

async function sodium() {
  await _sodium.ready
  return _sodium
}

export class GroupCrypto {
  static async generateGroupKey(): Promise<Uint8Array> {
    const s = await sodium()
    return s.crypto_aead_xchacha20poly1305_ietf_keygen()
  }

  static async encryptGroupKey(
    groupKey: Uint8Array,
    recipientPublicKey: Uint8Array,
    senderPrivateKey: Uint8Array,
  ): Promise<Uint8Array> {
    const s = await sodium()
    const senderCurveSk = s.crypto_sign_ed25519_sk_to_curve25519(senderPrivateKey)
    const recipientCurvePk = s.crypto_sign_ed25519_pk_to_curve25519(recipientPublicKey)
    const nonce = s.randombytes_buf(s.crypto_box_NONCEBYTES)
    const ct = s.crypto_box_easy(groupKey, nonce, recipientCurvePk, senderCurveSk)
    const out = new Uint8Array(nonce.length + ct.length)
    out.set(nonce)
    out.set(ct, nonce.length)
    return out
  }

  static async decryptGroupKey(
    encryptedKey: Uint8Array,
    senderPublicKey: Uint8Array,
    recipientPrivateKey: Uint8Array,
  ): Promise<Uint8Array> {
    const s = await sodium()
    const recipientCurveSk = s.crypto_sign_ed25519_sk_to_curve25519(recipientPrivateKey)
    const senderCurvePk = s.crypto_sign_ed25519_pk_to_curve25519(senderPublicKey)
    const nonce = encryptedKey.slice(0, s.crypto_box_NONCEBYTES)
    const ct = encryptedKey.slice(s.crypto_box_NONCEBYTES)
    return s.crypto_box_open_easy(ct, nonce, senderCurvePk, recipientCurveSk)
  }

  /** Encrypt arbitrary data with the group symmetric key (XChaCha20-Poly1305). */
  static async encrypt(plaintext: Uint8Array, groupKey: Uint8Array): Promise<Uint8Array> {
    const s = await sodium()
    const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
    const ct = s.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, null, null, nonce, groupKey)
    const out = new Uint8Array(nonce.length + ct.length)
    out.set(nonce)
    out.set(ct, nonce.length)
    return out
  }

  static async decrypt(payload: Uint8Array, groupKey: Uint8Array): Promise<Uint8Array> {
    const s = await sodium()
    const nonceLen = s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    const nonce = payload.slice(0, nonceLen)
    const ct = payload.slice(nonceLen)
    return s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ct, null, nonce, groupKey)
  }
}
