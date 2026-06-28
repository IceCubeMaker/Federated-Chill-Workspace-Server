# Federated Workspace

Private, end-to-end encrypted, peer-to-peer collaborative workspace. No central server required.

## Running the app

### Web / PWA (works on mobile too)

```bash
pnpm install
pnpm --filter @federation/app-web dev
```

Open `http://localhost:5173` in any browser.  
On mobile: open the URL, tap **Share → Add to Home Screen** to install as a PWA.

### Desktop (native — Windows / macOS / Linux)

Requires [Rust](https://rustup.rs) and the [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites).

```bash
pnpm --filter @federation/app-desktop dev   # dev mode
pnpm --filter @federation/app-desktop build # produces .exe / .dmg / .AppImage
```

## Package layout

```
packages/
  types/       @federation/types       — shared DTOs
  models/      @federation/models      — group/role/permission schemas
  network/     @federation/network     — libp2p node (DHT, Gossipsub, mDNS)
  store/       @federation/store       — Automerge repo + XChaCha20 crypto
  sync/        @federation/sync        — P2P sync engine + state machine
  auth/        @federation/auth        — Ed25519 identity, asymmetric encryption
  groups/      @federation/groups      — group management, key distribution
  permissions/ @federation/permissions — permission engine
  app/         @federation/app         — FederatedWorkspace (full stack)
  ui/          @federation/ui          — design system + React components
  app-web/     @federation/app-web     — Vite + React PWA
  app-desktop/ @federation/app-desktop — Tauri desktop shell
```

## Architecture

Every node is a full P2P peer. Peers discover each other via:
1. **mDNS** — zero-config on local network (Node.js only)
2. **IPFS DHT** (`/ipfs/kad/1.0.0`) — global discovery with no dedicated server
3. **Bootstrap peers** — configurable fallback list

All sync payloads are encrypted with XChaCha20-Poly1305 before transmission.  
Group data is encrypted with a per-group symmetric key, distributed to members via asymmetric (Ed25519 → Curve25519) box encryption.
