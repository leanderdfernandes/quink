// Holds the recording + context across the OAuth redirect.
//
// The account wall fires BEFORE generation, and Google OAuth is a full page redirect —
// so a File in React state does not survive it. The alternatives were worse:
//   - upload to Storage pre-auth  -> needs an anonymous-write bucket, the exact abuse
//                                    vector the wall exists to close.
//   - localStorage                -> strings only; a 100MB video is not going in there.
// IndexedDB stores the File/Blob natively and survives the redirect. Native API, no
// library — it's one object store with one record.

const DB_NAME = 'quink'
const STORE = 'pending'
const KEY = 'upload'

type Pending = { file: File; context: unknown }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const savePending = (p: Pending) => tx<void>('readwrite', (s) => s.put(p, KEY))
export const loadPending = () => tx<Pending | undefined>('readonly', (s) => s.get(KEY))
export const clearPending = () => tx<void>('readwrite', (s) => s.delete(KEY))
