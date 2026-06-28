// Browser stub for @automerge/automerge-repo-storage-nodefs.
// The real package uses Node.js fs APIs which don't exist in browsers.
// The app never reaches this path because getStorageAdapter() uses IndexedDB for 'browser' platform.
export class NodeFSStorageAdapter {
  constructor() { throw new Error('NodeFSStorageAdapter is not available in browser') }
  load(): never { throw new Error('not implemented') }
  save(): never { throw new Error('not implemented') }
  remove(): never { throw new Error('not implemented') }
  loadRange(): never { throw new Error('not implemented') }
}
