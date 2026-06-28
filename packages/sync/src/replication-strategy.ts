import type { PeerId } from '@libp2p/interface'

export const TARGET_REPLICAS = 5

export class ReplicationStrategy {
  selectReplicaPeers(available: PeerId[], exclude: PeerId[], count = TARGET_REPLICAS): PeerId[] {
    const excludeSet = new Set(exclude.map((p) => p.toString()))
    const candidates = available.filter((p) => !excludeSet.has(p.toString()))

    // Fisher-Yates shuffle
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
    }

    return candidates.slice(0, count)
  }

  needsReplication(currentHolders: PeerId[]): boolean {
    return currentHolders.length < TARGET_REPLICAS
  }
}
