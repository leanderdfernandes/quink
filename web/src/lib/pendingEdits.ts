import type { Article, Step } from './types'

// How far a draft is ahead of what readers see.
//
// ONE derivation, called by the editor's status pill AND the article list's "N unpublished
// edits" badge. Two counts of the same thing that can disagree is worse than not showing
// the number at all — so this lives in its own module with no runtime imports, which is
// also what makes it directly runnable (see pendingEdits.check.ts).

// A step as far as publishing, duplicating and the edit count are concerned. The editor
// holds full StepRows; the article list reads these columns for every article in the KB.
//
// is_edited and timestamp_seconds are here for duplicateArticle, which rebuilds rows from
// this shape and silently dropped both for as long as it has existed — the first let a
// pipeline re-run overwrite a human-chosen frame on the copy (CLAUDE.md §8), the second
// blanked the copy's frame-picker marker. They are not read by pendingEditCount.
export type StepLite = Pick<
  Step,
  'step_number' | 'heading' | 'body_text' | 'screenshot_url' | 'annotations'
> & {
  is_edited?: boolean
  timestamp_seconds?: number | null
}

// Stable stringification. `annotations` is an ordered array we write whole, so JSON order
// is the insertion order on both sides and this comparison is honest.
const annotationsKey = (a: unknown): string => JSON.stringify(a ?? [])

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
      p.screenshot_url !== s.screenshot_url ||
      // Annotations are an edit like any other. Left out, an annotated article reports
      // itself CLEAN: the status pill says nothing to publish, the list badge shows no
      // count, and "Publish changes" never appears — so the work silently never reaches
      // a reader. Compared by value because the shapes are small and a shape moved by a
      // pixel is a real difference the user can see.
      annotationsKey(p.annotations) !== annotationsKey(s.annotations)
    ) {
      n += 1
    }
  }
  // Steps the draft has dropped. They are still live for readers, so each one is an edit
  // waiting to be published.
  n += Math.max(0, published.steps.length - steps.length)
  return n
}
