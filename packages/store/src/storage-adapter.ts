import type { StorageAdapter } from '@automerge/automerge-repo'

export type Platform = 'node' | 'browser'

export async function getStorageAdapter(platform: Platform, dataDir?: string): Promise<StorageAdapter> {
  if (platform === 'node') {
    const { NodeFSStorageAdapter } = await import('@automerge/automerge-repo-storage-nodefs')
    return new NodeFSStorageAdapter(dataDir ?? './data')
  } else {
    const { IndexedDBStorageAdapter } = await import('@automerge/automerge-repo-storage-indexeddb')
    return new IndexedDBStorageAdapter('workspace-db')
  }
}
