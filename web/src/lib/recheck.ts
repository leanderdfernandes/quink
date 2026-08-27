import { supabase } from './supabase'
import { WORKER_URL } from './config'
import { RECHECK_BUSY, RECHECK_BUSY_MESSAGE } from './failures'

// "Check the recording" (PRD "Context & AI Editing" §6.3) — the hero edit.
//
// It re-reads the SOURCE VIDEO for one step's few seconds and comes back with two lines a
// general chat model cannot produce: the timestamp range, and what was actually observed
// there. That is the whole differentiator — everything else in the editor is commodity text
// rewriting, and the journey map has the user asking whether they should just use another
// LLM. For this one, the honest answer is no.
//
// NOTHING HERE WRITES. The result is a proposal the caller renders as a diff card with
// `Keep` and `Discard`. There is no silent-write path anywhere in this feature.

export type RecheckResult = {
  // The step already says what the recording shows. Rendered as a short confirmation with
  // the observation, not as an empty diff — "it's already right" is a useful answer and
  // deserves to look like one.
  no_change: boolean
  proposed_text: string
  // What was on screen in those seconds. THE line that carries our authority, which is why
  // the worker rejects a response that omits it rather than shipping the correction alone.
  observed: string
  window: { from: string; to: string }
}

export class RecheckBusy extends Error {
  constructor() {
    super(RECHECK_BUSY_MESSAGE)
  }
}

export async function recheckStep(
  articleId: string,
  stepNumber: number,
): Promise<RecheckResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const res = await fetch(`${WORKER_URL}/api/recheck`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ article_id: articleId, step_number: stepNumber }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (data?.detail?.code === RECHECK_BUSY) throw new RecheckBusy()
    throw new Error(
      data?.detail?.message ?? "I couldn't read that part of the recording just now.",
    )
  }
  return data as RecheckResult
}
