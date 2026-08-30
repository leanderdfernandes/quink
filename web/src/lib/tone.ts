// Tone of voice, in its own module for one reason: lib/config.ts reads import.meta.env and
// THROWS at load unless VITE_APP_ENV is set (§10m's second net), so nothing outside a Vite
// build can import it. These four exports are pure and have no environment at all, which is
// what lets checks/context.check.ts run the real round trip rather than regex the source.
// The two CAPS stay in config.ts, where every other limit lives.

// TONE, BACK FROM THE DEAD (migration 0048). PRD §4 cut audience and tone in 0044 as "a v1
// leftover that moves voice, not accuracy". That is superseded by an explicit decision: the
// two are back, as two labelled ranges rather than the v1 free-text dropdowns, and the
// Settings screen shows a sample sentence rewriting itself so the control is never abstract.
//
// STORED AS THE LABEL, e.g. "Neutral · Balanced". The worker already reads
// `product.tone` as a string (worker/prompts.build_context_block) and drops the line when
// it is empty, so nothing in the pipeline changes — and the stored value is self-describing
// English rather than two integers a prompt would have to be taught to interpret.
export const TONE_VOICE = ['Formal', 'Neutral', 'Warm', 'Casual'] as const
export const TONE_DETAIL = ['Brief', 'Balanced', 'Thorough'] as const
// Index 1 of each: the value a KB that has never touched the control writes, and the one
// the sample opens on.
export const TONE_DEFAULT: [number, number] = [1, 1]

export const toneLabel = (voice: number, detail: number) =>
  `${TONE_VOICE[voice] ?? TONE_VOICE[1]} · ${TONE_DETAIL[detail] ?? TONE_DETAIL[1]}`

// Parse back for the sliders. Anything unrecognised — an empty string, a value written by
// an older client, a hand-edited row — falls back to the default rather than throwing: this
// runs on every render of two screens and a bad parse must not be able to blank the page.
export function toneIndices(tone: string | null | undefined): [number, number] {
  const [v, d] = (tone ?? '').split('·').map((x) => x.trim())
  const vi = TONE_VOICE.indexOf(v as (typeof TONE_VOICE)[number])
  const di = TONE_DETAIL.indexOf(d as (typeof TONE_DETAIL)[number])
  return [vi === -1 ? TONE_DEFAULT[0] : vi, di === -1 ? TONE_DEFAULT[1] : di]
}
