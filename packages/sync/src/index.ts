import type { Libp2p } from '@libp2p/interface'
import type { SyncState, DocumentId } from '@federation/types'
import type { Platform } from '@federation/store'
import { createLibp2pNode, PeerRouting, PubSubManager } from '@federation/network'
import { getStorageAdapter, RepoManager } from '@federation/store'
import { ReplicationStrategy } from './replication-strategy.js'
import { VerificationService } from './verification-service.js'
import { SyncEngine } from './sync-engine.js'
import { StateMachine } from './state-machine.js'

export { ReplicationStrategy } from './replication-strategy.js'
export { VerificationService } from './verification-service.js'
export { SyncEngine } from './sync-engine.js'
export { StateMachine } from './state-machine.js'

export interface FederationConfig {
  dataDir?: string
  platform: Platform
  bootstrapPeers?: string[]
  listenAddresses?: string[]
}

export class WorkspaceFederation {
  private node!: Libp2p
  private repo!: RepoManager
  private pubsub!: PubSubManager
  private routing!: PeerRouting
  private verification!: VerificationService
  private replication!: ReplicationStrategy
  private syncEngine!: SyncEngine
  private stateMachine!: StateMachine
  private initialized = false

  async initialize(config: FederationConfig): Promise<void> {
    const { dataDir, platform, bootstrapPeers = [], listenAddresses } = config

    // 1. Network layer
    this.node = await createLibp2pNode({ bootstrapPeers, listenAddresses })
    await this.node.start()

    // 2. Store layer
    const storageAdapter = await getStorageAdapter(platform, dataDir)
    this.repo = new RepoManager(storageAdapter, platform)

    // 3. Services
    this.pubsub = new PubSubManager(this.node)
    this.routing = new PeerRouting(this.node)
    this.replication = new ReplicationStrategy()
    this.verification = new VerificationService(this.repo)

    // 4. Sync orchestration
    const localPeerId = this.node.peerId.toString()
    this.syncEngine = new SyncEngine(
      this.repo,
      this.pubsub,
      this.routing,
      this.verification,
      this.replication,
      localPeerId,
    )

    // 5. State machine
    this.stateMachine = new StateMachine(this.syncEngine)

    this.initialized = true
  }

  async createDocument<T>(initialData: T): Promise<DocumentId> {
    this.#assertInitialized()
    const docId = await this.repo.createDocument(initialData)
    this.stateMachine.queueSync(docId)
    return docId
  }

  getDocument<T>(docId: DocumentId): T {
    this.#assertInitialized()
    return this.repo.getDocument<T>(docId) as T
  }

  async updateDocument<T>(docId: DocumentId, updater: (doc: T) => void): Promise<void> {
    this.#assertInitialized()
    await this.repo.updateDocument<T>(docId, updater)
    this.stateMachine.queueSync(docId)
  }

  async startSync(): Promise<void> {
    this.#assertInitialized()
    await this.stateMachine.goOnline()
  }

  async stopSync(): Promise<void> {
    this.#assertInitialized()
    await this.stateMachine.goOffline()
  }

  getSyncState(): SyncState {
    this.#assertInitialized()
    return this.stateMachine.getState()
  }

  getPeersForDocument(docId: DocumentId): string[] {
    this.#assertInitialized()
    return this.routing.getPeersForTopic(`sync:data:${docId}`).map((p) => p.toString())
  }

  async verifyDocument(docId: DocumentId): Promise<{ valid: boolean; currentHash?: string }> {
    this.#assertInitialized()
    return this.verification.runConsensusCheck(docId)
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return
    await this.stateMachine.goOffline()
    await this.repo.flush()
    await this.node.stop()
  }

  /** Expose repo for advanced use (e.g. tests) */
  getRepo(): RepoManager {
    return this.repo
  }

  /** Expose the libp2p node (e.g. for multiaddr inspection in tests) */
  getNode(): Libp2p {
    return this.node
  }

  #assertInitialized(): void {
    if (!this.initialized) throw new Error('WorkspaceFederation not initialized. Call initialize() first.')
  }
}
