// src/index.ts
import { createLibp2pNode, PeerRouting, PubSubManager } from "@federation/network";
import { getStorageAdapter, RepoManager } from "@federation/store";

// src/replication-strategy.ts
var TARGET_REPLICAS = 5;
var ReplicationStrategy = class {
  selectReplicaPeers(available, exclude, count = TARGET_REPLICAS) {
    const excludeSet = new Set(exclude.map((p) => p.toString()));
    const candidates = available.filter((p) => !excludeSet.has(p.toString()));
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    return candidates.slice(0, count);
  }
  needsReplication(currentHolders) {
    return currentHolders.length < TARGET_REPLICAS;
  }
};

// src/verification-service.ts
import _sodium from "libsodium-wrappers";
async function getSodium() {
  await _sodium.ready;
  return _sodium;
}
function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
var VerificationService = class {
  constructor(repo) {
    this.repo = repo;
  }
  repo;
  checkpoints = /* @__PURE__ */ new Map();
  async computeCheckpoint(docId) {
    const doc = this.repo.getDocument(docId);
    const json = JSON.stringify(doc);
    const data = new TextEncoder().encode(json);
    const sodium = await getSodium();
    const hashBytes = sodium.crypto_generichash(32, data);
    return toHex(hashBytes);
  }
  async signCheckpoint(hash, privateKey) {
    const sodium = await getSodium();
    const message = new TextEncoder().encode(hash);
    const sig = sodium.crypto_sign_detached(message, privateKey);
    return toHex(sig);
  }
  async verifyCheckpoint(_docId, hash, signature, publicKey) {
    try {
      const sodium = await getSodium();
      const message = new TextEncoder().encode(hash);
      const sig = fromHex(signature);
      return sodium.crypto_sign_verify_detached(sig, message, publicKey);
    } catch {
      return false;
    }
  }
  recordCheckpoint(docId, fromPeerId, checkpointMessage) {
    if (!this.checkpoints.has(docId)) {
      this.checkpoints.set(docId, /* @__PURE__ */ new Map());
    }
    this.checkpoints.get(docId).set(fromPeerId, checkpointMessage);
  }
  async runConsensusCheck(docId) {
    const peerCheckpoints = this.checkpoints.get(docId);
    if (!peerCheckpoints || peerCheckpoints.size === 0) {
      return { valid: true };
    }
    const freq = /* @__PURE__ */ new Map();
    for (const cp of peerCheckpoints.values()) {
      freq.set(cp.hash, (freq.get(cp.hash) ?? 0) + 1);
    }
    const total = peerCheckpoints.size;
    let majorityHash;
    for (const [hash, count] of freq) {
      if (count / total > 0.5) {
        majorityHash = hash;
        break;
      }
    }
    if (!majorityHash) {
      return { valid: true };
    }
    const localHash = await this.computeCheckpoint(docId);
    if (localHash !== majorityHash) {
      return { valid: false, currentHash: majorityHash };
    }
    return { valid: true, currentHash: localHash };
  }
};

