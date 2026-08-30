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
const HELD_KEY = 'held'

// `extra` records how many OTHER files were dropped alongside this one. Only the first
// crosses the account wall — holding several hundred megabytes through an OAuth round trip
// to save one drag is not a trade worth making — so the number exists to tell the user
// what did not come with them, rather than to silently lose it.
// `persistProduct` travels with the file because it is decided on the upload screen, on the
// far side of the redirect, and cannot be re-derived afterwards without getting it wrong —
// see the resume path in App.tsx. Optional so a blob written before it existed still loads.
type Pending = { file: File; context: unknown; extra?: number; persistProduct?: boolean }

// A recording the user chose while over quota (slice 3e). It is refused CLIENT-SIDE, before
// the upload: no Storage object, no jobs row, no run consumed. That is not only politeness —
// uploadVideo runs before POST /api/generate and jobs.video_path is only written at insert,
// so a 402 today strands an object in Storage that nothing in the database names. Five
// queued files with three refused would strand three, per attempt.
//
// Same object store as the auth round-trip above, deliberately: IndexedDB is already the
// one place this app keeps a File, and a second mechanism would be a second thing to keep
// in sync with sign-out (see clearPending's call site in App.signOut).
export type HeldFile = {
  id: string
  file: File
  name: string
  recording: string
  savedAt: number
}

// Three, and the UI says so. Held files live in this browser's IndexedDB and nowhere else,
// so an uncapped list is a promise we cannot keep across devices — and the copy has to lead
// with that (someone who upgrades on their phone and finds an empty dock stops trusting the
// product at the exact moment they paid).
export const MAX_HELD_FILES = 3

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

export const saveHeld = (list: HeldFile[]) =>
  tx<void>('readwrite', (s) => s.put(list.slice(0, MAX_HELD_FILES), HELD_KEY))
export const loadHeld = async (): Promise<HeldFile[]> =>
  (await tx<HeldFile[] | undefined>('readonly', (s) => s.get(HELD_KEY))) ?? []
export const clearHeld = () => tx<void>('readwrite', (s) => s.delete(HELD_KEY))
