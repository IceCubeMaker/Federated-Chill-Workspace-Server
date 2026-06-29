import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import type { IdentityStorageProvider } from '@federation/auth'

const IDENTITY_PATH = 'FederatedWorkspace/identity.json'

// localStorage key used before external storage — migrated on first load.
const LEGACY_LS_KEY = 'federation-workspace:identity'

type Dir = typeof Directory.External | typeof Directory.Documents

// Ordered list of candidate directories: external first (survives reinstall),
// internal Documents as fallback (always available).
const DIRS: Dir[] = [Directory.External, Directory.Documents]

function ls(): { getItem(k: string): string | null; setItem(k: string, v: string): void } | null {
  const g = globalThis as Record<string, unknown>
  return (typeof g['localStorage'] !== 'undefined' ? g['localStorage'] : null) as ReturnType<typeof ls>
}

async function fsRead(dir: Dir): Promise<string | null> {
  try {
    const { data } = await Filesystem.readFile({ path: IDENTITY_PATH, directory: dir, encoding: Encoding.UTF8 })
    return (data as string) ?? null
  } catch {
    return null
  }
}

async function fsWrite(value: string, dir: Dir): Promise<boolean> {
  try {
    await Filesystem.writeFile({ path: IDENTITY_PATH, data: value, directory: dir, encoding: Encoding.UTF8, recursive: true })
    return true
  } catch {
    return false
  }
}

export function createCapacitorIdentityStorage(): IdentityStorageProvider {
  return {
    async load(): Promise<string | null> {
      // Try each filesystem location in order.
      for (const dir of DIRS) {
        const data = await fsRead(dir)
        if (data) return data
      }

      // Not found in filesystem — check localStorage for migration from pre-external-storage builds.
      const legacy = ls()?.getItem(LEGACY_LS_KEY) ?? null
      if (legacy) {
        // Best-effort migration to first working filesystem location.
        for (const dir of DIRS) {
          if (await fsWrite(legacy, dir)) break
        }
      }
      return legacy
    },

    async save(value: string): Promise<void> {
      // Write to first available filesystem location; last resort: localStorage.
      for (const dir of DIRS) {
        if (await fsWrite(value, dir)) return
      }
      ls()?.setItem(LEGACY_LS_KEY, value)
    },
  }
}
