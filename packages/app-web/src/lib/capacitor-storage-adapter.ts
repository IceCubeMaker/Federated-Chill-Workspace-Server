import { Filesystem, Directory } from '@capacitor/filesystem'
import type { StorageAdapterInterface, Chunk } from '@federation/store'

type StorageKey = string[]

// Keys like ['docId', 'incremental', 'hash'] → stored as
//   FederatedWorkspace/automerge/docId/incremental/hash.bin
// External first (survives reinstall); silently falls back to Documents (always available).

const DIRS = [Directory.External, Directory.Documents] as const

function pathFor(base: string, key: StorageKey): string {
  return `${base}/${key.join('/')}.bin`
}

function dirFor(base: string, prefix: StorageKey): string {
  return prefix.length ? `${base}/${prefix.join('/')}` : base
}

function b64ToU8(b64: string): Uint8Array {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

function u8ToB64(arr: Uint8Array): string {
  let bin = ''
  arr.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin)
}

export class CapacitorStorageAdapter implements StorageAdapterInterface {
  constructor(private readonly base: string = 'FederatedWorkspace/automerge') {}

  async load(key: StorageKey): Promise<Uint8Array | undefined> {
    for (const dir of DIRS) {
      try {
        const { data } = await Filesystem.readFile({ path: pathFor(this.base, key), directory: dir })
        if (data) return b64ToU8(data as string)
      } catch { /* try next */ }
    }
    return undefined
  }

  async save(key: StorageKey, data: Uint8Array): Promise<void> {
    for (const dir of DIRS) {
      try {
        await Filesystem.writeFile({ path: pathFor(this.base, key), data: u8ToB64(data), directory: dir, recursive: true })
        return
      } catch { /* try next */ }
    }
    // Both directories unavailable — data will re-sync from peers.
  }

  async remove(key: StorageKey): Promise<void> {
    for (const dir of DIRS) {
      try { await Filesystem.deleteFile({ path: pathFor(this.base, key), directory: dir }) } catch { /* ok */ }
    }
  }

  async loadRange(keyPrefix: StorageKey): Promise<Chunk[]> {
    // Try each directory and merge unique keys (prefer External over Documents).
    const seen = new Set<string>()
    const results: Chunk[] = []
    for (const dir of DIRS) {
      const chunks = await this.#readDir(dirFor(this.base, keyPrefix), keyPrefix, dir)
      for (const chunk of chunks) {
        const k = chunk.key.join('/')
        if (!seen.has(k)) { seen.add(k); results.push(chunk) }
      }
    }
    return results
  }

  async removeRange(keyPrefix: StorageKey): Promise<void> {
    for (const dir of DIRS) {
      try { await Filesystem.rmdir({ path: dirFor(this.base, keyPrefix), directory: dir, recursive: true }) } catch { /* ok */ }
    }
  }

  async #readDir(dirPath: string, keyPrefix: StorageKey, dir: typeof DIRS[number]): Promise<Chunk[]> {
    let files: Array<{ name: string; type?: string }>
    try {
      const result = await Filesystem.readdir({ path: dirPath, directory: dir })
      files = result.files as Array<{ name: string; type?: string }>
    } catch {
      return []
    }

    const results: Chunk[] = []
    for (const f of files) {
      const isDir = f.type === 'directory' || !f.name.includes('.')
      if (isDir) {
        const sub = await this.#readDir(`${dirPath}/${f.name}`, [...keyPrefix, f.name], dir)
        results.push(...sub)
      } else if (f.name.endsWith('.bin')) {
        const key = [...keyPrefix, f.name.slice(0, -4)] as StorageKey
        try {
          const { data } = await Filesystem.readFile({ path: `${dirPath}/${f.name}`, directory: dir })
          results.push({ key, data: data ? b64ToU8(data as string) : undefined })
        } catch {
          results.push({ key, data: undefined })
        }
      }
    }
    return results
  }
}
