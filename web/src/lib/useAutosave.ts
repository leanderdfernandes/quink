import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Debounced autosave. The editor should disappear (CLAUDE.md §2) — no Save button, just
// a quiet "Saved". Coalesces rapid edits into one write, and always flushes the latest
// pending change on unmount so navigating away can't drop an edit.
//
// PENDING WRITES ARE KEYED, AND THE KEY IS THE WHOLE POINT. This used to hold ONE pending
// job, so a second schedule() inside the debounce window silently replaced the first: edit
// step 1's body, click into step 7 within 700ms, and step 1's write never happened. The
// editor kept the new text (setSteps is synchronous), the database kept the old one, and
// nothing said so.
//
// That divergence is what publishing then froze — publish builds its snapshot from the
// editor's state while the article list compares the DATABASE rows against it — so the
// visible symptom was an article reporting "2 unpublished edits" that no edit could clear
// and no republish was offered for. Observed live on 2026-08-30: two hand-edited steps
// whose stored body_text was one keystroke behind what had been published.
//
// A key is "which target and which columns", so an edit only ever supersedes ITSELF.
// Typing in one field still coalesces to one write; two fields no longer evict each other.

const DEBOUNCE_MS = 700

export function useAutosave() {
  const [state, setState] = useState<SaveState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Insertion-ordered, so writes land in the order they were made.
  const pending = useRef<Map<string, () => Promise<void>>>(new Map())

  // SEQUENTIAL, never concurrent: every write claims the article row on its `updated_at`
  // (CLAUDE.md §10k), so two claims in flight at once would make the second lose a race
  // with the first and report a conflict against the user's own keystroke.
  //
  // A throw stops the rest, deliberately. The one error that reaches here is the stale-write
  // refusal, and §10k says a refused save is refused whole — nothing merged, nothing retried,
  // the text stays in the editor until the user chooses.
  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (!pending.current.size) return
    setState('saving')
    try {
      for (const [key, job] of [...pending.current]) {
        // Taken before it runs, so a flush racing the debounce timer cannot run it twice.
        pending.current.delete(key)
        await job()
      }
      setState('saved')
    } catch {
      setState('error')
    }
  }, [])

  const schedule = useCallback(
    (key: string, save: () => Promise<void>) => {
      pending.current.set(key, save)
      setState('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, DEBOUNCE_MS)
    },
    [flush],
  )

  // Flush every pending edit if the component unmounts mid-debounce.
  useEffect(() => {
    return () => {
      void flush()
    }
  }, [flush])

  return { state, schedule, flush }
}