// src/sync-engine.ts
import { KeyNotFoundError } from "@federation/store";
var ANNOUNCE_TOPIC = "sync:announce";
var DATA_TOPIC = "sync:data";
var DOC_ID_PREFIX_LEN = 64;
function encodeDocIdPrefix(docId) {
  const padded = docId.padEnd(DOC_ID_PREFIX_LEN, "\0").slice(0, DOC_ID_PREFIX_LEN);
  return new TextEncoder().encode(padded);
}
function decodeDocIdPrefix(bytes) {
  return new TextDecoder().decode(bytes.slice(0, DOC_ID_PREFIX_LEN)).replace(/\0+$/, "");
}
function buildDataMessage(docId, payload) {
  const prefix = encodeDocIdPrefix(docId);
  const msg = new Uint8Array(prefix.length + payload.length);
  msg.set(prefix, 0);
  msg.set(payload, prefix.length);
  return msg;
}
var SyncEngine = class {
  constructor(repo, pubsub, routing, verification, replication, localPeerId) {
    this.repo = repo;
    this.pubsub = pubsub;
    this.routing = routing;
    this.verification = verification;
    this.replication = replication;
    this.localPeerId = localPeerId;
  }
  repo;
  pubsub;
  routing;
  verification;
  replication;
  localPeerId;
  inFlight = /* @__PURE__ */ new Set();
  heartbeatTimer = null;
  start() {
    this.pubsub.subscribe(ANNOUNCE_TOPIC, (msg, _from) => {
      void this.#handleAnnounce(msg);
    });
    this.pubsub.subscribe(DATA_TOPIC, (msg, _from) => {
      void this.#handleData(msg);
    });
    this.heartbeatTimer = setInterval(() => {
      void this.announceAllInterests();
    }, 3e4);
  }
  async stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.pubsub.unsubscribe(ANNOUNCE_TOPIC);
    this.pubsub.unsubscribe(DATA_TOPIC);
  }
  async syncDocument(docId, targetPeers) {
    if (this.inFlight.has(docId)) return;
    this.inFlight.add(docId);
    try {
      const peers = targetPeers ?? await this.routing.findClosestPeers(docId, 5);
      let encryptedState;
      try {
        encryptedState = await this.repo.getEncryptedSyncState(docId);
      } catch (err) {
        if (err instanceof KeyNotFoundError) {
          console.warn(`[SyncEngine] No key for doc ${docId}, skipping sync`);
          return;
        }
        throw err;
      }
      const message = buildDataMessage(docId, encryptedState);
      await this.pubsub.publish(DATA_TOPIC, message);
      for (const peer of peers) {
        try {
          await this.pubsub.publish(`sync:data:${peer.toString()}`, message);
        } catch {
        }
      }
      const announceMsg = new TextEncoder().encode(
        JSON.stringify({ docId, peerId: this.localPeerId })
      );
      await this.pubsub.publish(ANNOUNCE_TOPIC, announceMsg);
    } finally {
      this.inFlight.delete(docId);
    }
  }
  async announceAllInterests() {
    await this.routing.advertiseSelf();
    const docIds = this.repo.listDocumentIds();
    for (const docId of docIds) {
      const announceMsg = new TextEncoder().encode(
        JSON.stringify({ docId, peerId: this.localPeerId })
      );
      try {
        await this.pubsub.publish(ANNOUNCE_TOPIC, announceMsg);
      } catch {
      }
    }
  }
  async #handleAnnounce(msg) {
    try {
      const { docId } = JSON.parse(new TextDecoder().decode(msg));
      const localDocIds = this.repo.listDocumentIds();
      if (localDocIds.includes(docId)) {
        await this.syncDocument(docId);
      }
    } catch {
    }
  }
  async #handleData(msg) {
    if (msg.length <= DOC_ID_PREFIX_LEN) return;
    const docId = decodeDocIdPrefix(msg);
    const encryptedPayload = msg.slice(DOC_ID_PREFIX_LEN);
    try {
      await this.repo.receiveEncryptedSyncState(docId, encryptedPayload);
    } catch (err) {
      if (err instanceof KeyNotFoundError) {
        return;
      }
      console.warn(`[SyncEngine] Failed to decrypt sync payload for doc ${docId}:`, err);
    }
  }
};

// src/state-machine.ts
var StateMachine = class {
  constructor(syncEngine) {
    this.syncEngine = syncEngine;
  }
  syncEngine;
  state = "offline";
  pendingDocs = /* @__PURE__ */ new Set();
  getState() {
    return this.state;
  }
  async goOnline() {
    this.state = "connecting";
    this.syncEngine.start();
    this.state = "idle";
    await this.processQueue();
  }
  async goOffline() {
    this.state = "offline";
    await this.syncEngine.stop();
  }
  queueSync(docId) {
    this.pendingDocs.add(docId);
    if (this.state === "idle") {
      void this.processQueue();
    }
  }
  async processQueue() {
    if (this.pendingDocs.size === 0) return;
    this.state = "syncing";
    const batch = Array.from(this.pendingDocs);
    for (const docId of batch) {
      try {
        await this.syncEngine.syncDocument(docId);
        this.pendingDocs.delete(docId);
      } catch (err) {
        console.warn(`[StateMachine] Failed to sync doc ${docId}:`, err);
      }
    }
    this.state = "idle";
  }
};

