import type { Article, Faq, Step } from './types'

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

/**
 * A step body in the ONE form the editor and the reader both mean.
 *
 * The pipeline writes `body_text` as PLAIN PROSE — Gemini returns "one or two sentences"
 * and worker/pipeline.py stores that string as-is. TipTap is an HTML editor, so the instant
 * the editor mounts it parses that string into a paragraph and starts reporting
 * `<p>…</p>`. Nothing a human did; the two layers just disagree about what an empty
 * document looks like.
 *
 * That disagreement was visible as a lie: the article list compared the RAW rows and said
 * "4 unpublished edits", the editor compared TipTap's normalised copy and said the article
 * was clean, and opening the article silently rewrote four step rows. A count that changes
 * because you looked at it is worse than no count.
 *
 * So both sides are canonicalised before they are compared, and `publishSnapshot` freezes
 * the canonical form too — which is also what stops a bare-prose step reaching the reader
 * as an unwrapped text node with no paragraph spacing.
 *
 * Escaping happens ONLY on the wrap path, and that is deliberate: a string that is already
 * markup is passed through untouched, and a string that is prose is turned into HTML the
 * way turning prose into HTML actually works. TipTap escapes the same three characters.
 *
 * KNOWN LIMIT: TipTap splits blank-line-separated prose into several paragraphs, and this
 * makes one. Pipeline bodies are one or two sentences on a single line, so the case does not
 * arise today; if it starts to, this is the function to teach about `\n\n`.
 */
export function canonicalBody(html: string): string {
  const s = html ?? ''
  // Already markup — leave it exactly as it is. Re-serialising authored HTML here would
  // make the comparison lie in the other direction.
  if (/^\s*</.test(s)) return s
  if (s.trim() === '') return ''
  return `<p>${s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
}

// Article links are REWRITTEN at publish (lib/articleLinks.ts): the draft carries whatever
// slug was current when the link was made, the published copy carries the slug the target
// has now. Compared literally, an article that links to another article is dirty forever —
// the badge shows a count nothing can clear and "Publish changes" never goes away.
//
// So an article link's href is not compared. `data-article-id` is, and it is the field that
// actually says where the link points; the href is derived from it. A link whose target was
// DELETED still registers, because publish unwraps that anchor entirely and the tag goes
// away — which is a real difference a reader would see.
//
// A string replace, not DOMParser, because this module has no runtime imports and is run
// directly under node (checks/pendingEdits.check.ts). TipTap always emits double-quoted
// attributes, so the tag-level match is exact enough for a comparison key.
const linkAgnostic = (html: string): string =>
  !html || !html.includes('data-article-id')
    ? (html ?? '')
    : html.replace(/<a\b[^>]*>/gi, (tag) =>
        tag.includes('data-article-id') ? tag.replace(/\shref="[^"]*"/i, '') : tag,
      )

// The comparison key for any rich-text body: canonical block form, then link-agnostic. Used
// for step bodies and FAQ answers alike, so the two can never drift apart.
const bodyKey = (html: string): string => linkAgnostic(canonicalBody(html))

// Order matters (it is the reader's order) and `id` is part of the identity, so the whole
// array is one key rather than a per-row diff. A FAQ edit of any kind is ONE pending edit:
// the number means "how far ahead is the draft", and six reworded answers are still one
// section of the page that differs.
const faqsKey = (faqs: Faq[] | undefined): string =>
  JSON.stringify((faqs ?? []).map((f) => [f.id, f.q, bodyKey(f.a)]))

export function pendingEditCount(
  published: Article | null,
  title: string,
  subtitle: string,
  steps: StepLite[],
  faqs: Faq[] = [],
): number {
  if (!published) return 0
  let n = 0
  if ((published.title ?? '') !== title) n += 1
  if ((published.subtitle ?? '') !== subtitle) n += 1
  // Absent (pre-0037 snapshot), null and [] all mean "no questions", and none of the three
  // may register as an edit against a draft that also has none.
  if (faqsKey(published.faqs) !== faqsKey(faqs)) n += 1
  const byNum = new Map(published.steps.map((s) => [s.step_number, s]))
  for (const s of steps) {
    const p = byNum.get(s.step_number)
    if (
      !p ||
      p.heading !== s.heading ||
      // Through canonicalBody AND linkAgnostic, for the same reason in both cases: neither
      // difference was made by a person. canonicalBody settles pipeline prose vs TipTap's
      // `<p>` wrapper; linkAgnostic settles a publish-rewritten article href against the
      // draft-time one. Compared literally, either one makes a step dirty forever.
      bodyKey(p.body_text) !== bodyKey(s.body_text) ||
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
