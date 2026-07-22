import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Debounced autosave. The editor should disappear (CLAUDE.md §2) — no Save button, just
// a quiet "Saved". Coalesces rapid edits into one write, and always flushes the latest
// pending change on unmount so navigating away can't drop an edit.

const DEBOUNCE_MS = 700

export function useAutosave() {
  const [state, setState] = useState<SaveState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<(() => Promise<void>) | null>(null)

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const job = pending.current
    if (!job) return
    pending.current = null
    setState('saving')
    try {
      await job()
      setState('saved')
    } catch {
      setState('error')
    }
  }, [])

  const schedule = useCallback(
    (save: () => Promise<void>) => {
      pending.current = save
      setState('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, DEBOUNCE_MS)
    },
    [flush],
  )

  // Flush the last pending edit if the component unmounts mid-debounce.
  useEffect(() => {
    return () => {
      if (pending.current) void pending.current()
    }
  }, [])

  return { state, schedule, flush }
}