// src/index.ts
var WorkspaceFederation = class {
  node;
  repo;
  pubsub;
  routing;
  verification;
  replication;
  syncEngine;
  stateMachine;
  initialized = false;
  async initialize(config) {
    const { dataDir, platform, bootstrapPeers = [], listenAddresses, nodeRole } = config;
    this.node = await createLibp2pNode({ bootstrapPeers, listenAddresses, nodeRole });
    await this.node.start();
    const storageAdapter = await getStorageAdapter(platform, dataDir);
    this.repo = new RepoManager(storageAdapter, platform);
    this.pubsub = new PubSubManager(this.node);
    this.routing = new PeerRouting(this.node);
    this.replication = new ReplicationStrategy();
    this.verification = new VerificationService(this.repo);
    const localPeerId = this.node.peerId.toString();
    this.syncEngine = new SyncEngine(
      this.repo,
      this.pubsub,
      this.routing,
      this.verification,
      this.replication,
      localPeerId
    );
    this.stateMachine = new StateMachine(this.syncEngine);
    this.initialized = true;
  }
  async createDocument(initialData) {
    this.#assertInitialized();
    const docId = await this.repo.createDocument(initialData);
    this.stateMachine.queueSync(docId);
    return docId;
  }
  getDocument(docId) {
    this.#assertInitialized();
    return this.repo.getDocument(docId);
  }
  async updateDocument(docId, updater) {
    this.#assertInitialized();
    await this.repo.updateDocument(docId, updater);
    this.stateMachine.queueSync(docId);
  }
  async startSync() {
    this.#assertInitialized();
    await this.stateMachine.goOnline();
  }
  async stopSync() {
    this.#assertInitialized();
    await this.stateMachine.goOffline();
  }
  getSyncState() {
    this.#assertInitialized();
    return this.stateMachine.getState();
  }
  getPeersForDocument(docId) {
    this.#assertInitialized();
    return this.routing.getPeersForTopic(`sync:data:${docId}`).map((p) => p.toString());
  }
  async verifyDocument(docId) {
    this.#assertInitialized();
    return this.verification.runConsensusCheck(docId);
  }
  async shutdown() {
    if (!this.initialized) return;
    await this.stateMachine.goOffline();
    await this.repo.flush();
    await this.node.stop();
  }
  /** Expose repo for advanced use (e.g. tests) */
  getRepo() {
    return this.repo;
  }
  /** Expose the libp2p node (e.g. for multiaddr inspection in tests) */
  getNode() {
    return this.node;
  }
  /** Expose pubsub manager for group DM topics */
  getPubSub() {
    this.#assertInitialized();
    return this.pubsub;
  }
  /**
   * Returns the multiaddrs this node is listening on.
   * Desktop/server nodes include TCP and WebSocket addresses that browser clients
   * can use to connect directly. Browsers get /webrtc circuit-relay addresses.
   */
  getListenAddresses() {
    this.#assertInitialized();
    return this.node.getMultiaddrs().map((ma) => ma.toString());
  }
  /** Local peer ID string */
  getPeerId() {
    this.#assertInitialized();
    return this.node.peerId.toString();
  }
  /** Number of currently connected peers. */
  getPeerCount() {
    this.#assertInitialized();
    return this.node.getPeers().length;
  }
  /**
   * Subscribe to peer connect/disconnect events.
   * Returns an unsubscribe function.
   */
  onPeerCountChange(callback) {
    this.#assertInitialized();
    const emit = () => callback(this.node.getPeers().length);
    this.node.addEventListener("peer:connect", emit);
    this.node.addEventListener("peer:disconnect", emit);
    return () => {
      this.node.removeEventListener("peer:connect", emit);
      this.node.removeEventListener("peer:disconnect", emit);
    };
  }
  #assertInitialized() {
    if (!this.initialized) throw new Error("WorkspaceFederation not initialized. Call initialize() first.");
  }
};
export {
  ReplicationStrategy,
  StateMachine,
  SyncEngine,
  VerificationService,
  WorkspaceFederation
};
