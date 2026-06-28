import type { SyncState, DocumentId } from '@federation/types'
import type { SyncEngine } from './sync-engine.js'

export class StateMachine {
  private state: SyncState = 'offline'
  private readonly pendingDocs = new Set<DocumentId>()

  constructor(private readonly syncEngine: SyncEngine) {}

  getState(): SyncState {
    return this.state
  }

  async goOnline(): Promise<void> {
    this.state = 'connecting'
    this.syncEngine.start()
    this.state = 'idle'
    await this.processQueue()
  }

  async goOffline(): Promise<void> {
    this.state = 'offline'
    await this.syncEngine.stop()
  }

  queueSync(docId: DocumentId): void {
    this.pendingDocs.add(docId)
    if (this.state === 'idle') {
      void this.processQueue()
    }
  }

  async processQueue(): Promise<void> {
    if (this.pendingDocs.size === 0) return

    this.state = 'syncing'
    const batch = Array.from(this.pendingDocs)

    for (const docId of batch) {
      try {
        await this.syncEngine.syncDocument(docId)
        this.pendingDocs.delete(docId)
      } catch (err) {
        console.warn(`[StateMachine] Failed to sync doc ${docId}:`, err)
      }
    }

    this.state = 'idle'
  }
}
