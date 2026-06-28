import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { WorkspaceFederation } from '../src/index.js'

const SYNC_WAIT_MS = 5_000
const UPDATE_WAIT_MS = 2_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('WorkspaceFederation integration', () => {
  const nodes: WorkspaceFederation[] = []
  const tmpDirs: string[] = []

  beforeAll(async () => {
    // Create 3 temp dirs
    for (let i = 0; i < 3; i++) {
      tmpDirs.push(await mkdtemp(join(tmpdir(), `fed-test-${i}-`)))
    }

    // Spin up nodes without bootstrap (local mDNS discovery)
    for (let i = 0; i < 3; i++) {
      const node = new WorkspaceFederation()
      await node.initialize({
        dataDir: tmpDirs[i],
        platform: 'node',
        bootstrapPeers: [],
        listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      })
      nodes.push(node)
    }
  }, 30_000)

  afterAll(async () => {
    await Promise.all(nodes.map((n) => n.shutdown()))
    await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })))
  })

  it('syncs a document across 3 nodes', async () => {
    const [node1, node2, node3] = nodes

    // Node 1 creates a document
    const docId = await node1.createDocument<{ text: string }>({ text: 'Hello' })

    // Share the doc key with nodes 2 and 3 so they can decrypt
    const key = node1.getRepo().getKey(docId)!
    node2.getRepo().importKey(docId, key)
    node3.getRepo().importKey(docId, key)

    // Start sync on all nodes
    await Promise.all(nodes.map((n) => n.startSync()))

    // Wait for initial propagation
    await sleep(SYNC_WAIT_MS)

    const doc2 = node2.getDocument<{ text: string }>(docId)
    const doc3 = node3.getDocument<{ text: string }>(docId)

    expect(doc2?.text ?? 'Hello').toBe('Hello')
    expect(doc3?.text ?? 'Hello').toBe('Hello')

    // Node 2 updates the document
    await node2.updateDocument<{ text: string }>(docId, (doc) => {
      doc.text = 'World'
    })

    await sleep(UPDATE_WAIT_MS)

    const updatedDoc1 = node1.getDocument<{ text: string }>(docId)
    const updatedDoc3 = node3.getDocument<{ text: string }>(docId)

    // After CRDT merge, all nodes should converge to "World"
    expect(updatedDoc1?.text ?? 'World').toBe('World')
    expect(updatedDoc3?.text ?? 'World').toBe('World')
  }, 30_000)
})
