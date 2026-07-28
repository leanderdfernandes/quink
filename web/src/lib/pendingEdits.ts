import type { Article, Step } from './types'

// How far a draft is ahead of what readers see.
//
// ONE derivation, called by the editor's status pill AND the article list's "N unpublished
// edits" badge. Two counts of the same thing that can disagree is worse than not showing
// the number at all — so this lives in its own module with no runtime imports, which is
// also what makes it directly runnable (see pendingEdits.check.ts).

// A step as far as publishing and the edit count are concerned. The editor holds full
// StepRows; the article list reads only these four columns for every article in the KB.
export type StepLite = Pick<Step, 'step_number' | 'heading' | 'body_text' | 'screenshot_url'>

export function pendingEditCount(
  published: Article | null,
  title: string,
  subtitle: string,
  steps: StepLite[],
): number {
  if (!published) return 0
  let n = 0
  if ((published.title ?? '') !== title) n += 1
  if ((published.subtitle ?? '') !== subtitle) n += 1
  const byNum = new Map(published.steps.map((s) => [s.step_number, s]))
  for (const s of steps) {
    const p = byNum.get(s.step_number)
    if (
      !p ||
      p.heading !== s.heading ||
      p.body_text !== s.body_text ||
      p.screenshot_url !== s.screenshot_url
    ) {
      n += 1
    }
  }
  // Steps the draft has dropped. They are still live for readers, so each one is an edit
  // waiting to be published.
  n += Math.max(0, published.steps.length - steps.length)
  return n
}
