import _sodium from 'libsodium-wrappers'

async function getSodium() {
  await _sodium.ready
  return _sodium
}

export class DocumentCrypto {
  static async generateKey(): Promise<Uint8Array> {
    const sodium = await getSodium()
    return sodium.crypto_aead_xchacha20poly1305_ietf_keygen()
  }

  static async encrypt(
    plaintext: Uint8Array,
    key: Uint8Array,
    additionalData?: Uint8Array,
  ): Promise<Uint8Array> {
    const sodium = await getSodium()
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintext,
      additionalData ?? null,
      null,
      nonce,
      key,
    )
    // Prepend 24-byte nonce to ciphertext
    const result = new Uint8Array(nonce.length + ciphertext.length)
    result.set(nonce, 0)
    result.set(ciphertext, nonce.length)
    return result
  }

  static async decrypt(
    payload: Uint8Array,
    key: Uint8Array,
    additionalData?: Uint8Array,
  ): Promise<Uint8Array> {
    const sodium = await getSodium()
    const nonceLen = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    const nonce = payload.slice(0, nonceLen)
    const ciphertext = payload.slice(nonceLen)
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      additionalData ?? null,
      nonce,
      key,
    )
  }

  static async deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
    const sodium = await getSodium()
    return sodium.crypto_pwhash(
      sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
      password,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_MODERATE,
      sodium.crypto_pwhash_MEMLIMIT_MODERATE,
      sodium.crypto_pwhash_ALG_DEFAULT,
    )
  }
}
