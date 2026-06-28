import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.federated.workspace',
  appName: 'Federated Workspace',
  webDir: 'dist',
  // On Android, allow cleartext for local dev; production uses HTTPS
  android: {
    allowMixedContent: false,
  },
  server: {
    // Remove this block for production; here for local testing convenience
    // androidScheme: 'https',
  },
}

export default config
