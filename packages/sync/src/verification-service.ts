import _sodium from 'libsodium-wrappers'
import type { CheckpointMessage, DocumentId, PeerIdStr } from '@federation/types'
import type { RepoManager } from '@federation/store'

async function getSodium() {
  await _sodium.ready
  return _sodium
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

export class VerificationService {
  private readonly checkpoints = new Map<DocumentId, Map<PeerIdStr, CheckpointMessage>>()

  constructor(private readonly repo: RepoManager) {}

  async computeCheckpoint(docId: DocumentId): Promise<string> {
    const doc = this.repo.getDocument(docId)
    const json = JSON.stringify(doc)
    const data = new TextEncoder().encode(json)
    const sodium = await getSodium()
    const hashBytes = sodium.crypto_generichash(32, data)
    return toHex(hashBytes)
  }

  async signCheckpoint(hash: string, privateKey: Uint8Array): Promise<string> {
    const sodium = await getSodium()
    const message = new TextEncoder().encode(hash)
    const sig = sodium.crypto_sign_detached(message, privateKey)
    return toHex(sig)
  }

  async verifyCheckpoint(
    _docId: DocumentId,
    hash: string,
    signature: string,
    publicKey: Uint8Array,
  ): Promise<boolean> {
    try {
      const sodium = await getSodium()
      const message = new TextEncoder().encode(hash)
      const sig = fromHex(signature)
      return sodium.crypto_sign_verify_detached(sig, message, publicKey)
    } catch {
      return false
    }
  }

  recordCheckpoint(docId: DocumentId, fromPeerId: PeerIdStr, checkpointMessage: CheckpointMessage): void {
    if (!this.checkpoints.has(docId)) {
      this.checkpoints.set(docId, new Map())
    }
    this.checkpoints.get(docId)!.set(fromPeerId, checkpointMessage)
  }

  async runConsensusCheck(docId: DocumentId): Promise<{ valid: boolean; currentHash?: string }> {
    const peerCheckpoints = this.checkpoints.get(docId)
    if (!peerCheckpoints || peerCheckpoints.size === 0) {
      return { valid: true }
    }

    // Count hash frequencies
    const freq = new Map<string, number>()
    for (const cp of peerCheckpoints.values()) {
      freq.set(cp.hash, (freq.get(cp.hash) ?? 0) + 1)
    }

    const total = peerCheckpoints.size
    let majorityHash: string | undefined

    for (const [hash, count] of freq) {
      if (count / total > 0.5) {
        majorityHash = hash
        break
      }
    }

    if (!majorityHash) {
      // No majority — can't determine truth
      return { valid: true }
    }

    const localHash = await this.computeCheckpoint(docId)
    if (localHash !== majorityHash) {
      return { valid: false, currentHash: majorityHash }
    }

    return { valid: true, currentHash: localHash }
  }
}
