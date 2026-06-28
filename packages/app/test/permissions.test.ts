import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { LocalIdentity } from '@federation/auth'
import { FederatedWorkspace } from '../src/index.js'

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

interface TestNode {
  workspace: FederatedWorkspace
  identity: LocalIdentity
  tmpDir: string
}

async function makeNode(index: number): Promise<TestNode> {
  const tmpDir = await mkdtemp(join(tmpdir(), `fed-perm-${index}-`))
  const identity = new LocalIdentity(tmpDir)
  await identity.load()
  const workspace = new FederatedWorkspace(identity)
  await workspace.initialize({
    platform: 'node',
    dataDir: tmpDir,
    bootstrapPeers: [],
    listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
  })
  return { workspace, identity, tmpDir }
}

describe('Permissions integration', () => {
  let alice: TestNode
  let bob: TestNode
  let charlie: TestNode
  let groupId: string

  beforeAll(async () => {
    ;[alice, bob, charlie] = await Promise.all([makeNode(0), makeNode(1), makeNode(2)])
  }, 30_000)

  afterAll(async () => {
    await Promise.all([alice, bob, charlie].map((n) => n.workspace.shutdown()))
    await Promise.all([alice, bob, charlie].map((n) => rm(n.tmpDir, { recursive: true, force: true })))
  })

  it('1. Alice creates a private group', async () => {
    groupId = await alice.workspace.groups.createGroup('Secret Club', 'private', false)
    expect(groupId).toBeTruthy()
    const doc = alice.workspace.groups.getGroupDocument(groupId)
    expect(doc.metadata.name).toBe('Secret Club')
    expect(doc.members).toContain(alice.identity.getPeerId())
  })

  it('2. Alice invites Bob; Bob accepts', async () => {
    const bobPeerId = bob.identity.getPeerId()
    const bobPublicKey = bob.identity.getPublicKey()

    await alice.workspace.groups.inviteMember(groupId, bobPeerId, bobPublicKey)

    // Simulate Bob receiving and accepting the invite:
    // In a real scenario the pubsub DM delivers the payload; here we copy it directly.
    const groupKey = alice.workspace.groups.getGroupKey(groupId)!
    const alicePublicKey = alice.identity.getPublicKey()

    // Bob imports the key directly (simulates acceptInvite after DM receipt)
    bob.workspace.groups.importGroupKey(groupId, groupKey)

    // Bob retrieves the group document (alice already synced it in-process)
    alice.workspace.getRepo().importKey(groupId, groupKey)
    bob.workspace.getRepo().importKey(groupId, groupKey)

    // Copy the automerge doc across nodes (simulates CRDT sync)
    const aliceDoc = alice.workspace.getDocument(groupId)
    await bob.workspace.createDocument(aliceDoc) // seeded copy
    bob.workspace.getRepo().importKey(groupId, groupKey)

    // Add Bob to members in Alice's copy
    await alice.workspace.updateDocument(groupId, (doc: any) => {
      if (!doc.members.includes(bobPeerId)) doc.members.push(bobPeerId)
      const memberRole = doc.roles['member']
      if (memberRole && !memberRole.members.includes(bobPeerId)) {
        memberRole.members.push(bobPeerId)
      }
    })
  })

  it('3. Bob can view_doc, Charlie cannot', async () => {
    const bobId = bob.identity.getPeerId()
    const charlieId = charlie.identity.getPeerId()

    const bobCan = await alice.workspace.permissions.canPerform(bobId, groupId, 'view_doc')
    const charlieCan = await alice.workspace.permissions.canPerform(charlieId, groupId, 'view_doc')

    expect(bobCan).toBe(true)
    expect(charlieCan).toBe(false)
  })

  it('4. Alice changes view_doc to a voting holder', async () => {
    const aliceId = alice.identity.getPeerId()

    await alice.workspace.permissions.updatePermission(
      groupId,
      'view_doc',
      [{ type: 'vote', condition: { quorumType: 'percentage', threshold: 0.5 } }],
      [],
    )

    // After the change, even Alice (not an admin in the vote sense) returns false
    // because VotingCondition evaluation is deferred to Step 3.
    // Alice IS an administrator, so she bypasses this — but per spec the vote
    // holder type returns false for non-admins. Let's check Bob (member only):
    const bobId = bob.identity.getPeerId()
    const bobCan = await alice.workspace.permissions.canPerform(bobId, groupId, 'view_doc')
    expect(bobCan).toBe(false)
  })

  it('5. Alice sets changeRule of view_doc to admin-only; Bob cannot change it', async () => {
    // Alice resets changeRule to admin role only
    await alice.workspace.permissions.updatePermission(
      groupId,
      'view_doc',
      [{ type: 'vote', condition: { quorumType: 'percentage', threshold: 0.5 } }],
      [{ type: 'role', roleId: 'admin' }],
    )

    const bobId = bob.identity.getPeerId()
    const bobCanChange = await alice.workspace.permissions.canChangePermission(bobId, groupId, 'view_doc')
    expect(bobCanChange).toBe(false)

    const aliceId = alice.identity.getPeerId()
    const aliceCanChange = await alice.workspace.permissions.canChangePermission(aliceId, groupId, 'view_doc')
    expect(aliceCanChange).toBe(true)
  })
})
