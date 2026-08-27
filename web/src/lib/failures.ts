import { MAX_VIDEO_MINUTES } from './config'

// The failure taxonomy, SPA side. MIRRORS the codes in worker/failures.py — same list,
// same spelling. The worker owns classification; this file owns nothing but the words.
//
// `failure_detail` is deliberately absent and unreachable: migration 0020 revokes the
// column from anon and authenticated, so the SPA cannot render a raw exception even if a
// future select asks for one. The CODE is the whole contract.
//
// Three rules these screens hold, in order of how much damage breaking them does:
//
//   1. Never blame the user's file when it's ours. A user who believes their recording is
//      bad re-records it, fails again, and leaves. Only `video_unreadable` and
//      `video_too_long` are about their file; everything else says so explicitly.
//   2. Recovery never requires re-uploading — the recording is still in Storage for 7 days
//      and `retry` re-runs from it.
//   3. Every screen carries the job id, so support never has to ask "can you send me the
//      link?" — the largest per-ticket cost at this volume.

export type Recovery =
  | 'retry' //     re-run from the stored recording; no file, no upload
  | 'reupload' //  the recording itself is the problem
  | 'trim' //      too long: shorten it first
  | 'support' //   nothing the user can do alone

export type Failure = {
  heading: string
  body: string
  recovery: Recovery
}

export const FAILURES: Record<string, Failure> = {
  video_unreadable: {
    heading: "We couldn't read this recording",
    body: "It may be corrupted, or the upload didn't finish.",
    recovery: 'reupload',
  },
  video_too_long: {
    heading: 'That recording is too long',
    body: `Recordings up to ${MAX_VIDEO_MINUTES} minutes for now.`,
    recovery: 'trim',
  },
  model_unavailable: {
    heading: 'Our processing service is busy right now',
    body: "Your recording is safe — nothing's wrong with your file.",
    recovery: 'retry',
  },
  model_bad_output: {
    heading: 'Something went wrong while building your article',
    body: "This one's on us.",
    recovery: 'retry',
  },
  model_blocked: {
    heading: "We couldn't process this recording",
    body: "Get in touch and we'll take a look.",
    recovery: 'support',
  },
  frame_extraction_failed: {
    heading: 'Something went wrong while capturing screenshots',
    body: "This one's on us.",
    recovery: 'retry',
  },
  timeout: {
    heading: 'This took longer than expected',
    body: 'Your recording is safe.',
    recovery: 'retry',
  },
  // Waited for a free slot and never got one (slice 3i). Deliberately NOT worded as a
  // failure, because nothing failed: no work was attempted and nothing was spent. It is
  // its own code rather than `timeout` or `internal_error` because both of those tell the
  // user something went wrong on our end, and the honest statement here is "it never ran".
  never_started: {
    heading: 'This one never got started',
    body: 'It was waiting behind your other recordings for too long. Nothing was used up — start it again whenever you like.',
    recovery: 'retry',
  },
  spend_cap: {
    heading: "We've hit a temporary processing limit",
    body: "Nothing's wrong with your file — try again shortly.",
    recovery: 'retry',
  },
  // Not in the spec's table. Anything unclassified lands here rather than nowhere: a code
  // the SPA can't name is how the stuck spinner comes back. Same "on us" copy, because
  // that is what an unexpected exception on our side is.
  internal_error: {
    heading: 'Something went wrong while building your article',
    body: "This one's on us.",
    recovery: 'retry',
  },
  // Past the 7-day window: the retention sweep has collected the recording, so there is
  // nothing left to re-run. Not an error — a clean state with one clear action.
  video_purged: {
    heading: 'This recording is no longer stored',
    body: 'We delete recordings after a week. Upload it again and we’ll rebuild the article.',
    recovery: 'reupload',
  },
}

// An unknown code (an older worker, a code added ahead of a deploy) must still render a
// real screen with a real way out — never a blank card.
export function failureFor(code: string | null | undefined): Failure {
  return FAILURES[code ?? ''] ?? FAILURES.internal_error
}

// `quota_exceeded` is NOT in the map on purpose. It is not a failure and must never render
// as one — it is the upgrade modal (pricing-spec §7).
export const QUOTA_EXCEEDED = 'quota_exceeded'

// Neither is `recheck_busy`. "Check the recording" has a per-article rate limit that normal
// use never touches (PRD §6.3), and hitting it is not a failure of the article or of the
// run — it is one action asked for too fast. It renders as a line on the step, and it names
// no number: a countdown would be the second meter PRD §8 forbids.
export const RECHECK_BUSY = 'recheck_busy'
export const RECHECK_BUSY_MESSAGE = 'Give that a moment and try again.'

// Nor is `steer_empty`. An instruction field with nothing in it is not a failure of
// anything — it is a form that has not been filled in, and the field says so where the
// user is already looking. The button is disabled long before this can fire; the code
// exists because the worker refuses server-side too, and the SPA is not a validator.
export const STEER_EMPTY = 'steer_empty'

// --- Degraded runs (CLAUDE.md §10g) ---------------------------------------------
// A degraded run SHIPPED an article and counted against quota. These are not failures and
// share nothing with the map above: no heading, no recovery, no screen. One sentence, in a
// dismissible line at the top of the editor.
//
// They existed only in `jobs.degraded` and rendered NOWHERE, so a frames_partial article
// opened looking perfectly healthy and the user found the gap themselves — usually by
// opening a frame picker that came back empty.
//
// Each sentence names what is missing and what to do about it, in that order, because the
// second half is the only part that changes what the person does next. Codes mirror
// worker/failures.py DEGRADED_*.
export const DEGRADED: Record<string, string> = {
  frames_partial:
    "Some screenshots couldn't be captured from this recording. You can upload your own image on any step.",
  stage2_failed:
    "The final wording pass didn't run, so some steps may read rougher than usual. Edit any step to fix it.",
}

// `degraded` is a comma-separated list — a run can lose both. Unknown codes are dropped
// rather than rendered raw: a column value is not a sentence.
export function degradedNotice(degraded: string | null | undefined): string | null {
  const lines = (degraded ?? '')
    .split(',')
    .map((c) => DEGRADED[c.trim()])
    .filter(Boolean)
  return lines.length ? lines.join(' ') : null
}
