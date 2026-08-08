import type { Visibility } from './types'

// ONE answer to "what is this article doing right now", computed in one place and read by
// every surface that needs it: the editor's lock, the status pill, the build bar, the
// article-list row. Before this, "is a run in flight" was re-derived per component —
// `article.status === 'generating'` here, `status === 'running'` there, a badge switch in
// the list — and the three disagreed, which is how Publish stayed enabled through a run and
// "Draft" ended up covering both halves of the wait.
//
// It is deliberately NOT a hook and holds no state: the inputs are already on rows the
// callers have. Adding an affordance means reading this value, never adding a fourth check.
export type ArticleState = 'building' | 'ready' | 'published'

export function articleState(
  // Null before Stage 1 writes the row — the first ~15s of a run, where a job id is the
  // only evidence anything is happening.
  article: { status: 'generating' | 'ready'; visibility: Visibility } | null,
  runInFlight = false,
): ArticleState {
  if (!article) return runInFlight ? 'building' : 'ready'
  // `status` is the PIPELINE lifecycle and reaches a terminal value on every path,
  // including failure (worker fail() writes 'ready' whenever an article exists). So a
  // dead run un-locks the editor rather than stranding it — CLAUDE.md §10g.
  if (article.status === 'generating') return 'building'
  return article.visibility === 'draft' ? 'ready' : 'published'
}

// How much of the guide is finished, counted — never estimated, never timed.
//
// The unit is a step that is DONE, and done means text AND its screenshot. That is not the
// same as "steps written", and the difference is the whole reason this function exists:
// worker/pipeline.py inserts EVERY step row in one batch at the end of Stage 1
// (`_insert_steps`), so the document goes from zero steps to all N in a single poll tick.
// A bar counting rows would sit at 0 for forty seconds, snap to full, and stay full through
// the capture pass and Stage 2 — full while half the run is still going. Frames land one at
// a time (`_set_screenshot`, one write per frame), so they are the only thing about a run
// that actually moves.
//
// `total` of 0 means the blueprint has not landed. The caller runs INDETERMINATE and shows
// no denominator: inventing one before Stage 1 has spoken is the timer-driven lie
// LEARNINGS #3 exists to forbid.
export function buildProgress(steps: { screenshot_url: string | null }[]) {
  return { done: steps.filter((s) => s.screenshot_url).length, total: steps.length }
}
