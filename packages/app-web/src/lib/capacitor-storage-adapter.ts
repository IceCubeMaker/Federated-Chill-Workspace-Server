import { Filesystem, Directory } from '@capacitor/filesystem'
import type { StorageAdapterInterface, Chunk } from '@federation/store'

type StorageKey = string[]

// Keys like ['docId', 'incremental', 'hash'] → stored as
//   FederatedWorkspace/automerge/docId/incremental/hash.bin
// using native directory structure so files are browsable via USB.

const ROOT = Directory.External

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
    try {
      const { data } = await Filesystem.readFile({ path: pathFor(this.base, key), directory: ROOT })
      return b64ToU8(data as string)
    } catch {
      return undefined
    }
  }

  async save(key: StorageKey, data: Uint8Array): Promise<void> {
    await Filesystem.writeFile({
      path: pathFor(this.base, key),
      data: u8ToB64(data),
      directory: ROOT,
      recursive: true,
    })
  }

  async remove(key: StorageKey): Promise<void> {
    try {
      await Filesystem.deleteFile({ path: pathFor(this.base, key), directory: ROOT })
    } catch { /* already gone */ }
  }

  async loadRange(keyPrefix: StorageKey): Promise<Chunk[]> {
    return this.#readDir(dirFor(this.base, keyPrefix), keyPrefix)
  }

  async removeRange(keyPrefix: StorageKey): Promise<void> {
    try {
      await Filesystem.rmdir({ path: dirFor(this.base, keyPrefix), directory: ROOT, recursive: true })
    } catch { /* already gone */ }
  }

  async #readDir(dirPath: string, keyPrefix: StorageKey): Promise<Chunk[]> {
    let files: Array<{ name: string; type?: string }>
    try {
      const result = await Filesystem.readdir({ path: dirPath, directory: ROOT })
      files = result.files as Array<{ name: string; type?: string }>
    } catch {
      return []
    }

    const results: Chunk[] = []
    for (const f of files) {
      const isDir = f.type === 'directory' || !f.name.includes('.')
      if (isDir) {
        const sub = await this.#readDir(`${dirPath}/${f.name}`, [...keyPrefix, f.name])
        results.push(...sub)
      } else if (f.name.endsWith('.bin')) {
        const key = [...keyPrefix, f.name.slice(0, -4)] as StorageKey
        const data = await this.load(key)
        results.push({ key, data })
      }
    }
    return results
  }
}
