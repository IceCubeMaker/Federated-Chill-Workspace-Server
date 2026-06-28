import type { StorageAdapter } from '@automerge/automerge-repo'

export type Platform = 'node' | 'browser'

export async function getStorageAdapter(platform: Platform, dataDir?: string): Promise<StorageAdapter> {
  if (platform === 'node') {
    // vite-ignore: Node.js-only module, never bundled for browser
    const { NodeFSStorageAdapter } = await import(/* @vite-ignore */ '@automerge/automerge-repo-storage-nodefs')
    return new NodeFSStorageAdapter(dataDir ?? './data')
  } else {
    const { IndexedDBStorageAdapter } = await import('@automerge/automerge-repo-storage-indexeddb')
    return new IndexedDBStorageAdapter('workspace-db')
  }
}
