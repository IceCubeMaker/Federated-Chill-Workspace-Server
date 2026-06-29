import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import type { IdentityStorageProvider } from '@federation/auth'

const IDENTITY_PATH = 'FederatedWorkspace/identity.json'

// localStorage key used before we introduced external storage — migrated on first load.
const LEGACY_LS_KEY = 'federation-workspace:identity'

const ROOT = Directory.External

export function createCapacitorIdentityStorage(): IdentityStorageProvider {
  return {
    async load(): Promise<string | null> {
      try {
        const { data } = await Filesystem.readFile({ path: IDENTITY_PATH, directory: ROOT, encoding: Encoding.UTF8 })
        return data as string
      } catch {
        // Not in external storage yet — check localStorage for migration.
        const ls = (globalThis as Record<string, unknown>)['localStorage'] as
          | { getItem(k: string): string | null }
          | undefined
        const legacy = ls?.getItem(LEGACY_LS_KEY) ?? null
        if (legacy) {
          // Migrate to external storage so future reads come from here.
          await Filesystem.writeFile({
            path: IDENTITY_PATH,
            data: legacy,
            directory: ROOT,
            encoding: Encoding.UTF8,
            recursive: true,
          })
        }
        return legacy
      }
    },

    async save(value: string): Promise<void> {
      await Filesystem.writeFile({
        path: IDENTITY_PATH,
        data: value,
        directory: ROOT,
        encoding: Encoding.UTF8,
        recursive: true,
      })
    },
  }
}
